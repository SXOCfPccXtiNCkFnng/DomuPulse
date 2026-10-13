"use client";

import clsx from "clsx";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader, LiveDot } from "@/components/ui/card";
import { Funnel, SlotChip, SlotLegend, StatTile, type SlotStatus } from "@/components/live/viz";
import type { ClientMember } from "@/components/live/types";
import { useLiveDay, type LiveMember } from "@/lib/live/use-live-day";
import { compareRank, conversion, formatNumber, sumReports, type Report, type Totals } from "@/lib/metrics";
import { formatLongDate, slotLabel, slotState } from "@/lib/time";

type Row = {
  member: LiveMember;
  teamName: string;
  totals: Totals;
  statuses: SlotStatus[];
  pending: number;
};

export function LiveBoard({ member }: { member: ClientMember }) {
  const live = useLiveDay({ orgId: member.org.id, timezone: member.org.timezone });
  const { clock } = live;
  const slots = member.org.reportSlots;

  const [teamFilter, setTeamFilter] = useState("all");
  const [onlyPending, setOnlyPending] = useState(false);
  const [query, setQuery] = useState("");

  const teamName = useMemo(() => new Map(live.teams.map((t) => [t.id, t.name])), [live.teams]);

  const rows: Row[] = useMemo(() => {
    return live.members
      .filter((m) => m.role === "broker")
      .map((m) => {
        const reports = slots.map((s) => live.reports.get(`${m.id}|${s}`)).filter((r): r is Report => Boolean(r));
        const online = live.statuses.get(m.id)?.online;
        const statuses = slots.map((s): SlotStatus => {
          if (live.reports.has(`${m.id}|${s}`)) return "delivered";
          if (online === false) return "off";
          if (online === undefined) return slotState(s, clock.minutes) === "upcoming" ? "upcoming" : "unmarked";
          return slotState(s, clock.minutes);
        });
        return {
          member: m,
          teamName: (m.team_id && teamName.get(m.team_id)) || "Sem equipe",
          totals: sumReports(reports),
          statuses,
          pending: statuses.filter((s) => s === "late" || s === "open").length,
        };
      });
  }, [live.members, live.reports, live.statuses, slots, clock.minutes, teamName]);

  const scoped = rows.filter((r) => teamFilter === "all" || r.member.team_id === teamFilter);
  const visible = scoped
    .filter((r) => !onlyPending || r.pending > 0)
    .filter((r) => r.member.full_name.toLowerCase().includes(query.trim().toLowerCase()));

  const totals = sumReports(scoped.map((r) => r.totals));
  const ranking = [...scoped].sort((a, b) => compareRank(a.totals, b.totals)).slice(0, 8);

  // Horário em andamento: o último que já abriu.
  const currentIndex = slots.reduce((acc, s, i) => (slotState(s, clock.minutes) !== "upcoming" ? i : acc), -1);
  const current = currentIndex >= 0 ? slots[currentIndex] : null;
  const expected = scoped.filter((r) => r.statuses[currentIndex] !== "off" && r.statuses[currentIndex] !== "unmarked");
  const delivered = expected.filter((r) => r.statuses[currentIndex] === "delivered").length;

  const teamsInScope = live.teams.filter((t) => rows.some((r) => r.member.team_id === t.id));
  const grouped = groupBy(visible, (r) => r.teamName);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted">
            <ConnectionBadge state={live.connection} />
            <span className="capitalize">{formatLongDate(clock.today)}</span>
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Ao vivo</h1>
        </div>
        {teamsInScope.length > 1 ? (
          <div role="tablist" aria-label="Equipe" className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
            {[{ id: "all", name: "Todas" }, ...teamsInScope].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={teamFilter === t.id}
                onClick={() => setTeamFilter(t.id)}
                className={clsx(
                  "h-8 shrink-0 rounded-lg px-3 text-[13px] font-medium transition-colors",
                  teamFilter === t.id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 flex flex-col justify-between rounded-2xl bg-brand p-4 text-brand-ink lg:col-span-1">
          <p className="text-[13px] font-medium opacity-70">
            {current ? `Relatório das ${slotLabel(current)}` : "Primeiro relatório"}
          </p>
          {current ? (
            <>
              <p className="mt-1 font-display text-[1.9rem] font-semibold leading-none tracking-tight tabular-nums">
                {delivered}
                <span className="text-lg opacity-60"> de {expected.length}</span>
              </p>
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand-ink/15"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={expected.length}
                aria-valuenow={delivered}
                aria-label="Relatórios entregues"
              >
                <div
                  className="h-full rounded-full bg-brand-ink transition-[width] duration-700"
                  style={{ width: `${expected.length ? (delivered / expected.length) * 100 : 0}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-1 font-display text-[1.9rem] font-semibold leading-none">{slotLabel(slots[0])}</p>
          )}
        </div>
        <StatTile label="Leads" value={totals.leads} />
        <StatTile label="Agendamentos" value={totals.appointments} detail={`${conversion(totals.negotiations, totals.appointments)} das negociações`} />
        <StatTile label="Visitas" value={totals.visits} detail={`${conversion(totals.appointments, totals.visits)} dos agendamentos`} />
        <StatTile label="Vendas" value={totals.sales} emphasis detail={`${formatNumber(totals.presales)} em pré-venda`} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0">
          <CardHeader
            title="Entregas do dia"
            description={`${scoped.length} corretores no seu escopo`}
            action={
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={onlyPending}
                  onChange={(e) => setOnlyPending(e.target.checked)}
                  className="size-4 accent-[var(--ink)]"
                />
                Só pendentes
              </label>
            }
          />
          <div className="px-5 pt-4 sm:px-6">
            <label className="relative block">
              <span className="sr-only">Buscar corretor</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar corretor"
                className="h-10 w-full rounded-xl border border-line bg-surface-2 pr-3 pl-9 text-sm outline-none focus:border-ink"
              />
            </label>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="sticky left-0 bg-surface px-5 py-3 font-medium sm:px-6">Corretor</th>
                  {slots.map((s) => (
                    <th key={s} className="px-1 py-3 text-center font-medium">
                      {slotLabel(s)}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-medium">Visitas</th>
                  <th className="py-3 pr-5 pl-3 text-right font-medium sm:pr-6">Vendas</th>
                </tr>
              </thead>
              {live.loading ? (
                <tbody>
                  <SkeletonRows cols={slots.length + 3} />
                </tbody>
              ) : visible.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={slots.length + 3} className="px-6 py-12 text-center text-muted">
                      {rows.length === 0
                        ? "Nenhum corretor cadastrado ainda. Convide a equipe na aba Equipe."
                        : "Nenhum corretor encontrado com esses filtros."}
                    </td>
                  </tr>
                </tbody>
              ) : (
                Object.entries(grouped).map(([team, list]) => (
                  <tbody key={team}>
                    {teamsInScope.length > 1 && teamFilter === "all" ? (
                      <tr>
                        <th
                          colSpan={slots.length + 3}
                          className="border-t border-line bg-surface-2/60 px-5 py-2 text-left text-xs font-semibold tracking-wide text-ink-2 uppercase sm:px-6"
                        >
                          {team}
                        </th>
                      </tr>
                    ) : null}
                    {list.map((r) => (
                      <tr
                        key={`${r.member.id}-${live.pulse?.memberId === r.member.id ? live.pulse.at : 0}`}
                        className={clsx(live.pulse?.memberId === r.member.id && "animate-flash")}
                      >
                        <td className="sticky left-0 border-t border-line bg-surface px-5 py-2.5 sm:px-6">
                          <span className="flex items-center gap-2.5">
                            <Avatar name={r.member.full_name} />
                            <span className="truncate font-medium">{r.member.full_name}</span>
                          </span>
                        </td>
                        {r.statuses.map((st, i) => (
                          <td key={slots[i]} className="border-t border-line px-1 py-2.5 text-center">
                            <SlotChip status={st} compact />
                          </td>
                        ))}
                        <td className="border-t border-line px-3 py-2.5 text-right tabular-nums">{r.totals.visits}</td>
                        <td className="border-t border-line py-2.5 pr-5 pl-3 text-right font-semibold tabular-nums sm:pr-6">
                          {r.totals.sales}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))
              )}
            </table>
          </div>
          <div className="border-t border-line px-5 py-4 sm:px-6">
            <SlotLegend />
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Ranking do dia" description="Quem avançou mais no funil" />
            <ol className="flex flex-col gap-1 p-3 sm:p-4">
              {ranking.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">Sem lançamentos ainda.</li> : null}
              {ranking.map((r, i) => (
                <li key={r.member.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-2">
                  <span
                    className={clsx(
                      "grid size-7 shrink-0 place-items-center rounded-lg font-display text-sm font-semibold tabular-nums",
                      i === 0 ? "bg-brand text-brand-ink" : i < 3 ? "bg-ink text-bg" : "bg-surface-2 text-muted",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.member.full_name}</span>
                    <span className="block truncate text-xs text-muted">{r.teamName}</span>
                  </span>
                  <span className="text-right text-xs text-muted tabular-nums">
                    <span className="block text-sm font-semibold text-ink">{r.totals.sales} vendas</span>
                    {r.totals.visits} visitas
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader title="Funil da equipe" description="Conversão entre etapas, hoje" />
            <div className="p-5 sm:p-6">
              <Funnel totals={totals} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ConnectionBadge({ state }: { state: "connecting" | "live" | "reconnecting" }) {
  if (state === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-brand-text">
        <LiveDot />
        Ao vivo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-warn">
      <span className="size-2 rounded-full bg-warn" />
      {state === "connecting" ? "Conectando" : "Reconectando"}
    </span>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return Array.from({ length: 5 }, (_, i) => (
    <tr key={i}>
      {Array.from({ length: cols }, (_, j) => (
        <td key={j} className="border-t border-line px-5 py-3.5">
          <span className="block h-4 animate-pulse rounded bg-surface-2" />
        </td>
      ))}
    </tr>
  ));
}

function groupBy<T>(list: T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of list) (out[key(item)] ??= []).push(item);
  return out;
}
