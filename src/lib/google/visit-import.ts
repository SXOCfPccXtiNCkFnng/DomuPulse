import "server-only";
import { getGoogleAccessToken } from "@/lib/google/connection";
import { ensureClientForVisit, linkOrphanVisitsToClients } from "@/lib/google/visit-clients";
import { getAllValues, listSheetTitles } from "@/lib/google/sheets";
import { autoMapHeaders, locateHeader, PULSE_ID_HEADER } from "@/lib/google/visit-sheet";
import { isArchiveTitle, monthFromTitle, tabWeekStart, weekFromGrid } from "@/lib/google/visit-tabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, dateIn, formatTimeIn, zonedToIso } from "@/lib/time";
import { VISIT_WEEKDAYS } from "@/lib/visits";

const MAX_IMPORT = 500;

// Marcador de visitas vindas das abas de arquivo ("que não vieram"): o push
// ignora essas (são só histórico, não voltam para a planilha).
export const ARCHIVE_NOTE = "Importado da planilha (nao veio)";

export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// "SÁBADO" / "SEGUNDA-FEIRA" -> índice na semana de visitas (quinta a quarta).
const WEEKDAY_INDEX = new Map<string, number>();
VISIT_WEEKDAYS.forEach((w, i) => WEEKDAY_INDEX.set(normalize(w).split("-")[0], i));

const phoneOk = (p: string) => /^[0-9+() -]{8,20}$/.test(p);

