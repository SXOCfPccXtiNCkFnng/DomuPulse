// Simulador de financiamento imobiliário (ESTIMATIVA, não é proposta do banco).
// Usa as fórmulas públicas SAC e PRICE e as regras do crédito imobiliário.
// Os parâmetros (juros, faixas do MCMV, etc.) vêm de uma config que o
// administrador edita no /interno; os valores abaixo são o padrão/fallback.

export type AmortizationSystem = "sac" | "price";

// Faixas do Minha Casa Minha Vida: renda bruta familiar -> juros e teto do imóvel.
export type McmvBand = { name: string; incomeMax: number; annualRate: number; propertyCap: number };

export type FinancingConfig = {
  /** Juros efetivo ao ano do crédito normal (SBPE). */
  annualRate: number;
  /** Parcela não pode passar deste percentual da renda (ex.: 0,30). */
  maxIncomeCommit: number;
  /** Quanto do valor do imóvel pode ser financiado (ex.: 0,80). */
  maxLtv: number;
  /** Prazo máximo, em meses. */
  maxTermMonths: number;
  mcmvBands: McmvBand[];
};

// Padrão nov/2026 (Portaria MCID 333/2026 e taxa SBPE da Caixa). Confirme e
// ajuste no /interno quando o programa ou a taxa mudarem.
export const DEFAULT_CONFIG: FinancingConfig = {
  annualRate: 0.115,
  maxIncomeCommit: 0.3,
  maxLtv: 0.8,
  maxTermMonths: 420,
  mcmvBands: [
    { name: "Faixa 1", incomeMax: 3200, annualRate: 0.04, propertyCap: 275000 },
    { name: "Faixa 2", incomeMax: 5000, annualRate: 0.07, propertyCap: 275000 },
    { name: "Faixa 3", incomeMax: 9600, annualRate: 0.0816, propertyCap: 400000 },
    { name: "Faixa 4", incomeMax: 13000, annualRate: 0.1, propertyCap: 600000 },
  ],
};

export const TERM_OPTIONS = [120, 180, 240, 300, 360, 420];

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Valida uma config vinda do banco (JSON) e completa com o padrão o que faltar. */
export function normalizeConfig(raw: unknown): FinancingConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bandsRaw = Array.isArray(r.mcmvBands) && r.mcmvBands.length ? r.mcmvBands : DEFAULT_CONFIG.mcmvBands;
  const mcmvBands = bandsRaw.map((b, i) => {
    const o = (b ?? {}) as Record<string, unknown>;
    const d = DEFAULT_CONFIG.mcmvBands[i] ?? { name: `Faixa ${i + 1}`, incomeMax: 0, annualRate: 0, propertyCap: 0 };
    return {
      name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : d.name,
      incomeMax: num(o.incomeMax, d.incomeMax),
      annualRate: num(o.annualRate, d.annualRate),
      propertyCap: num(o.propertyCap, d.propertyCap),
    };
  });
  return {
    annualRate: num(r.annualRate, DEFAULT_CONFIG.annualRate),
    maxIncomeCommit: num(r.maxIncomeCommit, DEFAULT_CONFIG.maxIncomeCommit),
    maxLtv: num(r.maxLtv, DEFAULT_CONFIG.maxLtv),
    maxTermMonths: num(r.maxTermMonths, DEFAULT_CONFIG.maxTermMonths),
    mcmvBands,
  };
}

/** Faixa do MCMV em que a renda se enquadra (a menor faixa que a comporta). */
export function bandFor(bands: McmvBand[], incomeReais: number): McmvBand | null {
  if (incomeReais <= 0) return null;
  return [...bands].sort((a, b) => a.incomeMax - b.incomeMax).find((b) => incomeReais <= b.incomeMax) ?? null;
}

/** Juros efetivo ao mês a partir do efetivo ao ano. */
export const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

/** Parcela fixa do sistema PRICE. */
export function priceInstallment(principal: number, annual: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  const i = monthlyRate(annual);
  return i <= 0 ? principal / months : (principal * i) / (1 - Math.pow(1 + i, -months));
}

/** Primeira (maior) parcela do SAC: amortização + juros sobre o saldo inicial. */
export function sacFirstInstallment(principal: number, annual: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  return principal / months + principal * monthlyRate(annual);
}

