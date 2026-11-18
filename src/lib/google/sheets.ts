import "server-only";

const API = "https://sheets.googleapis.com/v4/spreadsheets";

async function call(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json();
}

/** Letra da coluna a partir do índice (0 -> A, 26 -> AA). */
export function colLetter(index: number): string {
  let i = index + 1;
  let out = "";
  while (i > 0) {
    const m = (i - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    i = Math.floor((i - 1) / 26);
  }
  return out;
}

/** Todas as linhas da aba (inclui o cabeçalho). */
export async function getAllValues(token: string, spreadsheetId: string, sheetTitle: string): Promise<string[][]> {
  const range = encodeURIComponent(sheetTitle);
  const data = await call(token, `/${spreadsheetId}/values/${range}`);
  return ((data?.values ?? []) as unknown[][]).map((r) => r.map((c) => String(c ?? "")));
}

/** Atualiza várias faixas de uma vez (cada uma é uma célula ou bloco). */
export async function batchUpdateValues(token: string, spreadsheetId: string, data: { range: string; values: string[][] }[]) {
  if (data.length === 0) return;
  await call(token, `/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
}

/**
 * Acrescenta linhas logo após a tabela que contém `anchorRange` (ex.: a linha
 * de títulos da lista de clientes), para não inserir no meio da planilha.
 */
export async function appendRows(token: string, spreadsheetId: string, anchorRange: string, rows: string[][]) {
  if (rows.length === 0) return;
  const range = encodeURIComponent(anchorRange);
  await call(token, `/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: rows }),
  });
}

/** Título da primeira aba da planilha (onde vamos sincronizar). */
export async function firstSheetTitle(token: string, spreadsheetId: string): Promise<string> {
  const data = await call(token, `/${spreadsheetId}?fields=sheets.properties.title`);
  const title = data?.sheets?.[0]?.properties?.title;
  if (!title) throw new Error("A planilha não tem nenhuma aba.");
  return String(title);
}
