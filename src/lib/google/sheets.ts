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

type SheetGrid = { sheetId: number; rowCount: number; columnCount: number };

/** Id e tamanho da grade da aba (a API recusa escrever fora desses limites). */
async function getSheetGrid(token: string, spreadsheetId: string, sheetTitle: string): Promise<SheetGrid> {
  const data = await call(token, `/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties)`);
  const sheet = ((data?.sheets ?? []) as { properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }[]).find(
    (s) => s.properties?.title === sheetTitle,
  );
  const props = sheet?.properties;
  if (props?.sheetId == null) throw new Error(`Aba "${sheetTitle}" não encontrada.`);
  return {
    sheetId: props.sheetId,
    rowCount: props.gridProperties?.rowCount ?? 1000,
    columnCount: props.gridProperties?.columnCount ?? 26,
  };
}

/**
 * Garante que a aba tenha pelo menos `columns` colunas e `rows` linhas.
 * Sem isso, escrever em N23 numa grade de 13 colunas devolve 400 do Google.
 */
export async function ensureSheetSize(token: string, spreadsheetId: string, sheetTitle: string, columns: number, rows = 0) {
  const grid = await getSheetGrid(token, spreadsheetId, sheetTitle);
  const needCols = Math.max(0, columns - grid.columnCount);
  const needRows = Math.max(0, rows - grid.rowCount);
  if (needCols === 0 && needRows === 0) return;

  const requests: object[] = [];
  if (needCols > 0) {
    requests.push({
      appendDimension: { sheetId: grid.sheetId, dimension: "COLUMNS", length: needCols },
    });
  }
  if (needRows > 0) {
    requests.push({
      appendDimension: { sheetId: grid.sheetId, dimension: "ROWS", length: needRows },
    });
  }
  await call(token, `/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}
