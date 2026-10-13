import "server-only";
import { sendWeeklyDigestEmail } from "@/lib/email-templates";
import { siteUrl } from "@/lib/email";
import { compareRank, emptyTotals, METRIC_KEYS, type Totals } from "@/lib/metrics";
import { notifyUsers } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, formatDate, normalizeSlot, startOfWeek, todayIn } from "@/lib/time";

type Member = {
  id: string;
  user_id: string;
  full_name: string;
  role: "owner" | "director" | "manager" | "broker";
  team_id: string | null;
  division_id: string | null;
  weekly_digest: boolean;
};
type ReportRow = Totals & { member_id: string; report_date: string };

const SUMMARY: { key: keyof Totals; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "appointments", label: "Agendamentos" },
  { key: "visits", label: "Visitas" },
  { key: "sales", label: "Vendas" },
];

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await build(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function sumOf(rows: ReportRow[]) {
  const t = emptyTotals();
  for (const r of rows) for (const k of METRIC_KEYS) t[k] += Number(r[k] ?? 0);
  return t;
}

/**
 * Resumo da última semana completa (segunda a domingo) para cada pessoa da
 * liderança que não desligou o resumo. O registro de envio garante uma vez
 * por semana, mesmo que a rotina rode mais de uma vez.
 */
export async function sendWeeklyDigests(org: { id: string; name: string; timezone: string; report_slots: string[] }) {
  const admin = createAdminClient();
  const today = todayIn(org.timezone);
  const weekStart = addDays(startOfWeek(today), -7);
  const weekEnd = addDays(weekStart, 6);
  const prevStart = addDays(weekStart, -7);
  const weekLabel = `${formatDate(weekStart).slice(0, 5)} a ${formatDate(weekEnd).slice(0, 5)}`;

  const { data: memberRows } = await admin
    .from("members")
    .select("id, user_id, full_name, role, team_id, division_id, weekly_digest")
    .eq("org_id", org.id)
    .eq("active", true);
  const members = (memberRows ?? []) as Member[];
  const leaders = members.filter((m) => m.role !== "broker" && m.weekly_digest);
  if (leaders.length === 0) return 0;

  const [reports, statuses] = await Promise.all([
    fetchAll<ReportRow>((from, to) =>
      admin
        .from("reports")
        .select(`member_id, report_date, ${METRIC_KEYS.join(", ")}`)
        .eq("org_id", org.id)
        .gte("report_date", prevStart)
        .lte("report_date", weekEnd)
        .range(from, to),
    ),
    fetchAll<{ member_id: string }>((from, to) =>
      admin
        .from("daily_status")
        .select("member_id")
        .eq("org_id", org.id)
        .eq("online", true)
        .gte("status_date", weekStart)
        .lte("status_date", weekEnd)
        .range(from, to),
    ),
  ]);

  const slotsPerDay = org.report_slots.map(normalizeSlot).length;
  const thisWeek = reports.filter((r) => r.report_date >= weekStart);
  const lastWeek = reports.filter((r) => r.report_date < weekStart);
  const { data: teams } = await admin.from("teams").select("id, name").eq("org_id", org.id);
  const { data: divisions } = await admin.from("divisions").select("id, name").eq("org_id", org.id);

  let sent = 0;
  for (const leader of leaders) {
    const scope = members.filter(
      (m) =>
        m.role === "broker" &&
        (leader.role === "owner" ||
          (leader.role === "director" && m.division_id === leader.division_id) ||
          (leader.role === "manager" && m.team_id === leader.team_id)),
    );
    if (scope.length === 0) continue;

    // Reserva o envio antes: duas execuções no mesmo dia não mandam em dobro.
    const { data: fresh } = await admin
      .from("notification_log")
      .upsert([{ member_id: leader.id, kind: "weekly_digest", ref_date: weekStart, ref_slot: "00:00" }], {
        onConflict: "member_id,kind,ref_date,ref_slot",
        ignoreDuplicates: true,
      })
      .select("member_id");
    if (!fresh?.length) continue;

    const ids = new Set(scope.map((m) => m.id));
    const mine = thisWeek.filter((r) => ids.has(r.member_id));
    const totals = sumOf(mine);
    const previous = sumOf(lastWeek.filter((r) => ids.has(r.member_id)));
    const expected = statuses.filter((s) => ids.has(s.member_id)).length * slotsPerDay;

    const perBroker = scope.map((m) => {
      const rows = mine.filter((r) => r.member_id === m.id);
      return { member: m, totals: sumOf(rows), slots: rows.length, onlineDays: statuses.filter((s) => s.member_id === m.id).length };
    });
    const top = [...perBroker]
      .sort((a, b) => compareRank(a.totals, b.totals))
      .filter((b) => b.slots > 0)
      .slice(0, 3)
      .map((b) => ({ name: b.member.full_name, sales: b.totals.sales, visits: b.totals.visits }));
    const attention = perBroker
      .map((b) => {
        if (b.slots === 0) return { name: b.member.full_name, reason: "nenhum relatório na semana" };
        const exp = b.onlineDays * slotsPerDay;
        if (exp > 0 && b.slots / exp < 0.6) return { name: b.member.full_name, reason: `entregou ${b.slots} de ${exp} relatórios` };
        return null;
      })
      .filter((a): a is { name: string; reason: string } => a !== null)
      .slice(0, 5);

    const scopeLabel =
      leader.role === "owner"
        ? org.name
        : leader.role === "director"
          ? ((divisions ?? []).find((d) => d.id === leader.division_id)?.name ?? "sua diretoria")
          : ((teams ?? []).find((t) => t.id === leader.team_id)?.name ?? "sua equipe");
    const link = siteUrl(`/relatorios?periodo=intervalo&de=${weekStart}&ate=${weekEnd}`);

    const { data: auth } = await admin.auth.admin.getUserById(leader.user_id);
    const email = auth.user?.email;
    if (!email) continue;

    const result = await sendWeeklyDigestEmail({
      to: email,
      fullName: leader.full_name,
      scopeLabel,
      weekLabel,
      link,
      metrics: SUMMARY.map((s) => ({ label: s.label, value: totals[s.key], previous: previous[s.key] })),
      delivery: { delivered: mine.length, expected },
      top,
      attention,
    });
    if (result.ok) sent++;

    await notifyUsers(org.id, [leader.user_id], {
      kind: "weekly_digest",
      title: "Resumo da semana",
      body: `${scopeLabel}: ${totals.visits} visitas e ${totals.sales} vendas de ${weekLabel}.`,
      url: `/relatorios?periodo=intervalo&de=${weekStart}&ate=${weekEnd}`,
    });
  }
  return sent;
}
