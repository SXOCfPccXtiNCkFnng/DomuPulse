// Telefone brasileiro: máscara enquanto digita e validação de DDD e formato.

const VALID_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

function digitsOf(raw: string) {
  let d = raw.replace(/\D/g, "");
  // Colado com o código do país.
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d.slice(0, 11);
}

export function formatPhoneBR(raw: string): string {
  const d = digitsOf(raw);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)} ${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)} ${d.slice(7)}`;
}

export function validatePhoneBR(raw: string): { ok: true; digits: string } | { ok: false; error: string } {
  const d = digitsOf(raw);
  if (d.length === 0) return { ok: false, error: "Informe o WhatsApp." };
  if (d.length < 10) return { ok: false, error: "Informe DDD e número, como (11) 99999 0000." };
  if (!VALID_DDDS.has(d.slice(0, 2))) return { ok: false, error: `O DDD ${d.slice(0, 2)} não existe no Brasil.` };
  if (d.length === 11 && d[2] !== "9") return { ok: false, error: "Celular precisa começar com 9 depois do DDD." };
  if (d.length === 10 && !/[2-5]/.test(d[2])) return { ok: false, error: "Número fixo inválido. Para celular, inclua o 9." };
  const number = d.slice(2);
  if (/^(\d)\1+$/.test(number) || number === "123456789") return { ok: false, error: "Informe um número de WhatsApp real." };
  return { ok: true, digits: d };
}
