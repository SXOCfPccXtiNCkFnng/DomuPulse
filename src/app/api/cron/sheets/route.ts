import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { syncVisitsToSheet } from "@/lib/google/visit-sync";
import { describeError, logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Mantém as planilhas conectadas em dia (sistema -> planilha). A frequência é
// definida no agendador do host (ex.: a cada poucos minutos).
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: conns } = await createAdminClient().from("sheet_connections").select("org_id").eq("enabled", true);

  let synced = 0;
  for (const c of conns ?? []) {
    try {
      const r = await syncVisitsToSheet(c.org_id as string);
      if ("pushed" in r) synced += 1;
    } catch (err) {
      logger.error("cron.sheets", { message: describeError(err), orgId: c.org_id as string });
    }
  }

  return NextResponse.json({ ok: true, synced });
}
