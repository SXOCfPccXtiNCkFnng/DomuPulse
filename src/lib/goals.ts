import type { MetricKey } from "@/lib/metrics";

// Tarefas que podem ter meta mensal: todas as etapas do funil, na mesma ordem
// do relatório. O banco (tabela goals) já aceita qualquer uma delas.
export const GOAL_METRICS = [
  "leads",
  "interactions",
  "negotiations",
  "appointments",
  "visits",
  "proposals",
  "presales",
  "sales",
] as const satisfies readonly MetricKey[];
export type GoalMetric = (typeof GOAL_METRICS)[number];

/** Meta do mês inteiro, por semana (segunda a domingo) ou por dia; as duas últimas valem para todo o mês. */
export type GoalPeriod = "month" | "week" | "day";
export const GOAL_PERIODS = ["month", "week", "day"] as const satisfies readonly GoalPeriod[];

/** Nome do campo no formulário de metas. */
export const goalField = (period: GoalPeriod, metric: GoalMetric) => (period === "month" ? metric : `${period}_${metric}`);

/** Campo da meta por horário de relatório ("13:00" -> "slot_1300_leads"). */
export const slotGoalField = (slot: string, metric: GoalMetric) => `slot_${slot.slice(0, 5).replace(":", "")}_${metric}`;

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