/** Normaliza o horário para "HH:MM" (aceita 9:00, 10h00, 10.00). Sem hora válida, usa 09:00. */
function parseTime(raw: string): string {
  const m = raw.match(/(\d{1,2})[:h.](\d{2})/);
  if (!m) return "09:00";
  const h = Math.min(23, Number(m[1]));
  const min = Math.min(59, Number(m[2]));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Acha o corretor pelo nome (casa por palavra). Só aceita se for um único. */
export function matchMember(name: string, members: { id: string; display_name: string }[]): string | null {
  const words = normalize(name).split(/\s+/).filter((w) => w.length >= 3);
  if (!words.length) return null;
  const hits = members.filter((m) => {
    const mwords = normalize(m.display_name).split(/\s+/);
    return words.some((w) => mwords.includes(w));
  });
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * Importa as visitas de TODAS as abas da planilha. A data de cada visita vem da
 * aba: mês (nome da aba) + "SEMANA N" + dia da semana (aproximado). Corretor
 * casado pelo nome ou pelos vínculos; sem corretor único, fica pendente. Cria/
 * liga o cliente na carteira. Linhas com "ID Pulse" e visitas já existentes são
 * puladas (não duplica). Não escreve na planilha.
 */
export async function importVisitsFromSheet(
  orgId: string,
): Promise<{ imported: number; pending: number; pendingNames: string[] } | { error: string }> {
  const admin = createAdminClient();
  const { data: conn } = await admin.from("sheet_connections").select("spreadsheet_id, enabled, broker_map").eq("org_id", orgId).maybeSingle();
  if (!conn?.spreadsheet_id || !conn.enabled) return { error: "sem-planilha" };

  const token = await getGoogleAccessToken(orgId);
  if (!token) return { error: "sem-token" };
  const spreadsheetId = conn.spreadsheet_id as string;

  const { data: org } = await admin.from("organizations").select("timezone").eq("id", orgId).maybeSingle();
  const tz = (org?.timezone as string) || "America/Sao_Paulo";

  const { data: memberData } = await admin.from("members").select("id, display_name").eq("org_id", orgId).eq("active", true);
  const members = (memberData ?? []) as { id: string; display_name: string }[];
  const memberIds = new Set(members.map((m) => m.id));
  const brokerMap = (conn.broker_map ?? {}) as Record<string, string>;
  const mappedMember = (name: string) => {
    const id = brokerMap[normalize(name)];
    return id && memberIds.has(id) ? id : null;
  };

  const cell = (row: string[], idx: number | undefined) => (idx != null && idx >= 0 ? (row[idx] ?? "").trim() : "");
  const keyOf = (memberId: string, date: string, time: string, name: string) => `${memberId}|${date}|${time}|${normalize(name)}`;

  const titles = await listSheetTitles(token, spreadsheetId);
  let imported = 0;
  const pendingNames = new Set<string>();
  let foundAny = false;

  for (const title of titles) {
    // Abas de mês (inclusive as de arquivo "que não vieram", que entram como não-veio).
    const month = monthFromTitle(title);
    if (!month) continue;
    const archive = isArchiveTitle(title);
    const grid = await getAllValues(token, spreadsheetId, title);
    const found = locateHeader(grid);
    if (!found) continue;
    const colMap = autoMapHeaders(found.headers);
    if (colMap.client_name == null) continue;
    foundAny = true;
    const pulseCol = found.headers.findIndex((h) => h.trim() === PULSE_ID_HEADER);

    // Data base desta aba: mês do nome da aba + "SEMANA N".
    const weekStart = tabWeekStart(month, weekFromGrid(grid), tz);
    const weekEnd = addDays(weekStart, 7);

    // Visitas que já existem no sistema nessa semana (para não duplicar).
    const { data: existing } = await admin
      .from("appointments")
      .select("member_id, scheduled_at, client_name")
      .eq("org_id", orgId)
      .gte("scheduled_at", zonedToIso(weekStart, "00:00", tz))
      .lt("scheduled_at", zonedToIso(weekEnd, "00:00", tz));
    const seenKeys = new Set(
      (existing ?? []).map((e) => keyOf(e.member_id as string, dateIn(e.scheduled_at as string, tz), formatTimeIn(e.scheduled_at as string, tz), (e.client_name as string) ?? "")),
    );

    const toInsert: Record<string, unknown>[] = [];
    for (const row of grid.slice(found.index + 1).slice(0, MAX_IMPORT)) {
      if (pulseCol >= 0 && cell(row, pulseCol)) continue; // já veio do sistema
      const name = cell(row, colMap.client_name);
      if (!name) continue;

      const wd = WEEKDAY_INDEX.get(normalize(cell(row, colMap.date)).split("-")[0]);
      if (wd == null) continue;
      const date = addDays(weekStart, wd);
      const time = parseTime(cell(row, colMap.time));

      const brokerName = cell(row, colMap.broker);
      const memberId = brokerName ? matchMember(brokerName, members) ?? mappedMember(brokerName) : null;
      if (!memberId) {
        if (brokerName) pendingNames.add(brokerName);
        continue;
      }

      let scheduledAt: string;
      try {
        scheduledAt = zonedToIso(date, time, tz);
        if (!Number.isFinite(new Date(scheduledAt).getTime())) continue;
      } catch {
        continue;
      }

      const key = keyOf(memberId, date, time, name);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const phone = cell(row, colMap.client_phone);
      const clientPhone = phone && phoneOk(phone) ? phone : null;
      const region = cell(row, colMap.region).slice(0, 40);
      const status = archive ? "no_show" : "scheduled";
      const clientId = await ensureClientForVisit(admin, { orgId, memberId, name, phone: clientPhone, status, source: "Planilha" });
      toInsert.push({
        org_id: orgId,
        member_id: memberId,
        client_id: clientId,
        client_name: name.slice(0, 120),
        client_phone: clientPhone,
        scheduled_at: scheduledAt,
        region: region || null,
        status,
        visit_stage: archive ? "no_show" : null,
        notes: archive ? ARCHIVE_NOTE : "Importado da planilha",
      });
    }

    if (toInsert.length) {
      const { error, count } = await admin.from("appointments").insert(toInsert, { count: "exact" });
      if (error) return { error: "insercao" };
      imported += count ?? toInsert.length;
    }
  }

  if (!foundAny) return { error: "sem-cabecalho" };

  await linkOrphanVisitsToClients(orgId);
  return { imported, pending: pendingNames.size, pendingNames: [...pendingNames] };
}
