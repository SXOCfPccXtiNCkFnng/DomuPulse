// Compartilhado entre servidor e cliente: regiões das visitas e a semana do quadro.
import { addDays } from "@/lib/time";

export const VISIT_REGIONS = ["Zona Leste", "Zona Oeste", "Zona Norte", "Zona Sul", "Centro", "Sem preferência", "Outras regiões"];

/** O quadro de visitas vira na quinta: a semana vai de quinta a quarta. */
export function startOfVisitWeek(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); // domingo = 0, quinta = 4
  return addDays(date, -((weekday - 4 + 7) % 7));
}

export const VISIT_WEEKDAYS = ["Quinta", "Sexta", "Sábado", "Domingo", "Segunda", "Terça", "Quarta"];

export type AppointmentStatus = "scheduled" | "done" | "no_show" | "canceled";

/** Situação da visita (as cores da planilha). O status da agenda acompanha. */
export const VISIT_STAGES = {
  message_sent: { label: "Mensagem enviada", status: "scheduled", row: "bg-[#38761d]/15", chip: "bg-[#38761d] text-white" },
  confirmed: { label: "Cliente confirmado", status: "scheduled", row: "bg-[#f1c232]/20", chip: "bg-[#f1c232] text-[#3d2f00]" },
  rescheduled: { label: "Cliente remarcado", status: "scheduled", row: "bg-[#9fc5e8]/25", chip: "bg-[#9fc5e8] text-[#0b2a45]" },
  no_show: { label: "Cliente não veio", status: "no_show", row: "bg-[#e53935]/15", chip: "bg-[#e53935] text-white" },
  wont_come: { label: "Cliente não irá vir", status: "canceled", row: "bg-[#980000]/20", chip: "bg-[#980000] text-white" },
  visited: { label: "Visita", status: "done", row: "bg-[#22c55e]/15", chip: "bg-[#22c55e] text-[#052e12]" },
} as const satisfies Record<string, { label: string; status: AppointmentStatus; row: string; chip: string }>;

export type VisitStage = keyof typeof VISIT_STAGES;
export const VISIT_STAGE_KEYS = Object.keys(VISIT_STAGES) as VisitStage[];

/** Situação mostrada: a escolhida ou, sem escolha, a que corresponde ao status. */
export function visitStageOf(stage: string | null | undefined, status: AppointmentStatus): VisitStage | null {
  if (stage && stage in VISIT_STAGES) return stage as VisitStage;
  if (status === "done") return "visited";
  if (status === "no_show") return "no_show";
  if (status === "canceled") return "wont_come";
  return null;
}
