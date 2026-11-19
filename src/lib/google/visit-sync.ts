import "server-only";
import { getGoogleAccessToken } from "@/lib/google/connection";
import { appendRows, batchUpdateValues, colLetter, ensureSheetSize, getAllValues, listSheetTitles } from "@/lib/google/sheets";
import { ARCHIVE_NOTE } from "@/lib/google/visit-import";
import { autoMapHeaders, locateHeader, PULSE_ID_HEADER, VISIT_FIELDS, type VisitField } from "@/lib/google/visit-sheet";
import { syncableMonth, tabWeekStart, weekFromGrid } from "@/lib/google/visit-tabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateIn, formatTimeIn } from "@/lib/time";
import { SHEET_PLACEHOLDER_NAME, startOfVisitWeek, VISIT_STAGES, visitStageOf } from "@/lib/visits";

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
 * Manda as visitas do sistema para a planilha, em TODAS as abas. Cada visita vai
 * para a aba cuja semana contém a data dela (mês da aba + "SEMANA N"). Casa a
 * linha pela coluna "ID Pulse" (ou adota por telefone+dia+hora), escreve só nas
 * colunas conhecidas e não sobrescreve o corretor que a empresa digitou.
 */
export async function syncVisitsToSheet(orgId: string): Promise<{ pushed: number } | { error: string }> {
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

  const apptWeek = new Map(appts.map((a) => [a.id, startOfVisitWeek(dateIn(a.scheduled_at, tz))]));
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

  for (const title of titles) {
    const month = syncableMonth(title);
    if (!month) continue; // só abas de mês normais (ignora arquivos e sem mês)
    const grid = await getAllValues(token, spreadsheetId, title);
    const found = locateHeader(grid);
    if (!found) continue;

    const weekStart = tabWeekStart(month, weekFromGrid(grid), tz);
    const tabAppts = appts.filter((a) => apptWeek.get(a.id) === weekStart);
    if (tabAppts.length === 0) continue;

    const headerRowNum = found.index + 1;
    const headers = found.headers;
    const colMap = autoMapHeaders(headers);
    const dataRows = grid.slice(found.index + 1);
    const dataStartRow = found.index + 2;

    const headerWrites: { range: string; values: string[][] }[] = [];
    let nextCol = headers.length;
    let statusCol = colMap.status ?? -1;
    if (statusCol < 0) {
      statusCol = nextCol++;
      headerWrites.push({ range: `${title}!${colLetter(statusCol)}${headerRowNum}`, values: [["Situação"]] });
    }
    let pulseCol = headers.findIndex((h) => h.trim() === PULSE_ID_HEADER);
    if (pulseCol < 0) {
      pulseCol = nextCol++;
      headerWrites.push({ range: `${title}!${colLetter(pulseCol)}${headerRowNum}`, values: [[PULSE_ID_HEADER]] });
    }
    const colOf = (field: VisitField) => (field === "status" ? statusCol : colMap[field] ?? -1);

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
    const lastDataRow = dataStartRow + dataRows.length + tabAppts.length;
    await ensureSheetSize(token, spreadsheetId, title, width, lastDataRow);

    const updates: { range: string; values: string[][] }[] = [...headerWrites];
    const appends: string[][] = [];

    for (const a of tabAppts) {
      let rowNum = rowByPulse.get(a.id) ?? null;
      if (rowNum == null) {
        const key = `${onlyDigits(a.client_phone)}|${weekday(a.scheduled_at)}|${formatTimeIn(a.scheduled_at, tz)}`;
        rowNum = onlyDigits(a.client_phone) ? rowByKey.get(key) ?? null : null;
      }
      if (rowNum != null) {
        for (const f of VISIT_FIELDS) {
          if (f.key === "broker") continue; // a planilha é a dona do corretor
          const c = colOf(f.key);
          if (c >= 0) updates.push({ range: `${title}!${colLetter(c)}${rowNum}`, values: [[valueFor(f.key, a)]] });
        }
        updates.push({ range: `${title}!${colLetter(pulseCol)}${rowNum}`, values: [[a.id]] });
      } else {
        const row = new Array<string>(width).fill("");
        for (const f of VISIT_FIELDS) {
          const c = colOf(f.key);
          if (c >= 0) row[c] = valueFor(f.key, a);
        }
        row[pulseCol] = a.id;
        appends.push(row);
      }
      snapshots.push({
        appointment_id: a.id,
        org_id: orgId,
        snapshot: { status: valueFor("status", a), region: a.region ?? "", name: a.client_name ?? "", phone: onlyDigits(a.client_phone) },
        updated_at: now,
      });
    }

    for (const part of chunk(updates, 400)) await batchUpdateValues(token, spreadsheetId, part);
    await appendRows(token, spreadsheetId, `${title}!A${headerRowNum}`, appends);
    pushed += tabAppts.length;
  }

  await admin.from("sheet_connections").update({ last_push_at: now }).eq("org_id", orgId);
  for (const part of chunk(snapshots, 500)) await admin.from("sheet_sync_state").upsert(part, { onConflict: "appointment_id" });

  return { pushed };
}
