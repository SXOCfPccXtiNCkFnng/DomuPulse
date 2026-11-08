"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { GOAL_METRICS, GOAL_PERIODS, goalField, slotGoalField, type GoalMetric, type GoalPeriod } from "@/lib/goals";
import { normalizeSlot } from "@/lib/time";
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
 * Define as metas do mês, por semana, por dia e/ou por horário de relatório
 * para um ou vários corretores. Meta zero ou vazia apaga a meta daquela
 * métrica. O banco só aceita se quem chama lidera cada corretor (RLS).
 * Campos: `leads`, `week_leads`, `day_leads` e `slot_1300_leads` (com `slot`
 * listando os horários). Com `period` no formulário, só aquele tipo é gravado.
 */
export async function saveGoals(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role === "broker") return { error: "Só a liderança define metas." };

  const month = monthSchema.safeParse(formData.get("month"));
  const memberIds = z.array(z.uuid()).min(1).max(500).safeParse(formData.getAll("memberId"));
  if (!month.success || !memberIds.success) return { error: "Dados inválidos." };
  const only = formData.get("period");

  // Cada grupo é um conjunto de 8 metas: do mês, da semana, do dia ou de um horário de relatório.
  type Group = { period: GoalPeriod | "slot"; slot: string | null; field: (m: GoalMetric) => string };
  const groups: Group[] = GOAL_PERIODS.filter((p) => !only || only === p).map((period) => ({
    period,
    slot: null,
    field: (m) => goalField(period, m),
  }));
  if (!only || only === "slot") {
    // Só os horários configurados na empresa.
    const orgSlots = new Set(me.org.reportSlots.map(normalizeSlot));
    const slots = [...new Set(formData.getAll("slot").map((s) => normalizeSlot(String(s))))].filter((s) => orgSlots.has(s));
    for (const slot of slots) groups.push({ period: "slot", slot, field: (m) => slotGoalField(slot, m) });
  }

  const targets = new Map<Group, Record<GoalMetric, number>>();
  for (const group of groups) {
    const t = {} as Record<GoalMetric, number>;
    for (const metric of GOAL_METRICS) {
      const field = group.field(metric);
      const parsed = targetSchema.safeParse(formData.get(field));
      if (!parsed.success) return { fieldErrors: { [field]: parsed.error.issues[0].message } };
      t[metric] = parsed.data;
    }
    targets.set(group, t);
  }

  const supabase = await createClient();
  for (const [group, t] of targets) {
    const upserts = memberIds.data.flatMap((memberId) =>
      GOAL_METRICS.filter((m) => t[m] > 0).map((metric) => ({
        member_id: memberId,
        month: month.data,
        metric,
        period: group.period,
        slot: group.slot,
        target: t[metric],
      })),
    );
    const cleared = GOAL_METRICS.filter((m) => t[m] === 0);

    if (upserts.length) {
      const { error } = await supabase.from("goals").upsert(upserts, { onConflict: "member_id,month,metric,period,slot" });
      if (error) {
        if (error.code !== "42501") logger.error("goals.save", { message: describeError(error), orgId: me.org.id });
        return { error: friendly(error) };
      }
    }
    if (cleared.length) {
      const del = supabase.from("goals").delete().in("member_id", memberIds.data).eq("month", month.data).eq("period", group.period).in("metric", cleared);
      await (group.slot ? del.eq("slot", group.slot) : del);
    }
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
