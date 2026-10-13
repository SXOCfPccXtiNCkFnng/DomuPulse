export const METRICS = [
  { key: "leads", label: "Leads", short: "Leads" },
  { key: "interactions", label: "Interações", short: "Interações" },
  { key: "negotiations", label: "Negociações", short: "Negociações" },
  { key: "appointments", label: "Agendamentos", short: "Agend." },
  { key: "visits", label: "Visitas", short: "Visitas" },
  { key: "proposals", label: "Propostas", short: "Propostas" },
  { key: "presales", label: "Pré-vendas", short: "Pré-vendas" },
  { key: "sales", label: "Vendas", short: "Vendas" },
] as const;

export type MetricKey = (typeof METRICS)[number]["key"];
export type Totals = Record<MetricKey, number>;

export const METRIC_KEYS = METRICS.map((m) => m.key) as MetricKey[];

// Ranking: vence quem avançou mais no funil. Empate vai para a etapa anterior.
export const RANK_ORDER: MetricKey[] = [...METRIC_KEYS].reverse();

export type Report = Totals & {
  id: string;
  member_id: string;
  report_date: string;
  report_slot: string;
  updated_at: string;
};

export function emptyTotals(): Totals {
  return Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as Totals;
}

export function sumReports(reports: Pick<Report, MetricKey>[]): Totals {
  const totals = emptyTotals();
  for (const r of reports) {
    for (const k of METRIC_KEYS) totals[k] += r[k] ?? 0;
  }
  return totals;
}

export function compareRank(a: Totals, b: Totals): number {
  for (const k of RANK_ORDER) {
    if (a[k] !== b[k]) return b[k] - a[k];
  }
  return 0;
}

export function conversion(from: number, to: number): string {
  if (!from) return "0%";
  const pct = (to / from) * 100;
  return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1).replace(".", ",")}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
