import "server-only";
import { getGoogleAccessToken } from "@/lib/google/connection";
import { appendRows, batchUpdateValues, colLetter, getAllValues } from "@/lib/google/sheets";
import { autoMapHeaders, locateHeader, PULSE_ID_HEADER, VISIT_FIELDS, type VisitField } from "@/lib/google/visit-sheet";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTimeIn } from "@/lib/time";
import { VISIT_STAGES, visitStageOf } from "@/lib/visits";

const MAX_ROWS = 2000;

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type Appt = {
  id: string;
  member_id: string | null;
  client_name: string;
  client_phone: string | null;
  scheduled_at: string;
  status: string;
  visit_stage: string | null;
  region: string | null;
};

/**
 * Manda as visitas do sistema para a planilha (backfill e atualização).
 * Acha a linha de títulos sozinho (ela não precisa ser a primeira), casa cada
 * visita pela coluna "ID Pulse" (ou adota uma linha por telefone+dia+hora), e
 * escreve só nas colunas conhecidas, preservando o resto da planilha.
 */
export async function syncVisitsToSheet(orgId: string): Promise<{ pushed: number } | { error: string }> {
  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("sheet_connections")
    .select("spreadsheet_id, sheet_title, enabled")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!conn?.spreadsheet_id || !conn.enabled) return { error: "sem-planilha" };

  const token = await getGoogleAccessToken(orgId);
  if (!token) return { error: "sem-token" };

  const spreadsheetId = conn.spreadsheet_id as string;
  const sheetTitle = (conn.sheet_title as string) || "Página1";

  const { data: org } = await admin.from("organizations").select("timezone").eq("id", orgId).maybeSingle();
  const tz = (org?.timezone as string) || "America/Sao_Paulo";

  const grid = await getAllValues(token, spreadsheetId, sheetTitle);
  const found = locateHeader(grid);
  if (!found) return { error: "sem-cabecalho" };

  const headerRowNum = found.index + 1; // linha (1-based) dos títulos
  const headers = found.headers;
  const colMap = autoMapHeaders(headers);
  const dataRows = grid.slice(found.index + 1);
  const dataStartRow = found.index + 2; // 1ª linha de dados

  // Garante as colunas que o Pulse controla: Situação e ID Pulse.
  const headerWrites: { range: string; values: string[][] }[] = [];
  let nextCol = headers.length;
  let statusCol = colMap.status ?? -1;
  if (statusCol < 0) {
    statusCol = nextCol++;
    headerWrites.push({ range: `${sheetTitle}!${colLetter(statusCol)}${headerRowNum}`, values: [["Situação"]] });
  }
  let pulseCol = headers.findIndex((h) => h.trim() === PULSE_ID_HEADER);
  if (pulseCol < 0) {
    pulseCol = nextCol++;
    headerWrites.push({ range: `${sheetTitle}!${colLetter(pulseCol)}${headerRowNum}`, values: [[PULSE_ID_HEADER]] });
  }

  const weekday = (iso: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: tz }).format(new Date(iso)).toUpperCase();

  const { data: apptData } = await admin
    .from("appointments")
    .select("id, member_id, client_name, client_phone, scheduled_at, status, visit_stage, region")
    .eq("org_id", orgId)
    .order("scheduled_at", { ascending: false })
    .limit(MAX_ROWS);
  const appts = (apptData ?? []) as Appt[];

  const memberIds = [...new Set(appts.map((a) => a.member_id).filter((x): x is string => Boolean(x)))];
  const { data: memberData } = memberIds.length
    ? await admin.from("members").select("id, display_name").in("id", memberIds)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((memberData ?? []).map((m) => [m.id as string, m.display_name as string]));

  const valueFor = (field: VisitField, a: Appt): string => {
    switch (field) {
      case "client_name":
        return a.client_name ?? "";
      case "client_phone":
        return a.client_phone ?? "";
      case "date":
        return weekday(a.scheduled_at);
      case "time":
        return formatTimeIn(a.scheduled_at, tz);
      case "region":
        return a.region ?? "";
      case "broker":
        return (a.member_id && nameOf.get(a.member_id)) || "";
      case "status": {
        const st = visitStageOf(a.visit_stage, a.status as never);
        return st ? VISIT_STAGES[st].label : "";
      }
    }
  };
  const colOf = (field: VisitField) => (field === "status" ? statusCol : colMap[field] ?? -1);

  // Índices das linhas existentes (para casar/adotar).
  const rowByPulse = new Map<string, number>();
  const rowByKey = new Map<string, number>();
  dataRows.forEach((r, i) => {
    const rowNum = dataStartRow + i;
    const pid = (r[pulseCol] ?? "").trim();
    if (pid) rowByPulse.set(pid, rowNum);
    const phone = onlyDigits(colMap.client_phone != null ? r[colMap.client_phone] : "");
    const date = (colMap.date != null ? r[colMap.date] : "")?.trim()?.toUpperCase() ?? "";
    const time = (colMap.time != null ? r[colMap.time] : "")?.trim() ?? "";
    if (phone) rowByKey.set(`${phone}|${date}|${time}`, rowNum);
  });

  const width = Math.max(headers.length, statusCol + 1, pulseCol + 1, ...VISIT_FIELDS.map((f) => colOf(f.key) + 1));
  const updates: { range: string; values: string[][] }[] = [...headerWrites];
  const appends: string[][] = [];

  for (const a of appts) {
    let rowNum = rowByPulse.get(a.id) ?? null;
    if (rowNum == null) {
      const key = `${onlyDigits(a.client_phone)}|${weekday(a.scheduled_at)}|${formatTimeIn(a.scheduled_at, tz)}`;
      rowNum = onlyDigits(a.client_phone) ? rowByKey.get(key) ?? null : null;
    }

    if (rowNum != null) {
      for (const f of VISIT_FIELDS) {
        // Não sobrescreve o corretor que a empresa digitou na planilha (a planilha é a dona do corretor).
        if (f.key === "broker") continue;
        const c = colOf(f.key);
        if (c >= 0) updates.push({ range: `${sheetTitle}!${colLetter(c)}${rowNum}`, values: [[valueFor(f.key, a)]] });
      }
      updates.push({ range: `${sheetTitle}!${colLetter(pulseCol)}${rowNum}`, values: [[a.id]] });
    } else {
      const row = new Array<string>(width).fill("");
      for (const f of VISIT_FIELDS) {
        const c = colOf(f.key);
        if (c >= 0) row[c] = valueFor(f.key, a);
      }
      row[pulseCol] = a.id;
      appends.push(row);
    }
  }

  for (const part of chunk(updates, 400)) await batchUpdateValues(token, spreadsheetId, part);
  // Âncora na linha de títulos: o append entra logo após a lista de clientes.
  await appendRows(token, spreadsheetId, `${sheetTitle}!A${headerRowNum}`, appends);
  await admin.from("sheet_connections").update({ last_push_at: new Date().toISOString() }).eq("org_id", orgId);

  // Guarda a foto do que foi escrito (para o pull saber o que mudou depois).
  const now = new Date().toISOString();
  const snapshots = appts.map((a) => ({
    appointment_id: a.id,
    org_id: orgId,
    snapshot: {
      status: valueFor("status", a),
      region: a.region ?? "",
      name: a.client_name ?? "",
      phone: onlyDigits(a.client_phone),
    },
    updated_at: now,
  }));
  for (const part of chunk(snapshots, 500)) await admin.from("sheet_sync_state").upsert(part, { onConflict: "appointment_id" });

  return { pushed: appts.length };
}
