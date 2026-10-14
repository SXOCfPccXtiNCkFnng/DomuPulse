import "server-only";
import { sendWeeklyDigestEmail } from "@/lib/email-templates";
import { siteUrl } from "@/lib/email";
import { compareRank, emptyTotals, METRIC_KEYS, type Totals } from "@/lib/metrics";
import { notifyUsers } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, formatDate, minutesNowIn, normalizeSlot, startOfMonth, startOfWeek, todayIn } from "@/lib/time";

type Member = {
  id: string;
  user_id: string;
  full_name: string;
  role: "owner" | "director" | "manager" | "broker";
  team_id: string | null;
  division_id: string | null;
  weekly_digest: boolean;
  weekly_digest_weekday: number;
  monthly_digest: boolean;
  digest_email: string | null;
};
export type ReportRow = Totals & { member_id: string; report_date: string };

const SUMMARY: { key: keyof Totals; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "appointments", label: "Agendamentos" },
  { key: "visits", label: "Visitas" },
  { key: "sales", label: "Vendas" },
];

// Semanal e mensal saem às 8h da manhã, no fuso da imobiliária.
const SEND_AT_MIN = 8 * 60;

export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await build(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export function sumOf(rows: ReportRow[]) {
  const t = emptyTotals();
  for (const r of rows) for (const k of METRIC_KEYS) t[k] += Number(r[k] ?? 0);
  return t;
}

/** Dia da semana (0 = domingo) de uma data AAAA-MM-DD. */
function weekdayOf(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

const monthName = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/**
 * Resumo do período anterior para a liderança:
 *  - semana: a última semana completa (segunda a domingo), no dia da semana
 *    que cada pessoa escolheu;
 *  - mês: o mês anterior inteiro, no dia 1.
 * Os dois saem a partir das 8h. O registro de envio garante um por período por
 * pessoa, mesmo que a rotina rode várias vezes.
 */
export async function sendPeriodDigests(
  org: { id: string; name: string; timezone: string; report_slots: string[] },
  period: "week" | "month",
) {
  const today = todayIn(org.timezone);
  if (minutesNowIn(org.timezone) < SEND_AT_MIN) return 0;
  if (period === "month" && today.slice(8) !== "01") return 0;

  const start = period === "week" ? addDays(startOfWeek(today), -7) : startOfMonth(addDays(startOfMonth(today), -1));
  const end = period === "week" ? addDays(start, 6) : addDays(startOfMonth(today), -1);
  const prevStart = period === "week" ? addDays(start, -7) : startOfMonth(addDays(start, -1));
  const label = period === "week" ? `${formatDate(start).slice(0, 5)} a ${formatDate(end).slice(0, 5)}` : monthName(start);

  const admin = createAdminClient();
  const { data: memberRows } = await admin
    .from("members")
    .select("id, user_id, full_name, role, team_id, division_id, weekly_digest, weekly_digest_weekday, monthly_digest, digest_email")
    .eq("org_id", org.id)
    .eq("active", true);
  const members = (memberRows ?? []) as Member[];
  const weekday = weekdayOf(today);
  const leaders = members.filter(
    (m) =>
      m.role !== "broker" &&
      (period === "week" ? m.weekly_digest && m.weekly_digest_weekday === weekday : m.monthly_digest),
  );
  if (leaders.length === 0) return 0;

  const [reports, statuses] = await Promise.all([
    fetchAll<ReportRow>((from, to) =>
      admin
        .from("reports")
        .select(`member_id, report_date, ${METRIC_KEYS.join(", ")}`)
        .eq("org_id", org.id)
        .gte("report_date", prevStart)
        .lte("report_date", end)
        .range(from, to),
    ),
    fetchAll<{ member_id: string }>((from, to) =>
      admin
        .from("daily_status")
        .select("member_id")
        .eq("org_id", org.id)
        .eq("online", true)
        .gte("status_date", start)
        .lte("status_date", end)
        .range(from, to),
    ),
  ]);

  const slotsPerDay = org.report_slots.map(normalizeSlot).length;
  const current = reports.filter((r) => r.report_date >= start);
  const before = reports.filter((r) => r.report_date < start);
  const reported = new Set(current.map((r) => r.member_id));
  const { data: teams } = await admin.from("teams").select("id, name").eq("org_id", org.id);
  const { data: divisions } = await admin.from("divisions").select("id, name").eq("org_id", org.id);
  const kind = period === "week" ? "weekly_digest" : "monthly_digest";
  const link = siteUrl(`/relatorios?periodo=intervalo&de=${start}&ate=${end}`);

  let sent = 0;
  for (const leader of leaders) {
    // Corretores de hoje e também quem lançou relatório no período com outro
    // cargo: mudar de cargo não apaga o histórico.
    const scope = members.filter(
      (m) =>
        (m.role === "broker" || reported.has(m.id)) &&
        m.id !== leader.id &&
        (leader.role === "owner" ||
          (leader.role === "director" && m.division_id === leader.division_id) ||
          (leader.role === "manager" && m.team_id === leader.team_id)),
    );
    if (scope.length === 0) continue;

    // Reserva o envio antes: duas execuções no mesmo período não mandam em dobro.
    const { data: fresh } = await admin
      .from("notification_log")
      .upsert([{ member_id: leader.id, kind, ref_date: start, ref_slot: "00:00" }], {
        onConflict: "member_id,kind,ref_date,ref_slot",
        ignoreDuplicates: true,
      })
      .select("member_id");
    if (!fresh?.length) continue;

    const ids = new Set(scope.map((m) => m.id));
    const mine = current.filter((r) => ids.has(r.member_id));
    const totals = sumOf(mine);
    const previous = sumOf(before.filter((r) => ids.has(r.member_id)));
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
        if (b.slots === 0) return { name: b.member.full_name, reason: period === "week" ? "nenhum relatório na semana" : "nenhum relatório no mês" };
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

    // E-mail escolhido na Conta; sem ele, o de login.
    const email = leader.digest_email || (await admin.auth.admin.getUserById(leader.user_id)).data.user?.email;
    if (!email) continue;

    const result = await sendWeeklyDigestEmail({
      to: email,
      fullName: leader.full_name,
      scopeLabel,
      weekLabel: label,
      period,
      link,
      metrics: SUMMARY.map((s) => ({ label: s.label, value: totals[s.key], previous: previous[s.key] })),
      delivery: { delivered: mine.length, expected },
      top,
      attention,
    });
    if (result.ok) sent++;

    await notifyUsers(org.id, [leader.user_id], {
      kind,
      title: period === "week" ? "Resumo da semana" : "Resumo do mês",
      body: `${scopeLabel}: ${totals.visits} visitas e ${totals.sales} vendas ${period === "week" ? "de" : "em"} ${label}.`,
      url: `/relatorios?periodo=intervalo&de=${start}&ate=${end}`,
    });
  }
  return sent;
}

/** Compatibilidade: a rotina semanal antiga continua funcionando. */
export function sendWeeklyDigests(org: { id: string; name: string; timezone: string; report_slots: string[] }) {
  return sendPeriodDigests(org, "week");
}
