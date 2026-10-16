const BASE = "http://pulse.invalid";

// Aceita apenas caminhos internos. Usa o mesmo parser de URL do navegador,
// que remove tabulações e trata "\" como "/": assim "//site.com",
// "/\site.com" e variações não escapam para outro domínio (open redirect).
export function safeNext(value: unknown, fallback = "/painel"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  try {
    const first = new URL(value, BASE);
    if (first.origin !== BASE) return fallback;
    // Normaliza de novo com o caminho já decodificado: pega escapes como
    // "/%2e//evil.com" que, depois que o navegador decodifica, viram
    // "//evil.com" (outro domínio). Só então aceita o caminho.
    const second = new URL(decodeURIComponent(first.pathname), BASE);
    if (second.origin !== BASE || second.pathname.startsWith("//") || second.pathname.startsWith("/\\")) return fallback;
    return `${second.pathname}${first.search}`;
  } catch {
    return fallback;
  }
}
