const BASE = "http://pulse.invalid";

// Aceita apenas caminhos internos. Usa o mesmo parser de URL do navegador,
// que remove tabulações e trata "\" como "/": assim "//site.com",
// "/\site.com" e variações não escapam para outro domínio (open redirect).
export function safeNext(value: unknown, fallback = "/painel"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
