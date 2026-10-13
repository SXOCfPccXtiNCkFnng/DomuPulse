import clsx from "clsx";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DailyChart, PrintButton } from "@/components/reports/daily-chart";
import { Funnel, StatTile } from "@/components/live/viz";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { getCurrentMember, isLeader } from "@/lib/auth";
import { conversion, formatNumber, METRICS } from "@/lib/metrics";
import { PERIODS, periodQuery, resolvePeriod } from "@/lib/period";
import { loadReportData } from "@/lib/report-data";

export const metadata: Metadata = { title: "Relatórios" };

export default async function RelatoriosPage(props: PageProps<"/relatorios">) {
  const member = await getCurrentMember();
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

  const period = resolvePeriod({ periodo: one(sp.periodo), de: one(sp.de), ate: one(sp.ate) }, member.org.timezone);
  const leader = isLeader(member.role);
  const data = await loadReportData(period, null);
  const teamId = leader && data.teams.some((t) => t.id === one(sp.equipe)) ? one(sp.equipe) : null;
  const view = teamId ? await loadReportData(period, teamId) : data;
  const teamParam: Record<string, string> = teamId ? { equipe: teamId } : {};
  const t = view.totals;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted">{period.label}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Relatórios</h1>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <a href={`/relatorios/exportar?${periodQuery(period, teamParam)}`} className={buttonClass("secondary", "md")}>
            <Download className="size-4" />
            Exportar planilha
          </a>
          <PrintButton />
        </div>
      </header>

      <section className="flex flex-col gap-3 print:hidden" aria-label="Filtros">
        <nav aria-label="Período" className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1 sm:w-fit">
          {PERIODS.filter((p) => p.id !== "intervalo").map((p) => (
            <Link
              key={p.id}
              href={`/relatorios?${new URLSearchParams({ periodo: p.id, ...teamParam })}`}
              aria-current={period.id === p.id ? "page" : undefined}
              className={clsx(
                "h-8 rounded-lg px-3 text-[13px] leading-8 font-medium transition-colors",
                period.id === p.id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <form action="/relatorios" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="periodo" value="intervalo" />
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">
            De
            <input type="date" name="de" defaultValue={period.from} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">
            Até
            <input type="date" name="ate" defaultValue={period.to} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" />
          </label>
          {leader && data.teams.length > 1 ? (
            <label className="flex flex-col gap-1 text-[13px] text-ink-2">
              Equipe
              <select name="equipe" defaultValue={teamId ?? ""} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm">
                <option value="">Todas</option>
                {data.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="submit" className={buttonClass("primary", "md")}>
            Aplicar
          </button>
        </form>
      </section>

      {view.error ? <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{view.error}</p> : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Leads" value={t.leads} detail={`${formatNumber(t.interactions)} interações`} />
        <StatTile label="Agendamentos" value={t.appointments} detail={`${conversion(t.negotiations, t.appointments)} das negociações`} />
        <StatTile label="Visitas" value={t.visits} detail={`${conversion(t.appointments, t.visits)} dos agendamentos`} />
        <StatTile label="Propostas" value={t.proposals} detail={`${conversion(t.visits, t.proposals)} das visitas`} />
        <StatTile label="Vendas" value={t.sales} emphasis detail={`${conversion(t.proposals, t.sales)} das propostas`} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0">
          <CardHeader title="Evolução por dia" />
          <div className="p-5 sm:p-6">
            <DailyChart from={period.from} to={period.to} days={view.days} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Funil do período" description="Conversão entre cada etapa" />
          <div className="p-5 sm:p-6">
            <Funnel totals={t} />
          </div>
        </Card>
      </div>

      {leader && !teamId && view.teamLines.length > 1 ? <TeamComparison lines={view.teamLines} /> : null}

      {leader ? (
        <Card className="min-w-0">
          <CardHeader title="Corretores" description="Ordenados por quem avançou mais no funil" />
          <div className="mt-3 overflow-x-auto border-t border-line">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-5 py-3 font-medium sm:px-6">#</th>
                  <th className="px-3 py-3 font-medium">Corretor</th>
                  {METRICS.map((m) => (
                    <th key={m.key} className="px-2 py-3 text-right font-medium">
                      {m.short}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right font-medium sm:px-6">Dias</th>
                </tr>
              </thead>
              <tbody>
                {view.brokers.length === 0 ? (
                  <tr>
                    <td colSpan={METRICS.length + 3} className="px-6 py-12 text-center text-muted">
                      Nenhum corretor nesse filtro.
                    </td>
                  </tr>
                ) : null}
                {view.brokers.map((b, i) => (
                  <tr key={b.id} className={clsx("border-t border-line", !b.active && "text-muted")}>
                    <td className="px-5 py-2.5 text-muted tabular-nums sm:px-6">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={b.name} />
                        <span>
                          <span className="block font-medium">{b.name}</span>
                          <span className="block text-xs text-muted">
                            {b.teamName}
                            {b.active ? "" : ", desativado"}
                          </span>
                        </span>
                      </span>
                    </td>
                    {METRICS.map((m) => (
                      <td key={m.key} className={clsx("px-2 py-2.5 text-right tabular-nums", m.key === "sales" && "font-semibold")}>
                        {formatNumber(b.totals[m.key])}
                      </td>
                    ))}
                    <td className="px-5 py-2.5 text-right text-muted tabular-nums sm:px-6">{b.daysReported}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function TeamComparison({ lines }: { lines: Awaited<ReturnType<typeof loadReportData>>["teamLines"] }) {
  const max = Math.max(1, ...lines.map((l) => l.totals.sales));
  return (
    <Card className="min-w-0">
      <CardHeader title="Comparativo entre equipes" description="Vendas no período e conversão de cada etapa" />
      <div className="mt-3 overflow-x-auto border-t border-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium sm:px-6">Equipe</th>
              <th className="px-3 py-3 text-right font-medium">Corretores</th>
              <th className="px-3 py-3 text-right font-medium">Agend.</th>
              <th className="px-3 py-3 text-right font-medium">Visitas</th>
              <th className="px-3 py-3 text-right font-medium">Visita para venda</th>
              <th className="w-[30%] px-5 py-3 font-medium sm:px-6">Vendas</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-5 py-3 font-medium sm:px-6">{l.name}</td>
                <td className="px-3 py-3 text-right tabular-nums">{l.brokers}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatNumber(l.totals.appointments)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatNumber(l.totals.visits)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{conversion(l.totals.visits, l.totals.sales)}</td>
                <td className="px-5 py-3 sm:px-6">
                  <span className="flex items-center gap-3">
                    <span className="relative h-4 flex-1">
                      <span
                        className="absolute inset-y-0 left-0 rounded-r-[4px] bg-brand-text"
                        style={{ width: l.totals.sales ? `max(4px, ${(l.totals.sales / max) * 100}%)` : 0 }}
                      />
                    </span>
                    <span className="w-8 text-right font-semibold tabular-nums">{l.totals.sales}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
