import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** O que o painel interno acompanha e de quanto em quanto tempo deveria rodar. */
export const HEARTBEATS = [
  {
    name: "cron.reminders",
    label: "Lembretes de relatório",
    everyMin: 5,
    fix: "No cron-job.org, confira a tarefa de /api/cron/reminders (a cada 5 minutos, com o cabeçalho Authorization).",
  },
  {
    name: "cron.billing",
    label: "Avisos de cobrança",
    everyMin: 24 * 60,
    fix: "No cron-job.org, confira a tarefa de /api/cron/billing (1 vez por dia).",
  },
  {
    name: "cron.cleanup",
    label: "Limpeza de registros",
    everyMin: 24 * 60,
    fix: "No cron-job.org, confira a tarefa de /api/cron/cleanup (1 vez por dia).",
  },
  {
    name: "cron.weekly",
    label: "Resumo semanal",
    everyMin: 7 * 24 * 60,
    fix: "No cron-job.org, confira a tarefa de /api/cron/weekly (toda segunda, de manhã).",
  },
  {
    name: "webhook.asaas",
    label: "Webhook do Asaas",
    everyMin: 0, // depende de haver pagamentos: só informativo
    fix: "Se pagamentos não confirmam, confira no Asaas a URL do webhook e o token.",
  },
] as const;

/**
 * Registra que um cron ou webhook rodou, e se deu certo. Nunca lança: o
 * batimento é só observação e não pode derrubar o processamento.
 */
export async function recordHeartbeat(
  name: string,
  outcome: { ok: boolean; result?: Record<string, unknown>; error?: string },
) {
  try {
    await createAdminClient().rpc("record_heartbeat", {
      p_name: name,
      p_ok: outcome.ok,
      p_result: outcome.result ?? {},
      p_error: outcome.error ?? null,
    });
  } catch (error) {
    console.error("[heartbeat] falha ao registrar", name, error instanceof Error ? error.message : error);
  }
}
