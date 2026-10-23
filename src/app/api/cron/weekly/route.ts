import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/lib/heartbeat";
import { describeError, logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWeeklyDigests } from "@/lib/weekly-digest";

// Resumos podem demorar com muitas empresas: até 60 s no plano gratuito.
export const maxDuration = 60;

/**
 * Toda segunda de manhã: resumo da semana anterior para a liderança.
 * Rodar em outro dia também funciona (manda a última semana completa,
 * uma vez só por pessoa).
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { data: orgs, error } = await createAdminClient()
      .from("organizations")
      .select("id, name, timezone, report_slots, status, trial_ends_at")
      .in("status", ["trialing", "active", "past_due"]);
    if (error) throw error;

    let sent = 0;
    for (const org of orgs ?? []) {
      if (org.status === "trialing" && new Date(org.trial_ends_at) <= new Date()) continue;
      try {
        sent += await sendWeeklyDigests(org);
      } catch (err) {
        // Uma empresa com problema não impede o resumo das outras.
        logger.error("cron.weekly_org", { message: describeError(err), orgId: org.id });
      }
    }

    await recordHeartbeat("cron.weekly", { ok: true, result: { sent } });
    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    const message = describeError(error);
    logger.error("cron.weekly", { message });
    await recordHeartbeat("cron.weekly", { ok: false, error: message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const POST = GET;
