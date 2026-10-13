import "server-only";
import { METRIC_KEYS, compareRank, emptyTotals, sumReports, type Totals } from "@/lib/metrics";
import type { Period } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

type MemberRow = { id: string; full_name: string; role: string; team_id: string | null; active: boolean };
type TotalsRow = Totals & { member_id: string; days_reported: number; slots_reported: number };
type DayRow = Totals & { report_date: string };

function toTotals(row: Partial<Record<string, unknown>>): Totals {
  const t = emptyTotals();
  for (const k of METRIC_KEYS) t[k] = Number(row[k] ?? 0);
  return t;
}

export type BrokerLine = {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string;
  active: boolean;
  totals: Totals;
  daysReported: number;
  slotsReported: number;
};

/**
 * Tudo que a página de Relatórios mostra, para o período e (opcionalmente)
 * uma equipe. Usa o cliente do usuário: o RLS decide o que entra na soma.
 */
export async function loadReportData(period: Period, teamId: string | null) {
  const supabase = await createClient();
  const [byMember, byDay, members, teams] = await Promise.all([
    supabase.rpc("report_totals_by_member", { p_from: period.from, p_to: period.to }),
    supabase.rpc("report_totals_by_day", { p_from: period.from, p_to: period.to, p_team: teamId }),
    supabase.from("members").select("id, full_name, role, team_id, active").eq("role", "broker").order("full_name"),
    supabase.from("teams").select("id, name").order("name"),
  ]);

  const teamName = new Map((teams.data ?? []).map((t) => [t.id as string, t.name as string]));
  const totalsByMember = new Map(((byMember.data ?? []) as TotalsRow[]).map((r) => [r.member_id, r]));

  // Corretor desativado só aparece se tiver lançamento no período.
  const brokers: BrokerLine[] = ((members.data ?? []) as MemberRow[])
    .filter((m) => (!teamId || m.team_id === teamId) && (m.active || totalsByMember.has(m.id)))
    .map((m) => {
      const row = totalsByMember.get(m.id);
      return {
        id: m.id,
        name: m.full_name,
        teamId: m.team_id,
        teamName: (m.team_id && teamName.get(m.team_id)) || "Sem equipe",
        active: m.active,
        totals: row ? toTotals(row) : emptyTotals(),
        daysReported: row?.days_reported ?? 0,
        slotsReported: row?.slots_reported ?? 0,
      };
    })
    .sort((a, b) => compareRank(a.totals, b.totals) || a.name.localeCompare(b.name));

  const days = ((byDay.data ?? []) as DayRow[]).map((d) => ({ date: d.report_date, totals: toTotals(d) }));

  const teamLines = (teams.data ?? [])
    .map((t) => {
      const list = brokers.filter((b) => b.teamId === t.id);
      return { id: t.id as string, name: t.name as string, brokers: list.length, totals: sumReports(list.map((b) => b.totals)) };
    })
    .filter((t) => t.brokers > 0)
    .sort((a, b) => compareRank(a.totals, b.totals));

  return {
    error: byMember.error?.message ?? byDay.error?.message ?? null,
    brokers,
    days,
    teams: (teams.data ?? []).map((t) => ({ id: t.id as string, name: t.name as string })),
    teamLines,
    totals: sumReports(brokers.map((b) => b.totals)),
  };
}
