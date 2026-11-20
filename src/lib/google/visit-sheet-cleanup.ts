import "server-only";
import { getGoogleAccessToken } from "@/lib/google/connection";
import { deleteColumns, deleteRows, getAllValues, listSheetTitles } from "@/lib/google/sheets";
import { locateHeader, PULSE_ID_HEADER } from "@/lib/google/visit-sheet";
import { syncableMonth } from "@/lib/google/visit-tabs";
import { createAdminClient } from "@/lib/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Notas que indicam visita que já nasceu da planilha (a linha dela deve ficar). */
function fromSheetNotes(notes: string | null | undefined) {
  const n = (notes ?? "").toLowerCase();
  return n.includes("planilha") || n.includes("importado");
}

/**
 * Tira da planilha o que o Pulse acrescentou fora do padrão:
 * - linhas que o sistema inseriu (têm "ID Pulse" e a visita não veio da planilha);
 * - colunas "ID Pulse" e "Situação" que o sync criou.
 * Idempotente: se já estiver limpo, não faz nada.
 */
export async function cleanSheetPulseExtras(orgId: string): Promise<{ clearedTabs: number; deletedRows: number } | { error: string }> {
  const admin = createAdminClient();
  const { data: conn } = await admin.from("sheet_connections").select("spreadsheet_id, enabled").eq("org_id", orgId).maybeSingle();
  if (!conn?.spreadsheet_id || !conn.enabled) return { error: "sem-planilha" };

  const token = await getGoogleAccessToken(orgId);
  if (!token) return { error: "sem-token" };
  const spreadsheetId = conn.spreadsheet_id as string;

  const titles = await listSheetTitles(token, spreadsheetId);
  let clearedTabs = 0;
  let deletedRows = 0;

  for (const title of titles) {
    if (!syncableMonth(title)) continue;
    const grid = await getAllValues(token, spreadsheetId, title);
    const found = locateHeader(grid);
    if (!found) continue;

    const headers = found.headers.map((h) => h.trim());
    const pulseCol = headers.findIndex((h) => h === PULSE_ID_HEADER);
    const situacaoCol = headers.findIndex((h) => h === "Situação");

    // 1) Linhas que o Pulse acrescentou: têm UUID em ID Pulse e a visita não veio da planilha.
    if (pulseCol >= 0) {
      const dataStart = found.index + 2;
      const pulseIds: { row: number; id: string }[] = [];
      grid.slice(found.index + 1).forEach((r, i) => {
        const pid = (r[pulseCol] ?? "").trim();
        if (pid && uuid.test(pid)) pulseIds.push({ row: dataStart + i, id: pid });
      });

      if (pulseIds.length) {
        const { data: appts } = await admin
          .from("appointments")
          .select("id, notes")
          .eq("org_id", orgId)
          .in(
            "id",
            pulseIds.map((p) => p.id),
          );
        const notesOf = new Map((appts ?? []).map((a) => [a.id as string, a.notes as string | null]));
        const toDelete = pulseIds.filter((p) => {
          if (!notesOf.has(p.id)) return true; // visita já não existe: linha extra
          return !fromSheetNotes(notesOf.get(p.id));
        }).map((p) => p.row);

        if (toDelete.length) {
          await deleteRows(token, spreadsheetId, title, toDelete);
          deletedRows += toDelete.length;
        }
      }
    }

    // 2) Relê depois das exclusões (índices de coluna ainda valem na linha de título).
    //    Apaga as colunas extras do Pulse (Situação criada + ID Pulse).
    const grid2 = pulseCol >= 0 || situacaoCol >= 0 ? await getAllValues(token, spreadsheetId, title) : grid;
    const found2 = locateHeader(grid2) ?? found;
    const headers2 = found2.headers.map((h) => h.trim());
    const colsToDelete = [headers2.findIndex((h) => h === PULSE_ID_HEADER), headers2.findIndex((h) => h === "Situação")].filter((i) => i >= 0);

    if (colsToDelete.length) {
      await deleteColumns(token, spreadsheetId, title, colsToDelete);
      clearedTabs += 1;
    } else if (pulseCol >= 0 || situacaoCol >= 0) {
      clearedTabs += 1;
    }
  }

  return { clearedTabs, deletedRows };
}
