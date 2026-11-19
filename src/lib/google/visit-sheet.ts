// Campos de uma visita na planilha e o casamento automático com os cabeçalhos
// que a empresa já usa. Compartilhado entre servidor e cliente.

export type VisitField = "client_name" | "client_phone" | "date" | "time" | "region" | "broker" | "status";

export const VISIT_FIELDS: { key: VisitField; label: string; synonyms: string[] }[] = [
  { key: "client_name", label: "Nome do cliente", synonyms: ["nome", "cliente", "nome do cliente", "nome cliente", "lead"] },
  { key: "client_phone", label: "Telefone", synonyms: ["telefone", "fone", "whatsapp", "celular", "contato", "tel"] },
  { key: "date", label: "Dia", synonyms: ["dia"] },
  { key: "time", label: "Horário", synonyms: ["horario", "hora", "horas"] },
  { key: "region", label: "Região", synonyms: ["regiao", "zona", "bairro", "local", "localizacao"] },
  { key: "broker", label: "Corretor", synonyms: ["corretor", "consultor", "responsavel", "vendedor", "agente"] },
  { key: "status", label: "Situação", synonyms: ["situacao", "status", "etapa"] },
];

// Coluna que o Pulse controla para casar cada linha com a visita certa.
export const PULSE_ID_HEADER = "ID Pulse";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Casa os cabeçalhos da planilha com os nossos campos. Devolve { campo: indiceDaColuna }. */
export function autoMapHeaders(headers: string[]): Partial<Record<VisitField, number>> {
  const norm = headers.map(normalize);
  const map: Partial<Record<VisitField, number>> = {};
  for (const field of VISIT_FIELDS) {
    const wanted = [normalize(field.label), ...field.synonyms.map(normalize)];
    const idx = norm.findIndex((h) => h.length > 0 && wanted.includes(h));
    if (idx >= 0 && !Object.values(map).includes(idx)) map[field.key] = idx;
  }
  return map;
}

/**
 * Acha a linha dos títulos (Nome, Telefone, Corretor...) mesmo que ela não seja
 * a primeira (planilhas reais têm quadros e títulos antes). Escolhe a linha que
 * casa mais campos e que tem nome ou telefone. Varre só o começo da planilha.
 */
export function locateHeader(grid: string[][]): { index: number; headers: string[] } | null {
  let best = { index: -1, score: 0 };
  const limit = Math.min(grid.length, 200);
  for (let i = 0; i < limit; i++) {
    const row = (grid[i] ?? []).map((c) => String(c ?? ""));
    const map = autoMapHeaders(row);
    const score = Object.keys(map).length;
    const hasKey = map.client_name !== undefined || map.client_phone !== undefined;
    if (hasKey && score > best.score) best = { index: i, score };
  }
  if (best.index < 0 || best.score < 3) return null;
  return { index: best.index, headers: (grid[best.index] ?? []).map((c) => String(c ?? "")) };
}
