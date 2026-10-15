import "server-only";

export type Address = { cep: string; street: string; district: string; city: string; uf: string; ibge: string };

/**
 * Endereço e código IBGE a partir do CEP, pelo ViaCEP (público e gratuito).
 * Assim ninguém precisa saber o código IBGE da cidade para emitir nota.
 */
export async function lookupCep(raw: string): Promise<Address | null> {
  const cep = raw.replace(/\D/g, "");
  if (cep.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const d = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string; ibge?: string };
    if (d.erro || !d.ibge || !d.uf || !d.localidade) return null;
    return { cep, street: d.logradouro ?? "", district: d.bairro ?? "", city: d.localidade, uf: d.uf, ibge: d.ibge };
  } catch {
    return null;
  }
}
