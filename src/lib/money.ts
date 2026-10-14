// "1.234,56", "1234,56", "R$ 1.234" ou "1234.56" viram centavos.
export function parseMoney(raw: string): number | null {
  const clean = raw.replace(/[^\d,.]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(clean) ? clean.replace(/\./g, "") : clean;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

/**
 * Máscara do campo de valor enquanto digita: pontos de milhar automáticos e
 * centavos só se a pessoa digitar a vírgula. "500000" vira "500.000".
 */
export function maskMoneyInput(raw: string) {
  const [intRaw = "", ...rest] = raw.replace(/[^\d,]/g, "").split(",");
  const digits = intRaw.replace(/^0+(?=\d)/, "").slice(0, 12);
  const int = digits ? Number(digits).toLocaleString("pt-BR") : rest.length ? "0" : "";
  return rest.length ? `${int},${rest.join("").slice(0, 2)}` : int;
}

export function centsToInput(cents: number | null) {
  if (!cents) return "";
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
