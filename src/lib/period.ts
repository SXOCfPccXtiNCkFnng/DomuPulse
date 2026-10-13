import { addDays, formatDate, startOfMonth, startOfWeek, todayIn } from "@/lib/time";

export const PERIODS = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mês" },
  { id: "mes-passado", label: "Mês passado" },
  { id: "intervalo", label: "Intervalo" },
] as const;

export type PeriodId = (typeof PERIODS)[number]["id"];
export type Period = { id: PeriodId; from: string; to: string; label: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function endOfMonth(date: string) {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Lê o período da URL. Qualquer valor estranho cai em "este mês". */
export function resolvePeriod(params: { periodo?: string; de?: string; ate?: string }, timezone: string): Period {
  const today = todayIn(timezone);
  const id = (PERIODS.find((p) => p.id === params.periodo)?.id ?? "mes") as PeriodId;

  switch (id) {
    case "hoje":
      return { id, from: today, to: today, label: "Hoje" };
    case "semana":
      return { id, from: startOfWeek(today), to: today, label: "Esta semana" };
    case "mes-passado": {
      const lastMonthEnd = addDays(startOfMonth(today), -1);
      return { id, from: startOfMonth(lastMonthEnd), to: lastMonthEnd, label: "Mês passado" };
    }
    case "intervalo": {
      let from = ISO.test(params.de ?? "") ? params.de! : startOfMonth(today);
      let to = ISO.test(params.ate ?? "") ? params.ate! : today;
      if (to > today) to = today;
      if (from > to) [from, to] = [to, from];
      if (daysBetween(from, to) > MAX_DAYS) from = addDays(to, -MAX_DAYS);
      return { id, from, to, label: `${formatDate(from)} a ${formatDate(to)}` };
    }
    default:
      return { id: "mes", from: startOfMonth(today), to: today, label: "Este mês" };
  }
}

export function periodQuery(period: Period, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ periodo: period.id, ...extra });
  if (period.id === "intervalo") {
    q.set("de", period.from);
    q.set("ate", period.to);
  }
  return q.toString();
}