/** Última (menor) parcela do SAC. */
export function sacLastInstallment(principal: number, annual: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  const amort = principal / months;
  return amort + amort * monthlyRate(annual);
}

/** Maior valor financiável para uma parcela caber, por sistema. */
export function maxPrincipal(system: AmortizationSystem, installment: number, annual: number, months: number) {
  if (installment <= 0 || months <= 0) return 0;
  const i = monthlyRate(annual);
  if (system === "price") return i <= 0 ? installment * months : (installment * (1 - Math.pow(1 + i, -months))) / i;
  // SAC: parcela inicial = P * (1/n + i)  ->  P = parcela / (1/n + i)
  return installment / (1 / months + i);
}

export type IncomeResult = {
  annual: number;
  band: McmvBand | null;
  maxInstallment: number;
  maxProperty: number;
  financed: number;
  down: number;
  installment: number;
  lastInstallment: number | null;
  overMcmvCap: boolean;
  /** O que está segurando o valor: a entrada (LTV) ou a renda (30%). */
  limitedBy: "down" | "income";
};

/** Modo 1: pela renda e entrada, quanto o cliente consegue comprar. */
export function simulateByIncome(
  input: { incomeReais: number; downReais: number; months: number; system: AmortizationSystem },
  config: FinancingConfig = DEFAULT_CONFIG,
): IncomeResult {
  const band = bandFor(config.mcmvBands, input.incomeReais);
  const annual = band ? band.annualRate : config.annualRate;
  const maxInstallment = config.maxIncomeCommit * input.incomeReais;
  const maxFinanced = maxPrincipal(input.system, maxInstallment, annual, input.months);
  const ltvCap = config.maxLtv < 1 ? input.downReais / (1 - config.maxLtv) : Infinity;
  const byIncome = input.downReais + maxFinanced;
  const maxProperty = Math.max(0, Math.min(byIncome, ltvCap));
  const limitedBy: "down" | "income" = ltvCap < byIncome ? "down" : "income";
  const financed = Math.max(0, maxProperty - input.downReais);
  const installment = input.system === "price" ? priceInstallment(financed, annual, input.months) : sacFirstInstallment(financed, annual, input.months);
  return {
    annual,
    band,
    maxInstallment,
    maxProperty,
    financed,
    down: Math.min(input.downReais, maxProperty),
    installment,
    lastInstallment: input.system === "sac" ? sacLastInstallment(financed, annual, input.months) : null,
    overMcmvCap: band ? maxProperty > band.propertyCap : false,
    limitedBy,
  };
}

export type PropertyResult = {
  annual: number;
  band: McmvBand | null;
  minDown: number;
  down: number;
  financed: number;
  installment: number;
  lastInstallment: number | null;
  incomeNeeded: number;
  fitsIncome: boolean | null;
};

/** Modo 2: para um valor de imóvel, qual a entrada, parcela e renda necessária. */
export function simulateByProperty(
  input: { propertyReais: number; downReais: number; incomeReais: number; months: number; system: AmortizationSystem },
  config: FinancingConfig = DEFAULT_CONFIG,
): PropertyResult {
  const band = input.incomeReais > 0 ? bandFor(config.mcmvBands, input.incomeReais) : null;
  const annual = band ? band.annualRate : config.annualRate;
  const minDown = (1 - config.maxLtv) * input.propertyReais;
  const down = Math.max(input.downReais, minDown);
  const financed = Math.max(0, input.propertyReais - down);
  const installment = input.system === "price" ? priceInstallment(financed, annual, input.months) : sacFirstInstallment(financed, annual, input.months);
  const incomeNeeded = config.maxIncomeCommit > 0 ? installment / config.maxIncomeCommit : 0;
  return {
    annual,
    band,
    minDown,
    down,
    financed,
    installment,
    lastInstallment: input.system === "sac" ? sacLastInstallment(financed, annual, input.months) : null,
    incomeNeeded,
    fitsIncome: input.incomeReais > 0 ? installment <= config.maxIncomeCommit * input.incomeReais : null,
  };
}

export const formatRate = (annual: number) => `${(annual * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.a.`;
