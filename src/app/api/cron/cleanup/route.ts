import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/lib/heartbeat";
import { describeError, logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY = 86_400_000;

/**
 * Uma vez por dia: apaga registros técnicos que só servem por pouco tempo.
 * A Política de Privacidade promete que tentativas de acesso não ficam
 * guardadas; é esta rotina que cumpre a promessa.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const admin = createAdminClient();
    const before = (days: number) => new Date(Date.now() - days * DAY).toISOString();

    const results = await Promise.all([
      admin.from("rate_limits").delete({ count: "exact" }).lt("reset_at", before(1)),
      admin.from("notification_log").delete({ count: "exact" }).lt("sent_at", before(30)),
      admin.from("ops_alerts").delete({ count: "exact" }).lt("resolved_at", before(90)),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;

    const result = {
      rateLimits: results[0].count ?? 0,
      notifications: results[1].count ?? 0,
      resolvedAlerts: results[2].count ?? 0,
    };
    await recordHeartbeat("cron.cleanup", { ok: true, result });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = describeError(error);
    logger.error("cron.cleanup", { message });
    await recordHeartbeat("cron.cleanup", { ok: false, error: message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const POST = GET;
