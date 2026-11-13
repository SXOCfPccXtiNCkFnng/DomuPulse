// Compartilhado entre servidor e cliente: regiões das visitas e a semana do quadro.
import { addDays } from "@/lib/time";

export const VISIT_REGIONS = ["Zona Leste", "Zona Oeste", "Zona Norte", "Zona Sul", "Centro", "Sem preferência", "Outras regiões"];

/** O quadro de visitas vira na quinta: a semana vai de quinta a quarta. */
export function startOfVisitWeek(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); // domingo = 0, quinta = 4
  return addDays(date, -((weekday - 4 + 7) % 7));
}

export const VISIT_WEEKDAYS = ["Quinta", "Sexta", "Sábado", "Domingo", "Segunda", "Terça", "Quarta"];
