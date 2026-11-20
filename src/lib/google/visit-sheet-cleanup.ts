import "server-only";

/**
 * ANTES: apagava colunas/linhas ("ID Pulse", "Situação") e estragava o layout
 * da planilha do cliente (legenda, merges, formatação).
 *
 * Agora NÃO mexe na planilha. O sync já deixou de criar coluna/linha nova;
 * restaurar o visual é pelo histórico de versões do Google Sheets.
 */
export async function cleanSheetPulseExtras(_orgId: string): Promise<{ clearedTabs: number; deletedRows: number } | { error: string }> {
  return { clearedTabs: 0, deletedRows: 0 };
}
