import "server-only";
import { getGoogleAccessToken } from "@/lib/google/connection";
import { batchUpdateValues, colLetter, getAllValues, listSheetTitles } from "@/lib/google/sheets";
import { ARCHIVE_NOTE } from "@/lib/google/visit-import";
import { autoMapHeaders, locateHeader, VISIT_FIELDS, type VisitField } from "@/lib/google/visit-sheet";
import { syncableMonth } from "@/lib/google/visit-tabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateIn, formatTimeIn, todayIn } from "@/lib/time";
import { SHEET_PLACEHOLDER_NAME, VISIT_STAGES, visitStageOf } from "@/lib/visits";

const MAX_ROWS = 3000;

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
  notes: string | null;
};

/**
 * Atualiza a planilha SEM mudar o padrão dela: não cria coluna (ID Pulse,
 * Situação…), não acrescenta linha e não expande a grade. Só escreve nas
 * colunas que a empresa já tem (exceto corretor, que a planilha manda). Casa
 * a linha por telefone + dia + hora.
 */
export async function syncVisitsToSheet(orgId: string, opts?: { currentOnly?: boolean }): Promise<{ pushed: number } | { error: string }> {
  const admin = createAdminClient();
  const { data: conn } = await admin.from("sheet_connections").select("spreadsheet_id, enabled").eq("org_id", orgId).maybeSingle();
  if (!conn?.spreadsheet_id || !conn.enabled) return { error: "sem-planilha" };

  const token = await getGoogleAccessToken(orgId);
  if (!token) return { error: "sem-token" };
  const spreadsheetId = conn.spreadsheet_id as string;

  const { data: org } = await admin.from("organizations").select("timezone").eq("id", orgId).maybeSingle();
  const tz = (org?.timezone as string) || "America/Sao_Paulo";

  const { data: apptData } = await admin
    .from("appointments")
    .select("id, member_id, client_name, client_phone, scheduled_at, status, visit_stage, region, notes")
    .eq("org_id", orgId)
    .order("scheduled_at", { ascending: false })
    .limit(MAX_ROWS);
  // Visitas de arquivo ("não vieram") ficam só no sistema; não voltam pra planilha.
  const appts = ((apptData ?? []) as Appt[]).filter((a) => a.notes !== ARCHIVE_NOTE);
  if (appts.length === 0) return { pushed: 0 };

  const memberIds = [...new Set(appts.map((a) => a.member_id).filter((x): x is string => Boolean(x)))];
  const { data: memberData } = memberIds.length
    ? await admin.from("members").select("id, display_name").in("id", memberIds)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((memberData ?? []).map((m) => [m.id as string, m.display_name as string]));

  // Preenchimentos do ajuste ("Cliente da planilha…") passam a usar o nome do corretor.
  const renamed = appts.filter((a) => a.client_name === SHEET_PLACEHOLDER_NAME && a.member_id && nameOf.has(a.member_id));
  for (const a of renamed) a.client_name = nameOf.get(a.member_id!)!;
  for (const part of chunk(renamed, 50)) {
    await Promise.all(part.map((a) => admin.from("appointments").update({ client_name: a.client_name }).eq("id", a.id).eq("org_id", orgId)));
  }

  const apptMonth = new Map(appts.map((a) => [a.id, Number(dateIn(a.scheduled_at, tz).slice(5, 7))]));
  const weekday = (iso: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: tz }).format(new Date(iso)).toUpperCase();
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

  const titles = await listSheetTitles(token, spreadsheetId);
  const snapshots: { appointment_id: string; org_id: string; snapshot: object; updated_at: string }[] = [];
  const now = new Date().toISOString();
  let pushed = 0;

  const curMonth = Number(todayIn(tz).slice(5, 7));
  for (const title of titles) {
    const month = syncableMonth(title);
    if (!month) continue;
    if (opts?.currentOnly && month !== curMonth) continue;
    const grid = await getAllValues(token, spreadsheetId, title);
    const found = locateHeader(grid);
    if (!found) continue;

    const tabAppts = appts.filter((a) => apptMonth.get(a.id) === month);
    if (tabAppts.length === 0) continue;

    const colMap = autoMapHeaders(found.headers);
    const dataRows = grid.slice(found.index + 1);
    const dataStartRow = found.index + 2;
    const colOf = (field: VisitField) => colMap[field] ?? -1;

    const rowByKey = new Map<string, number>();
    dataRows.forEach((r, i) => {
      const phone = onlyDigits(colMap.client_phone != null ? r[colMap.client_phone] : "");
      const date = (colMap.date != null ? r[colMap.date] : "")?.trim()?.toUpperCase() ?? "";
      const time = (colMap.time != null ? r[colMap.time] : "")?.trim() ?? "";
      if (phone) rowByKey.set(`${phone}|${date}|${time}`, dataStartRow + i);
    });

    const updates: { range: string; values: string[][] }[] = [];
    for (const a of tabAppts) {
      const key = `${onlyDigits(a.client_phone)}|${weekday(a.scheduled_at)}|${formatTimeIn(a.scheduled_at, tz)}`;
      const rowNum = onlyDigits(a.client_phone) ? rowByKey.get(key) ?? null : null;
      if (rowNum == null) continue; // não cria linha nova: a planilha manda no formato

      for (const f of VISIT_FIELDS) {
        // Corretor: a planilha é a dona. Status: só se a coluna já existir no padrão deles.
        if (f.key === "broker") continue;
        const c = colOf(f.key);
        if (c < 0) continue;
        updates.push({ range: `${title}!${colLetter(c)}${rowNum}`, values: [[valueFor(f.key, a)]] });
      }
      pushed += 1;
      snapshots.push({
        appointment_id: a.id,
        org_id: orgId,
        snapshot: {
          status: colOf("status") >= 0 ? valueFor("status", a) : "",
          region: a.region ?? "",
          name: a.client_name ?? "",
          phone: onlyDigits(a.client_phone),
        },
        updated_at: now,
      });
    }

    for (const part of chunk(updates, 400)) await batchUpdateValues(token, spreadsheetId, part);
  }

  await admin.from("sheet_connections").update({ last_push_at: now }).eq("org_id", orgId);
  for (const part of chunk(snapshots, 500)) await admin.from("sheet_sync_state").upsert(part, { onConflict: "appointment_id" });

  return { pushed };
}
