import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/lib/heartbeat";
import { describeError, logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDailyDigests } from "@/lib/daily-digest";
import { sendPeriodDigests } from "@/lib/weekly-digest";

// Resumos podem demorar com muitas imobiliárias: até 60 s no plano gratuito.
export const maxDuration = 60;

/**
 * De hora em hora: manda os resumos por e-mail da liderança, cada um no
 * momento que a pessoa escolheu em Conta, aba Notificações:
 *  - do dia: na hora escolhida, ou 1 hora depois do último horário de relatório;
 *  - da semana: no dia da semana escolhido, a partir das 8h;
 *  - do mês: no dia 1, a partir das 8h.
 * Rodar várias vezes não repete nenhum e-mail.
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
        sent += await sendDailyDigests(org);
        sent += await sendPeriodDigests(org, "week");
        sent += await sendPeriodDigests(org, "month");
      } catch (err) {
        // Uma imobiliária com problema não impede o resumo das outras.
        logger.error("cron.daily_org", { message: describeError(err), orgId: org.id });
      }
    }

    await recordHeartbeat("cron.daily", { ok: true, result: { sent } });
    // Esta rotina também manda o semanal e o mensal: a tarefa antiga de
    // /api/cron/weekly deixou de ser necessária.
    await recordHeartbeat("cron.weekly", { ok: true, result: { via: "daily" } });
    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    const message = describeError(error);
    logger.error("cron.daily", { message });
    await recordHeartbeat("cron.daily", { ok: false, error: message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const POST = GET;
