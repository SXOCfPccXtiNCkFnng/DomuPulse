// Fusos do Brasil oferecidos nas configurações. A maior parte do país segue Brasília.
export const BR_TIMEZONES = [
  { id: "America/Sao_Paulo", label: "Brasília (maior parte do país)" },
  { id: "America/Manaus", label: "Amazonas" },
  { id: "America/Cuiaba", label: "Mato Grosso" },
  { id: "America/Campo_Grande", label: "Mato Grosso do Sul" },
  { id: "America/Porto_Velho", label: "Rondônia" },
  { id: "America/Boa_Vista", label: "Roraima" },
  { id: "America/Rio_Branco", label: "Acre" },
  { id: "America/Noronha", label: "Fernando de Noronha" },
] as const;

export const MAX_SLOTS = 8;
export const MIN_SLOT_GAP_MIN = 60;
export const EARLIEST_SLOT = "06:00";
export const LATEST_SLOT = "23:00";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Confere os horários de relatório: formato, faixa do dia e distância mínima
 * entre eles (os lembretes de um horário não podem atropelar os do próximo).
 * Devolve a lista ordenada ou o motivo da recusa.
 */
export function checkSlots(raw: string[]): { ok: true; slots: string[] } | { ok: false; error: string } {
  const slots = [...new Set(raw.map((s) => s.trim()).filter(Boolean))].sort();
  if (slots.length === 0) return { ok: false, error: "Defina pelo menos um horário de relatório." };
  if (slots.length > MAX_SLOTS) return { ok: false, error: `No máximo ${MAX_SLOTS} horários por dia.` };
  for (const s of slots) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return { ok: false, error: `Horário inválido: ${s}.` };
    if (s < EARLIEST_SLOT || s > LATEST_SLOT) return { ok: false, error: `Use horários entre ${EARLIEST_SLOT} e ${LATEST_SLOT}.` };
  }
  for (let i = 1; i < slots.length; i++) {
    if (toMin(slots[i]) - toMin(slots[i - 1]) < MIN_SLOT_GAP_MIN) {
      return { ok: false, error: `Deixe pelo menos 1 hora entre ${slots[i - 1]} e ${slots[i]}.` };
    }
  }
  return { ok: true, slots };
}
