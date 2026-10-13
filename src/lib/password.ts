// Regras da senha, usadas no servidor (validação) e no formulário (lista que
// vai marcando enquanto a pessoa digita). Mesma regra configurada no Supabase.
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;

export const PASSWORD_RULES = [
  { id: "length", label: `Pelo menos ${PASSWORD_MIN} caracteres`, test: (v: string) => v.length >= PASSWORD_MIN },
  { id: "lower", label: "Uma letra minúscula", test: (v: string) => /[a-z]/.test(v) },
  { id: "upper", label: "Uma letra maiúscula", test: (v: string) => /[A-Z]/.test(v) },
  { id: "digit", label: "Um número", test: (v: string) => /[0-9]/.test(v) },
  { id: "symbol", label: "Um símbolo, como ! @ # $ %", test: (v: string) => /[^A-Za-z0-9\s]/.test(v) },
] as const;

export function passwordIssues(value: string) {
  return PASSWORD_RULES.filter((r) => !r.test(value));
}
