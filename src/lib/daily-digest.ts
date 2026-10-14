import "server-only";
import { sendDailyDigestEmail } from "@/lib/email-templates";
import { siteUrl } from "@/lib/email";
import { compareRank, METRIC_KEYS, type Totals } from "@/lib/metrics";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, formatDate, minutesNowIn, normalizeSlot, slotLabel, slotMinutes, todayIn } from "@/lib/time";
import { fetchAll, sumOf, type ReportRow } from "@/lib/weekly-digest";

type Member = {
  id: string;
  user_id: string;
  full_name: string;
  role: "owner" | "director" | "manager" | "broker";
  team_id: string | null;
  division_id: string | null;
  daily_digest: boolean;
  daily_digest_hour: number | null;
  digest_email: string | null;
};

const SUMMARY: { key: keyof Totals; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "visits", label: "Visitas" },
  { key: "proposals", label: "Propostas" },
  { key: "sales", label: "Vendas" },
];

// O resumo sai uma hora depois do último horário de relatório do dia.
const AFTER_LAST_SLOT_MIN = 60;

/**
 * Fechamento do dia para cada pessoa da liderança que não desligou o resumo.
 * A rotina roda de hora em hora; só envia depois do último horário e uma vez
 * por pessoa por dia (o registro de envio é reservado antes).
 */
export async function sendDailyDigests(org: { id: string; name: string; timezone: string; report_slots: string[] }) {
  const slots = org.report_slots.map(normalizeSlot).sort();
  if (slots.length === 0) return 0;
  const lastSlot = slots[slots.length - 1];
  const now = minutesNowIn(org.timezone);
  // Cada pessoa escolhe a hora; sem escolha, sai 1 hora depois do último horário.
  const isDue = (m: Member) => now >= (m.daily_digest_hour != null ? m.daily_digest_hour * 60 : slotMinutes(lastSlot) + AFTER_LAST_SLOT_MIN);

  const admin = createAdminClient();
  const today = todayIn(org.timezone);
  const yesterday = addDays(today, -1);

  const { data: memberRows } = await admin
    .from("members")
    .select("id, user_id, full_name, role, team_id, division_id, daily_digest, daily_digest_hour, digest_email")
    .eq("org_id", org.id)
    .eq("active", true);
  const members = (memberRows ?? []) as Member[];
  const leaders = members.filter((m) => m.role !== "broker" && m.daily_digest && isDue(m));
  if (leaders.length === 0) return 0;

  const [reports, statuses] = await Promise.all([
    fetchAll<ReportRow & { report_slot: string; notes: string | null }>((from, to) =>
      admin
        .from("reports")
        .select(`member_id, report_date, report_slot, notes, ${METRIC_KEYS.join(", ")}`)
        .eq("org_id", org.id)
        .gte("report_date", yesterday)
        .lte("report_date", today)
        .range(from, to),
    ),
    fetchAll<{ member_id: string; online: boolean }>((from, to) =>
      admin.from("daily_status").select("member_id, online").eq("org_id", org.id).eq("status_date", today).range(from, to),
    ),
  ]);

  const todays = reports.filter((r) => r.report_date === today);
  const yesterdays = reports.filter((r) => r.report_date === yesterday);
  const online = new Map(statuses.map((s) => [s.member_id, s.online]));

  let sent = 0;
  for (const leader of leaders) {
    const scope = members.filter(
      (m) =>
        m.role === "broker" &&
        (leader.role === "owner" ||
          (leader.role === "director" && m.division_id === leader.division_id) ||
          (leader.role === "manager" && m.team_id === leader.team_id)),
    );
    const ids = new Set(scope.map((m) => m.id));
    const mine = todays.filter((r) => ids.has(r.member_id));
    const working = scope.filter((m) => online.get(m.id) === true);
    // Dia sem nada (folga geral, domingo sem plantão): não manda e-mail vazio.
    if (mine.length === 0 && working.length === 0) continue;

    const { data: fresh } = await admin
      .from("notification_log")
      .upsert([{ member_id: leader.id, kind: "daily_digest", ref_date: today, ref_slot: "00:00" }], {
        onConflict: "member_id,kind,ref_date,ref_slot",
        ignoreDuplicates: true,
      })
      .select("member_id");
    if (!fresh?.length) continue;

    const totals = sumOf(mine);
    const previous = sumOf(yesterdays.filter((r) => ids.has(r.member_id)));
    const name = new Map(scope.map((m) => [m.id, m.full_name]));

    const top = scope
      .map((m) => ({ m, rows: mine.filter((r) => r.member_id === m.id) }))
      .filter((b) => b.rows.length > 0)
      .map((b) => ({ name: b.m.full_name, totals: sumOf(b.rows) }))
      .sort((a, b) => compareRank(a.totals, b.totals))
      .slice(0, 3)
      .map((b) => ({ name: b.name, sales: b.totals.sales, visits: b.totals.visits }));

    const pending = [
      ...working
        .map((m) => ({ m, delivered: mine.filter((r) => r.member_id === m.id).length }))
        .filter((b) => b.delivered < slots.length)
        .map((b) => ({ name: b.m.full_name, reason: `entregou ${b.delivered} de ${slots.length} relatórios` })),
      ...scope
        .filter((m) => !online.has(m.id) && !mine.some((r) => r.member_id === m.id))
        .map((m) => ({ name: m.full_name, reason: "não marcou presença nem enviou relatório" })),
    ].slice(0, 8);

    const notes = mine
      .filter((r) => r.notes)
      .sort((a, b) => a.report_slot.localeCompare(b.report_slot))
      .slice(0, 6)
      .map((r) => ({ name: name.get(r.member_id) ?? "Corretor", slot: slotLabel(r.report_slot), text: String(r.notes) }));

    const email = leader.digest_email || (await admin.auth.admin.getUserById(leader.user_id)).data.user?.email;
    if (!email) continue;

    const result = await sendDailyDigestEmail({
      to: email,
      fullName: leader.full_name,
      dayLabel: formatDate(today),
      link: siteUrl("/relatorios?periodo=hoje"),
      metrics: SUMMARY.map((s) => ({ label: s.label, value: totals[s.key], previous: previous[s.key] })),
      delivery: { delivered: mine.length, expected: working.length * slots.length },
      top,
      pending,
      notes,
    });
    if (result.ok) sent++;
  }
  return sent;
}
