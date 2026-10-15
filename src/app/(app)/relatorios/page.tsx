import clsx from "clsx";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DailyChart, PrintButton } from "@/components/reports/daily-chart";
import { Funnel, StatTile } from "@/components/live/viz";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { requireActivatedMember, isLeader } from "@/lib/auth";
import { conversion, formatNumber, METRICS } from "@/lib/metrics";
import { PERIODS, periodQuery, previousPeriod, resolvePeriod } from "@/lib/period";
import { loadReportData } from "@/lib/report-data";

/** Variação percentual frente ao mesmo número no período anterior. */
function TrendBadge({ current, previous, emphasis = false }: { current: number; previous: number; emphasis?: boolean }) {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  return (
    <span
      title={`${formatNumber(previous)} no período anterior`}
      className={clsx(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
        emphasis ? "bg-brand-ink/15 text-brand-ink" : up ? "bg-brand-soft text-brand-text" : "bg-danger-soft text-danger",
      )}
    >
      {up ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}

export const metadata: Metadata = { title: "Relatórios" };

const PAGE_SIZE = 20;

export default async function RelatoriosPage(props: PageProps<"/relatorios">) {
  const member = await requireActivatedMember();
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

  const period = resolvePeriod({ periodo: one(sp.periodo), de: one(sp.de), ate: one(sp.ate) }, member.org.timezone);
  const leader = isLeader(member.role);
  const data = await loadReportData(period, null);
  // Corretor escolhido vale mais que a equipe: mostra só os números dele.
  const broker = leader ? (data.brokers.find((b) => b.id === one(sp.corretor)) ?? null) : null;
  const teamId = !broker && leader && data.teams.some((t) => t.id === one(sp.equipe)) ? one(sp.equipe) : null;
  const view = broker || teamId ? await loadReportData(period, teamId, broker?.id ?? null) : data;
  // Mesmo recorte no período anterior, para mostrar se cada número subiu ou caiu.
  const prevPeriod = previousPeriod(period);
  const prevData = await loadReportData(prevPeriod, teamId, broker?.id ?? null);
  const prev = prevData.totals;
  const prevSalesByBroker = new Map(prevData.brokers.map((b) => [b.id, b.totals.sales]));
  const prevSalesByTeam = new Map(prevData.teamLines.map((tl) => [tl.id, tl.totals.sales]));
  const teamParam: Record<string, string> = broker ? { corretor: broker.id } : teamId ? { equipe: teamId } : {};
  const brokerOptions = data.brokers.filter((b) => !teamId || b.teamId === teamId);
  const t = view.totals;

  const pages = Math.max(1, Math.ceil(view.brokers.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(one(sp.pagina), 10) || 1));
  const pageBrokers = view.brokers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageHref = (n: number) => `/relatorios?${periodQuery(period, { ...teamParam, ...(n > 1 ? { pagina: String(n) } : {}) })}`;
  const brokerHref = (id: string) => `/relatorios?${periodQuery(period, { corretor: id })}`;

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
          {leader && data.brokers.length > 1 ? (
            <label className="flex flex-col gap-1 text-[13px] text-ink-2">
              Corretor
              <select name="corretor" defaultValue={broker?.id ?? ""} className="h-10 max-w-56 rounded-xl border border-line bg-surface px-3 text-sm">
                <option value="">Todos</option>
                {brokerOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
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

      {broker ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <span className="flex items-center gap-3">
            <Avatar name={broker.name} />
            <span>
              <span className="block text-sm font-semibold">{broker.name}</span>
              <span className="block text-xs text-muted">
                {broker.teamName}, {broker.daysReported} {broker.daysReported === 1 ? "dia" : "dias"} com relatório no período
              </span>
            </span>
          </span>
          <Link href={`/relatorios?${periodQuery(period)}`} className={buttonClass("ghost", "sm")}>
            <X className="size-4" />
            Ver todos os corretores
          </Link>
        </div>
      ) : null}

      {view.error ? <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{view.error}</p> : null}

      <section className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile label="Leads" value={t.leads} detail={`${formatNumber(t.interactions)} interações`} trend={<TrendBadge current={t.leads} previous={prev.leads} />} />
          <StatTile label="Agendamentos" value={t.appointments} detail={`${conversion(t.negotiations, t.appointments)} das negociações`} trend={<TrendBadge current={t.appointments} previous={prev.appointments} />} />
          <StatTile label="Visitas" value={t.visits} detail={`${conversion(t.appointments, t.visits)} dos agendamentos`} trend={<TrendBadge current={t.visits} previous={prev.visits} />} />
          <StatTile label="Propostas" value={t.proposals} detail={`${conversion(t.visits, t.proposals)} das visitas`} trend={<TrendBadge current={t.proposals} previous={prev.proposals} />} />
          <StatTile label="Vendas" value={t.sales} emphasis detail={`${conversion(t.proposals, t.sales)} das propostas`} trend={<TrendBadge current={t.sales} previous={prev.sales} emphasis />} />
        </div>
        <p className="text-xs text-muted">Comparado com o período anterior ({prevPeriod.label}).</p>
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

      {leader && !teamId && !broker && view.teamLines.length > 1 ? <TeamComparison lines={view.teamLines} prevSales={prevSalesByTeam} /> : null}

      {leader && !broker ? (
        <Card className="min-w-0">
          <CardHeader title="Corretores" description="Ordenados por quem avançou mais no funil. Clique no nome para ver o relatório de cada um" />
          {/* No celular, um cartão por corretor com os números principais, sem rolar para o lado. */}
          <ul className="mt-3 divide-y divide-line border-t border-line md:hidden">
            {view.brokers.length === 0 ? <li className="px-5 py-10 text-center text-sm text-muted">Nenhum corretor nesse filtro.</li> : null}
            {pageBrokers.map((b, i) => (
              <li key={b.id}>
                <Link href={brokerHref(b.id)} className={clsx("flex items-center gap-3 px-5 py-3.5 active:bg-surface-2", !b.active && "text-muted")}>
                  <span className="w-5 shrink-0 text-xs text-muted tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</span>
                  <Avatar name={b.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{b.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {formatNumber(b.totals.visits)} visitas, {formatNumber(b.totals.proposals)} propostas, {b.daysReported}{" "}
                      {b.daysReported === 1 ? "dia" : "dias"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-lg leading-none font-semibold tabular-nums">{formatNumber(b.totals.sales)}</span>
                    <span className="text-[11px] text-muted">vendas</span>
                    <span className="mt-1 block">
                      <TrendBadge current={b.totals.sales} previous={prevSalesByBroker.get(b.id) ?? 0} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 hidden overflow-x-auto border-t border-line md:block">
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
                {pageBrokers.map((b, i) => (
                  <tr key={b.id} className={clsx("border-t border-line hover:bg-surface-2/60", !b.active && "text-muted")}>
                    <td className="px-5 py-2.5 text-muted tabular-nums sm:px-6">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-3 py-2.5">
                      <Link href={brokerHref(b.id)} className="group flex items-center gap-2.5">
                        <Avatar name={b.name} />
                        <span>
                          <span className="block font-medium group-hover:underline group-hover:underline-offset-4">{b.name}</span>
                          <span className="block text-xs text-muted">
                            {b.teamName}
                            {b.active ? "" : ", desativado"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    {METRICS.map((m) => (
                      <td key={m.key} className={clsx("px-2 py-2.5 text-right tabular-nums", m.key === "sales" && "font-semibold")}>
                        {m.key === "sales" ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            {formatNumber(b.totals.sales)}
                            <TrendBadge current={b.totals.sales} previous={prevSalesByBroker.get(b.id) ?? 0} />
                          </span>
                        ) : (
                          formatNumber(b.totals[m.key])
                        )}
                      </td>
                    ))}
                    <td className="px-5 py-2.5 text-right text-muted tabular-nums sm:px-6">{b.daysReported}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm sm:px-6">
              <span className="text-muted">
                {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, view.brokers.length)} de {view.brokers.length} corretores
              </span>
              <span className="flex gap-1.5">
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className={buttonClass("secondary", "sm")}>
                    <ChevronLeft className="size-4" />
                    Anterior
                  </Link>
                ) : null}
                {page < pages ? (
                  <Link href={pageHref(page + 1)} className={buttonClass("secondary", "sm")}>
                    Próxima
                    <ChevronRight className="size-4" />
                  </Link>
                ) : null}
              </span>
            </nav>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function TeamComparison({ lines, prevSales }: { lines: Awaited<ReturnType<typeof loadReportData>>["teamLines"]; prevSales: Map<string, number> }) {
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
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="w-8 text-right font-semibold tabular-nums">{l.totals.sales}</span>
                      <TrendBadge current={l.totals.sales} previous={prevSales.get(l.id) ?? 0} />
                    </span>
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
