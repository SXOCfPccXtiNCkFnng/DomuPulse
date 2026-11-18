import "server-only";
import { refreshAccessToken } from "@/lib/google/oauth";
import { open, seal } from "@/lib/secret-box";
import { createAdminClient } from "@/lib/supabase/admin";

// Dados da conexão sem o token (seguros para mostrar na tela).
export type SheetConnection = {
  org_id: string;
  spreadsheet_id: string | null;
  spreadsheet_url: string | null;
  sheet_title: string | null;
  enabled: boolean;
  status: "connected" | "needs_sheet" | "error" | string;
  connected_by: string | null;
  last_push_at: string | null;
  last_pull_at: string | null;
};

const PUBLIC_COLS = "org_id, spreadsheet_id, spreadsheet_url, sheet_title, enabled, status, connected_by, last_push_at, last_pull_at";

/** Conexão da empresa (sem o token). Null se nunca conectou. */
export async function getSheetConnection(orgId: string): Promise<SheetConnection | null> {
  const { data } = await createAdminClient().from("sheet_connections").select(PUBLIC_COLS).eq("org_id", orgId).maybeSingle();
  return (data as SheetConnection | null) ?? null;
}

/** Guarda o refresh token (selado) após a autorização. */
export async function storeGoogleRefreshToken(orgId: string, refreshToken: string, connectedBy: string) {
  await createAdminClient()
    .from("sheet_connections")
    .upsert(
      {
        org_id: orgId,
        provider: "google",
        refresh_token_encrypted: seal(refreshToken),
        status: "needs_sheet",
        connected_by: connectedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
}

/** Access token novo para chamar as APIs do Google. Null se não há conexão. */
export async function getGoogleAccessToken(orgId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("sheet_connections").select("refresh_token_encrypted").eq("org_id", orgId).maybeSingle();
  const sealed = (data?.refresh_token_encrypted as string | null | undefined) ?? null;
  if (!sealed) return null;
  const refreshToken = open(sealed).toString("utf8");
  const token = await refreshAccessToken(refreshToken);
  return token.access_token;
}

/** Guarda a planilha escolhida no Picker e o mapa das colunas. */
export async function saveSpreadsheetSelection(
  orgId: string,
  input: { spreadsheetId: string; url: string; title: string; sheetTitle: string; columnMap: Record<string, number> },
) {
  await createAdminClient()
    .from("sheet_connections")
    .update({
      spreadsheet_id: input.spreadsheetId,
      spreadsheet_url: input.url,
      sheet_title: input.sheetTitle,
      column_map: input.columnMap,
      status: "connected",
      enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);
}

/** Remove a conexão (desconectar). O token deixa de existir no nosso lado. */
export async function removeSheetConnection(orgId: string) {
  await createAdminClient().from("sheet_connections").delete().eq("org_id", orgId);
}
