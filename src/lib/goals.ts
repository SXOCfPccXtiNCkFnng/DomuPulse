import type { MetricKey } from "@/lib/metrics";

// Métricas que podem ter meta mensal.
export const GOAL_METRICS = ["appointments", "visits", "sales"] as const satisfies readonly MetricKey[];
export type GoalMetric = (typeof GOAL_METRICS)[number];

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Projeção para o fim do mês pelo ritmo atual. Mês fechado: o realizado. */
export function projection(actual: number, month: string, today: string) {
  if (today.slice(0, 7) !== month.slice(0, 7)) return actual;
  const elapsed = Number(today.slice(8, 10));
  return Math.round((actual / elapsed) * daysInMonth(month));
}
