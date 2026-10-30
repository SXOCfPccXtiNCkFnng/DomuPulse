import { formatMoney } from "@/lib/metrics";

// Regras puras do reajuste de contratos (sem banco, sem rede).

export const INDEXES = {
  ipca: { label: "IPCA", sgs: 433 },
  igpm: { label: "IGP-M", sgs: 189 },
  incc_m: { label: "INCC-M", sgs: 7456 },
  incc_di: { label: "INCC-DI", sgs: 192 },
} as const;

export type IndexCode = keyof typeof INDEXES;
export const INDEX_CODES = Object.keys(INDEXES) as IndexCode[];

export function isIndexCode(v: unknown): v is IndexCode {
  return typeof v === "string" && v in INDEXES;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-03-31" + 1 mês = "2026-04-30" (o dia não passa do fim do mês). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`;
}

/** "2026-03-15" → "2026-03". */
export const monthOf = (date: string) => date.slice(0, 7);

/** "2026-03" → "mar/26". */
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  const name = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1))).replace(".", "");
  return `${name}/${String(y).slice(2)}`;
}

/**
 * Próximo reajuste: o primeiro aniversário da data-base (a cada
 * periodMonths) depois do último reajuste aplicado. Pode estar no passado:
 * é o reajuste esquecido que o sistema existe para pegar.
 */
export function nextDueDate(baseDate: string, periodMonths: number, lastAdjustedOn: string | null): string {
  const after = lastAdjustedOn && lastAdjustedOn > baseDate ? lastAdjustedOn : baseDate;
  let k = 1;
  let due = addMonths(baseDate, periodMonths);
  while (due <= after) due = addMonths(baseDate, periodMonths * ++k);
  return due;
}

/**
 * Meses do índice que entram no reajuste: os periodMonths meses que terminam
 * lagMonths antes do mês do reajuste. Reajuste em mar/26 com 1 mês de
 * defasagem usa mar/25 a fev/26.
 */
export function indexWindow(dueOn: string, periodMonths: number, lagMonths: number): string[] {
  const last = addMonths(`${monthOf(dueOn)}-01`, -lagMonths);
  return Array.from({ length: periodMonths }, (_, i) => monthOf(addMonths(last, i - periodMonths + 1)));
}

export type Accumulation = {
  /** Variação acumulada, em % (ex.: 4.5123). */
  pct: number;
  used: { month: string; pct: number }[];
  /** Meses ainda não publicados: o resultado é uma estimativa. */
  missing: string[];
};

/** Acumulado composto: (1 + a) × (1 + b) × ... − 1. Os meses não somam. */
export function accumulate(months: string[], values: Map<string, number>): Accumulation {
  let factor = 1;
  const used: Accumulation["used"] = [];
  const missing: string[] = [];
  for (const month of months) {
    const pct = values.get(month);
    if (pct === undefined) {
      missing.push(month);
      continue;
    }
    factor *= 1 + pct / 100;
    used.push({ month, pct });
  }
  return { pct: Math.round((factor - 1) * 100 * 10000) / 10000, used, missing };
}

/** Novo valor, em centavos. Sem allowDecrease, índice negativo mantém o valor. */
export function adjustedValue(valueCents: number, pct: number, allowDecrease: boolean): number {
  const effective = pct < 0 && !allowDecrease ? 0 : pct;
  return Math.max(1, Math.round(valueCents * (1 + effective / 100)));
}

export function formatPct(pct: number) {
  return `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

const formatDay = (date: string) => date.split("-").reverse().join("/");

/** Texto padrão da carta de reajuste. A pessoa pode editar antes de aprovar. */
export function buildLetter(d: {
  orgName: string;
  kind: "locacao" | "venda";
  reference: string;
  partyName: string;
  dueOn: string;
  indexCode: IndexCode;
  months: string[];
  pct: number;
  oldCents: number;
  newCents: number;
}) {
  const what = d.kind === "locacao" ? "do aluguel" : "da parcela";
  const contract = d.kind === "locacao" ? "locação" : "compra e venda";
  const period = d.months.length ? `de ${monthLabel(d.months[0])} a ${monthLabel(d.months[d.months.length - 1])}` : "do período";
  const index = `${INDEXES[d.indexCode].label} acumulado ${period}: ${formatPct(d.pct)}`;
  const body =
    d.newCents === d.oldCents
      ? `Conforme o contrato de ${contract} referente a ${d.reference}, a data de reajuste ${what} é ${formatDay(d.dueOn)}. ` +
        `Como o índice do período ficou negativo, o valor permanece ${formatMoney(d.oldCents)}.\n\n${index}`
      : `Conforme o contrato de ${contract} referente a ${d.reference}, o valor ${what} será reajustado a partir de ${formatDay(d.dueOn)}.\n\n` +
        `${index}\nValor atual: ${formatMoney(d.oldCents)}\nNovo valor: ${formatMoney(d.newCents)}`;
  return `Prezado(a) ${d.partyName},\n\n${body}\n\nFicamos à disposição para qualquer dúvida.\n\nAtenciosamente,\n${d.orgName}`;
}
