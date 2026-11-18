"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentMember, isLeader } from "@/lib/auth";
import { getGoogleAccessToken, removeSheetConnection, saveSpreadsheetSelection } from "@/lib/google/connection";
import { firstSheetTitle, getAllValues } from "@/lib/google/sheets";
import { autoMapHeaders, locateHeader, VISIT_FIELDS } from "@/lib/google/visit-sheet";
import { importVisitsFromSheet, matchMember, normalize } from "@/lib/google/visit-import";
import { pullEditsFromSheet } from "@/lib/google/visit-pull";
import { syncVisitsToSheet } from "@/lib/google/visit-sync";
import { describeError, logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireLeader() {
  const me = await getCurrentMember();
  if (me.org.segment !== "brokers" || !isLeader(me.role)) return null;
  return me;
}

/** Desconecta a planilha do Google da empresa (apaga o token do nosso lado). */
export async function disconnectSheets(): Promise<{ error: string } | { ok: true }> {
  const me = await requireLeader();
  if (!me) return { error: "Sem permissão." };
  await removeSheetConnection(me.org.id);
  revalidatePath("/integracoes");
  return { ok: true };
}

/** Access token de curta duração para o Picker abrir os arquivos do Google da empresa. */
export async function getPickerToken(): Promise<{ error: string } | { token: string }> {
  const me = await requireLeader();
  if (!me) return { error: "Sem permissão." };
  try {
    const token = await getGoogleAccessToken(me.org.id);
    if (!token) return { error: "Conecte a conta do Google primeiro." };
    return { token };
  } catch (error) {
    logger.error("google.picker_token", { message: describeError(error), orgId: me.org.id });
    return { error: "Não foi possível falar com o Google. Reconecte a conta." };
  }
}

const selectSchema = z.object({
  spreadsheetId: z.string().min(10).max(200),
  url: z.string().url().max(500),
  name: z.string().max(200).optional(),
});

/** Guarda a planilha escolhida, lê os cabeçalhos e casa as colunas automaticamente. */
export async function connectSpreadsheet(
  input: unknown,
): Promise<{ error: string } | { ok: true; mapped: { label: string; header: string }[]; missing: string[]; pushed: number; imported: number; pending: number }> {
  const me = await requireLeader();
  if (!me) return { error: "Sem permissão." };
  const parsed = selectSchema.safeParse(input);
  if (!parsed.success) return { error: "Planilha inválida." };

  try {
    const token = await getGoogleAccessToken(me.org.id);
    if (!token) return { error: "Conecte a conta do Google primeiro." };

    const sheetTitle = await firstSheetTitle(token, parsed.data.spreadsheetId);
    const grid = await getAllValues(token, parsed.data.spreadsheetId, sheetTitle);
    const found = locateHeader(grid);
    if (!found) return { error: "Não encontrei os títulos (Nome do cliente, Telefone, Corretor...) na planilha. Confira se escolheu a aba certa." };
    const headers = found.headers;
    const columnMap = autoMapHeaders(headers);

    await saveSpreadsheetSelection(me.org.id, {
      spreadsheetId: parsed.data.spreadsheetId,
      url: parsed.data.url,
      title: parsed.data.name ?? "Planilha",
      sheetTitle,
      columnMap: columnMap as Record<string, number>,
    });

    const mapped = VISIT_FIELDS.filter((f) => columnMap[f.key] !== undefined).map((f) => ({ label: f.label, header: headers[columnMap[f.key]!] }));
    const missing = VISIT_FIELDS.filter((f) => columnMap[f.key] === undefined).map((f) => f.label);

    // 1) Puxa as linhas antigas da planilha para o sistema (uma vez).
    let imported = 0;
    let pending = 0;
    const imp = await importVisitsFromSheet(me.org.id);
    if ("error" in imp) logger.warn("google.import", { message: imp.error, orgId: me.org.id });
    else {
      imported = imp.imported;
      pending = imp.pending;
    }

    // 2) Enche/atualiza a planilha com as visitas do sistema (backfill).
    const result = await syncVisitsToSheet(me.org.id);
    if ("error" in result) logger.warn("google.backfill", { message: result.error, orgId: me.org.id });

    revalidatePath("/integracoes");
    return { ok: true, mapped, missing, pushed: "pushed" in result ? result.pushed : 0, imported, pending };
  } catch (error) {
    logger.error("google.connect_sheet", { message: describeError(error), orgId: me.org.id });
    return { error: "Não foi possível ler a planilha. Confira se é uma planilha do Google válida." };
  }
}

export type BrokerName = { name: string; memberId: string | null; auto: boolean };

/** Lista os nomes de corretor da planilha e com quem cada um está casado (pra tela de vínculos). */
export async function getBrokerMapping(): Promise<
  { error: string } | { ok: true; names: BrokerName[]; members: { id: string; name: string }[] }
> {
  const me = await requireLeader();
  if (!me) return { error: "Sem permissão." };
  const admin = createAdminClient();
  const { data: conn } = await admin.from("sheet_connections").select("spreadsheet_id, sheet_title, broker_map").eq("org_id", me.org.id).maybeSingle();
  if (!conn?.spreadsheet_id) return { error: "Escolha uma planilha primeiro." };

  try {
    const token = await getGoogleAccessToken(me.org.id);
    if (!token) return { error: "Reconecte a conta do Google." };
    const grid = await getAllValues(token, conn.spreadsheet_id as string, (conn.sheet_title as string) || "Página1");
    const found = locateHeader(grid);
    if (!found) return { error: "Não achei os títulos na planilha." };
    const colMap = autoMapHeaders(found.headers);
    if (colMap.broker == null) return { error: "A planilha não tem uma coluna de Corretor." };

    const { data: memberData } = await admin.from("members").select("id, display_name").eq("org_id", me.org.id).eq("active", true).order("display_name");
    const memberList = (memberData ?? []).map((m) => ({ id: m.id as string, display_name: m.display_name as string }));
    const members = memberList.map((m) => ({ id: m.id, name: m.display_name }));
    const brokerMap = (conn.broker_map ?? {}) as Record<string, string>;
    const validId = new Set(members.map((m) => m.id));

    const seen = new Set<string>();
    const names: BrokerName[] = [];
    for (const row of grid.slice(found.index + 1)) {
      const nm = (row[colMap.broker] ?? "").trim();
      if (!nm) continue;
      const key = normalize(nm);
      if (seen.has(key)) continue;
      seen.add(key);
      const auto = matchMember(nm, memberList);
      const mapped = brokerMap[key] && validId.has(brokerMap[key]) ? brokerMap[key] : null;
      names.push({ name: nm, memberId: auto ?? mapped ?? null, auto: Boolean(auto) });
    }
    names.sort((a, b) => (a.memberId ? 1 : 0) - (b.memberId ? 1 : 0)); // pendentes primeiro
    return { ok: true, names, members };
  } catch (error) {
    logger.error("google.broker_map", { message: describeError(error), orgId: me.org.id });
    return { error: "Não foi possível ler a planilha. Tente de novo." };
  }
}

/** Salva os vínculos escolhidos e já importa + envia. */
export async function saveBrokerMap(
  entries: unknown,
): Promise<{ error: string } | { ok: true; imported: number; pending: number; pendingNames: string[] }> {
  const me = await requireLeader();
  if (!me) return { error: "Sem permissão." };
  const parsed = z.array(z.object({ name: z.string().min(1).max(120), memberId: z.uuid() })).max(200).safeParse(entries);
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createAdminClient();
  const { data: conn } = await admin.from("sheet_connections").select("broker_map").eq("org_id", me.org.id).maybeSingle();
  const map = { ...((conn?.broker_map ?? {}) as Record<string, string>) };
  for (const e of parsed.data) map[normalize(e.name)] = e.memberId;
  await admin.from("sheet_connections").update({ broker_map: map, updated_at: new Date().toISOString() }).eq("org_id", me.org.id);

  let imported = 0;
  let pending = 0;
  let pendingNames: string[] = [];
  const imp = await importVisitsFromSheet(me.org.id);
  if (!("error" in imp)) {
    imported = imp.imported;
    pending = imp.pending;
    pendingNames = imp.pendingNames;
  }
  await syncVisitsToSheet(me.org.id);
  revalidatePath("/integracoes");
  return { ok: true, imported, pending, pendingNames };
}

/** A planilha manda: aplica os dados da planilha por cima do sistema (sem apagar o que a planilha deixou em branco), importa as novas e reenvia. */
export async function pullAllFromSheet(): Promise<{ error: string } | { ok: true; updated: number; imported: number }> {
  const me = await requireLeader();
  if (!me) return { error: "Sem permissão." };

  let updated = 0;
  const pr = await pullEditsFromSheet(me.org.id, { force: true });
  if ("error" in pr) {
    const msg = pr.error === "sem-planilha" ? "Escolha uma planilha primeiro." : pr.error === "sem-cabecalho" ? "Não achei os títulos na planilha." : "Não foi possível ler a planilha. Reconecte o Google.";
    return { error: msg };
  }
  updated = pr.updated;

  let imported = 0;
  const imp = await importVisitsFromSheet(me.org.id);
  if (!("error" in imp)) imported = imp.imported;

  await syncVisitsToSheet(me.org.id);
  revalidatePath("/integracoes");
  return { ok: true, updated, imported };
}

/** Sincroniza na hora: importa as linhas novas da planilha e envia as do sistema. */
export async function syncNow(): Promise<
  { error: string } | { ok: true; pushed: number; imported: number; pending: number; pendingNames: string[]; importError: string | null }
> {
  const me = await requireLeader();
  if (!me) return { error: "Sem permissão." };

  // 1) Puxa as edições feitas na planilha para o sistema.
  await pullEditsFromSheet(me.org.id);

  let imported = 0;
  let pending = 0;
  let pendingNames: string[] = [];
  let importError: string | null = null;
  const imp = await importVisitsFromSheet(me.org.id);
  if ("error" in imp) importError = imp.error;
  else {
    imported = imp.imported;
    pending = imp.pending;
    pendingNames = imp.pendingNames;
  }

  const result = await syncVisitsToSheet(me.org.id);
  if ("error" in result) {
    const msg = result.error === "sem-planilha" ? "Escolha uma planilha primeiro." : "Não foi possível sincronizar. Reconecte o Google e tente de novo.";
    return { error: msg };
  }
  revalidatePath("/integracoes");
  return { ok: true, pushed: result.pushed, imported, pending, pendingNames, importError };
}
