import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { sendTrialEndedEmail, sendTrialEndingEmail } from "@/lib/email-templates";
import { recordHeartbeat } from "@/lib/heartbeat";
import { describeError, logger } from "@/lib/logger";
import { notifyRoles } from "@/lib/notify";
import { orgOwnerContact } from "@/lib/org-owner";
import { createAdminClient } from "@/lib/supabase/admin";

// Teste de 3 dias: avisa no último dia.
const REMIND_DAYS_BEFORE = 1;

/**
 * Uma vez por dia: avisa o administrador quando faltam 3 dias para o teste
 * acabar (1 dia antes) e quando ele acaba. Cada aviso é "reservado" no banco antes de sair,
 * então rodar duas vezes no mesmo dia não manda e-mail repetido.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await run();
    await recordHeartbeat("cron.billing", { ok: true, result });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = describeError(error);
    logger.error("cron.billing", { message });
    await recordHeartbeat("cron.billing", { ok: false, error: message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const POST = GET;

async function run() {
  const admin = createAdminClient();
  const now = new Date();
  const soon = new Date(now.getTime() + REMIND_DAYS_BEFORE * 86_400_000);
  let ending = 0;
  let ended = 0;

  // Teste acabando: reserva o aviso e só envia se a reserva foi desta execução.
  const { data: endingOrgs, error: e1 } = await admin
    .from("organizations")
    .update({ trial_reminder_sent_at: now.toISOString() })
    .eq("status", "trialing")
    .is("trial_reminder_sent_at", null)
    .gt("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", soon.toISOString())
    .select("id, name, trial_ends_at");
  if (e1) throw e1;

  for (const org of endingOrgs ?? []) {
    await notifyRoles(org.id, ["owner"], {
      kind: "trial_ending",
      title: "Acesso gratuito acabando",
      body: "Ative a assinatura para a equipe continuar sem interrupção.",
      url: "/conta#assinatura",
    });
    const owner = await orgOwnerContact(org.id);
    if (!owner) continue;
    const daysLeft = Math.max(1, Math.ceil((Date.parse(org.trial_ends_at) - now.getTime()) / 86_400_000));
    const sent = await sendTrialEndingEmail({ to: owner.email, fullName: owner.fullName, orgName: org.name, daysLeft });
    if (sent.ok) ending++;
  }

  // Teste encerrado.
  const { data: endedOrgs, error: e2 } = await admin
    .from("organizations")
    .update({ trial_ended_notified_at: now.toISOString() })
    .eq("status", "trialing")
    .is("trial_ended_notified_at", null)
    .lte("trial_ends_at", now.toISOString())
    .select("id, name");
  if (e2) throw e2;

  for (const org of endedOrgs ?? []) {
    await notifyRoles(org.id, ["owner"], {
      kind: "trial_ended",
      title: "Acesso gratuito encerrado",
      body: "Os dados seguem salvos. Ative a assinatura para voltar a lançar.",
      url: "/conta#assinatura",
    });
    const owner = await orgOwnerContact(org.id);
    if (!owner) continue;
    const sent = await sendTrialEndedEmail({ to: owner.email, fullName: owner.fullName, orgName: org.name });
    if (sent.ok) ended++;
  }

  return { trialEnding: ending, trialEnded: ended };
}
