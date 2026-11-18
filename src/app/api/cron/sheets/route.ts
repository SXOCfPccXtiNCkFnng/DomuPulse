import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { importVisitsFromSheet } from "@/lib/google/visit-import";
import { pullEditsFromSheet } from "@/lib/google/visit-pull";
import { syncVisitsToSheet } from "@/lib/google/visit-sync";
import { describeError, logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Mantém as planilhas conectadas em sincronia nos dois sentidos. Para cada
// empresa: puxa as edições da planilha, importa as linhas novas e envia as
// visitas do sistema. A frequência é definida no agendador externo (cron-job.org
// ou Vercel Cron) chamando esta URL a cada poucos minutos, com o CRON_SECRET.
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: conns } = await createAdminClient().from("sheet_connections").select("org_id").eq("enabled", true);

  let synced = 0;
  for (const c of conns ?? []) {
    const orgId = c.org_id as string;
    try {
      await pullEditsFromSheet(orgId);
      await importVisitsFromSheet(orgId);
      await syncVisitsToSheet(orgId);
      synced += 1;
    } catch (err) {
      logger.error("cron.sheets", { message: describeError(err), orgId });
    }
  }

  return NextResponse.json({ ok: true, synced });
}
