"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { GOAL_METRICS, type GoalMetric } from "@/lib/goals";
import { describeError, logger } from "@/lib/logger";
import { parseMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation";

const monthSchema = z.string().regex(/^\d{4}-\d{2}-01$/);
const targetSchema = z.preprocess(
  (v) => (v === "" || v == null ? 0 : v),
  z.coerce.number().int("Use números inteiros.").min(0).max(100000),
);

function friendly(error: { code?: string; message: string }) {
  // 42501: o RLS recusou (cargo sem permissão ou assinatura inativa).
  if (error.code === "42501") return "Sem permissão, ou a assinatura está inativa.";
  return "Não foi possível salvar. Tente novamente.";
}

/**
 * Define as metas do mês para um ou vários corretores. Meta zero ou vazia
 * apaga a meta daquela métrica. O banco só aceita se quem chama lidera
 * cada corretor (RLS).
 */
export async function saveGoals(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role === "broker") return { error: "Só a liderança define metas." };

  const month = monthSchema.safeParse(formData.get("month"));
  const memberIds = z.array(z.uuid()).min(1).max(500).safeParse(formData.getAll("memberId"));
  if (!month.success || !memberIds.success) return { error: "Dados inválidos." };

  const targets: Partial<Record<GoalMetric, number>> = {};
  for (const metric of GOAL_METRICS) {
    const parsed = targetSchema.safeParse(formData.get(metric));
    if (!parsed.success) return { fieldErrors: { [metric]: parsed.error.issues[0].message } };
    targets[metric] = parsed.data;
  }

  const supabase = await createClient();
  const upserts = memberIds.data.flatMap((memberId) =>
    GOAL_METRICS.filter((m) => targets[m]! > 0).map((metric) => ({ member_id: memberId, month: month.data, metric, target: targets[metric]! })),
  );
  const cleared = GOAL_METRICS.filter((m) => targets[m] === 0);

  if (upserts.length) {
    const { error } = await supabase.from("goals").upsert(upserts, { onConflict: "member_id,month,metric" });
    if (error) {
      if (error.code !== "42501") logger.error("goals.save", { message: describeError(error), orgId: me.org.id });
      return { error: friendly(error) };
    }
  }
  if (cleared.length) {
    await supabase.from("goals").delete().in("member_id", memberIds.data).eq("month", month.data).in("metric", cleared);
  }

  revalidatePath("/metas");
  return { success: memberIds.data.length > 1 ? `Metas aplicadas a ${memberIds.data.length} corretores.` : "Metas salvas." };
}

export async function addCommission(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  const memberId = me.role === "broker" ? me.id : String(formData.get("memberId") ?? "");
  const receivedOn = String(formData.get("receivedOn") ?? "");
  const amountCents = parseMoney(String(formData.get("amount") ?? ""));
  const description = String(formData.get("description") ?? "").trim().slice(0, 200);

  if (!z.uuid().safeParse(memberId).success) return { fieldErrors: { memberId: "Escolha o corretor." } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) return { fieldErrors: { receivedOn: "Informe a data." } };
  if (!amountCents) return { fieldErrors: { amount: "Informe o valor, como 1.500,00." } };

  const supabase = await createClient();
  const { error } = await supabase
    .from("commissions")
    .insert({ member_id: memberId, received_on: receivedOn, amount_cents: amountCents, description: description || null });
  if (error) {
    if (error.code !== "42501") logger.error("commissions.add", { message: describeError(error), orgId: me.org.id });
    return { error: friendly(error) };
  }

  revalidatePath("/metas");
  return { success: "Comissão lançada." };
}

export async function deleteCommission(id: string) {
  await getCurrentMember();
  if (!z.uuid().safeParse(id).success) return;
  const supabase = await createClient();
  await supabase.from("commissions").delete().eq("id", id);
  revalidatePath("/metas");
}
