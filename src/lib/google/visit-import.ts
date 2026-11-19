import "server-only";
import { getGoogleAccessToken } from "@/lib/google/connection";
import { ensureClientForVisit, linkOrphanVisitsToClients } from "@/lib/google/visit-clients";
import { getAllValues } from "@/lib/google/sheets";
import { autoMapHeaders, locateHeader, PULSE_ID_HEADER } from "@/lib/google/visit-sheet";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, dateIn, formatTimeIn, todayIn, zonedToIso } from "@/lib/time";
import { startOfVisitWeek, VISIT_WEEKDAYS } from "@/lib/visits";

const MAX_IMPORT = 500;

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
 * Importa as linhas da planilha como visitas no sistema. Data = o dia da semana
 * aplicado à SEMANA ATUAL. Corretor casado pelo nome; sem corretor único, a
 * linha fica de fora (pendente). Também cria/atualiza o cliente na carteira e
 * liga a visita a ele. Linhas com "ID Pulse" são puladas. Não escreve na planilha.
 */
export async function importVisitsFromSheet(
  orgId: string,
): Promise<{ imported: number; pending: number; pendingNames: string[] } | { error: string }> {
  const admin = createAdminClient();
  const { data: conn } = await admin.from("sheet_connections").select("spreadsheet_id, sheet_title, enabled, broker_map").eq("org_id", orgId).maybeSingle();
  if (!conn?.spreadsheet_id || !conn.enabled) return { error: "sem-planilha" };

  const token = await getGoogleAccessToken(orgId);
  if (!token) return { error: "sem-token" };

  const sheetTitle = (conn.sheet_title as string) || "Página1";
  const grid = await getAllValues(token, conn.spreadsheet_id as string, sheetTitle);
  const found = locateHeader(grid);
  if (!found) return { error: "sem-cabecalho" };

  const colMap = autoMapHeaders(found.headers);
  if (colMap.client_name == null) return { error: "sem-cabecalho" };
  const pulseCol = found.headers.findIndex((h) => h.trim() === PULSE_ID_HEADER);

  const { data: org } = await admin.from("organizations").select("timezone").eq("id", orgId).maybeSingle();
  const tz = (org?.timezone as string) || "America/Sao_Paulo";
  const weekStart = startOfVisitWeek(todayIn(tz));

  const { data: memberData } = await admin.from("members").select("id, display_name").eq("org_id", orgId).eq("active", true);
  const members = (memberData ?? []) as { id: string; display_name: string }[];
  const memberIds = new Set(members.map((m) => m.id));
  // Vínculos manuais (nome da planilha -> corretor), definidos na tela.
  const brokerMap = (conn.broker_map ?? {}) as Record<string, string>;
  const mappedMember = (name: string) => {
    const id = brokerMap[normalize(name)];
    return id && memberIds.has(id) ? id : null;
  };

  const cell = (row: string[], idx: number | undefined) => (idx != null && idx >= 0 ? (row[idx] ?? "").trim() : "");

  // Visitas que já existem no sistema na semana (para não importar duplicado).
  const weekEnd = addDays(weekStart, 7);
  const { data: existing } = await admin
    .from("appointments")
    .select("member_id, scheduled_at, client_name")
    .eq("org_id", orgId)
    .gte("scheduled_at", zonedToIso(weekStart, "00:00", tz))
    .lt("scheduled_at", zonedToIso(weekEnd, "00:00", tz));
  const keyOf = (memberId: string, date: string, time: string, name: string) => `${memberId}|${date}|${time}|${normalize(name)}`;
  const seenKeys = new Set(
    (existing ?? []).map((e) => keyOf(e.member_id as string, dateIn(e.scheduled_at as string, tz), formatTimeIn(e.scheduled_at as string, tz), (e.client_name as string) ?? "")),
  );

  const dataRows = grid.slice(found.index + 1).slice(0, MAX_IMPORT);
  const toInsert: Record<string, unknown>[] = [];
  const pendingNames = new Set<string>();

  for (const row of dataRows) {
    if (pulseCol >= 0 && cell(row, pulseCol)) continue; // já veio do sistema
    const name = cell(row, colMap.client_name);
    if (!name) continue;

    const wd = WEEKDAY_INDEX.get(normalize(cell(row, colMap.date)).split("-")[0]);
    if (wd == null) continue; // sem dia reconhecível
    const date = addDays(weekStart, wd);
    const time = parseTime(cell(row, colMap.time));

    const brokerName = cell(row, colMap.broker);
    const memberId = brokerName ? matchMember(brokerName, members) ?? mappedMember(brokerName) : null;
    if (!memberId) {
      if (brokerName) pendingNames.add(brokerName);
      continue;
    }

    // Converte dia + hora para a data real; se der ruim, pula a linha (não derruba tudo).
    let scheduledAt: string;
    try {
      scheduledAt = zonedToIso(date, time, tz);
      if (!Number.isFinite(new Date(scheduledAt).getTime())) continue;
    } catch {
      continue;
    }

    // Pula se já existe essa visita (mesmo corretor, dia, hora e cliente).
    const key = keyOf(memberId, date, time, name);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const phone = cell(row, colMap.client_phone);
    const region = cell(row, colMap.region).slice(0, 40);
    const clientPhone = phone && phoneOk(phone) ? phone : null;
    const clientId = await ensureClientForVisit(admin, {
      orgId,
      memberId,
      name,
      phone: clientPhone,
      status: "scheduled",
      source: "Planilha",
    });
    toInsert.push({
      org_id: orgId,
      member_id: memberId,
      client_id: clientId,
      client_name: name.slice(0, 120),
      client_phone: clientPhone,
      scheduled_at: scheduledAt,
      region: region || null,
      status: "scheduled",
      notes: "Importado da planilha",
    });
  }

  let imported = 0;
  if (toInsert.length) {
    const { error, count } = await admin.from("appointments").insert(toInsert, { count: "exact" });
    if (error) return { error: "insercao" };
    imported = count ?? toInsert.length;
  }

  // Visitas antigas do Sheets que entraram sem cliente passam a aparecer no kanban.
  await linkOrphanVisitsToClients(orgId);

  return { imported, pending: pendingNames.size, pendingNames: [...pendingNames] };
}
