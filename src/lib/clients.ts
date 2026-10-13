export const STAGES = [
  { id: "lead", label: "Novo lead" },
  { id: "talking", label: "Em conversa" },
  { id: "scheduled", label: "Visita agendada" },
  { id: "visited", label: "Visitou" },
  { id: "proposal", label: "Proposta" },
  { id: "presale", label: "Pré-venda" },
  { id: "won", label: "Venda" },
  { id: "lost", label: "Perdido" },
] as const;

export type Stage = (typeof STAGES)[number]["id"];

export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label])) as Record<Stage, string>;

// Etapas em que o valor do negócio já importa: o topo da coluna mostra a soma.
export const VALUE_STAGES: Stage[] = ["proposal", "presale", "won"];

export const SOURCES = ["Portal imobiliário", "Instagram", "Facebook", "Google", "Indicação", "Placa", "Plantão", "WhatsApp", "Outro"];

export type Client = {
  id: string;
  member_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  interest: string | null;
  value_cents: number | null;
  notes: string | null;
  stage: Stage;
  lost_reason: string | null;
  stage_changed_at: string;
  created_at: string;
};

export const CLIENT_COLUMNS =
  "id, member_id, name, phone, email, source, interest, value_cents, notes, stage, lost_reason, stage_changed_at, created_at";

export function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
}
