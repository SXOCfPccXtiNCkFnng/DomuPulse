"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { describeError } from "@/lib/logger";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { MAX_SEATS } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "@/lib/validation";

// Toda ação confere a lista de administradores de novo: o botão na tela
// não é proteção, a ação é.

async function audit(actor: string, orgId: string | null, action: string, data: Record<string, unknown>) {
  await createAdminClient().from("audit_log").insert({
    org_id: orgId,
    actor,
    table_name: "platform",
    record_id: orgId,
    action,
    new_data: data,
  });
}

export async function setAlertResolved(id: string, resolved: boolean) {
  const { email } = await requirePlatformAdmin();
  if (!z.uuid().safeParse(id).success) return;
  await createAdminClient()
    .from("ops_alerts")
    .update(resolved ? { resolved_at: new Date().toISOString(), resolved_by: email } : { resolved_at: null, resolved_by: null })
    .eq("id", id);
  revalidatePath("/interno");
}

export async function resolveAlertsBySource(source: string) {
  const { email } = await requirePlatformAdmin();
  await createAdminClient()
    .from("ops_alerts")
    .update({ resolved_at: new Date().toISOString(), resolved_by: email })
    .eq("source", source.slice(0, 80))
    .is("resolved_at", null);
  revalidatePath("/interno");
}

export async function extendTrial(orgId: string, days: number) {
  const { userId } = await requirePlatformAdmin();
  if (!z.uuid().safeParse(orgId).success || ![7, 14, 30].includes(days)) return;
  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("trial_ends_at, status").eq("id", orgId).single();
  if (!org || org.status !== "trialing") return;
  // Soma a partir de hoje se o teste já venceu, senão a partir do fim atual.
  const base = Math.max(Date.now(), Date.parse(org.trial_ends_at));
  const trialEndsAt = new Date(base + days * 86_400_000).toISOString();
  await admin
    .from("organizations")
    .update({ trial_ends_at: trialEndsAt, trial_reminder_sent_at: null, trial_ended_notified_at: null })
    .eq("id", orgId);
  await audit(userId, orgId, "extend_trial", { days, trial_ends_at: trialEndsAt });
  revalidatePath("/interno");
}

// Cortesia ou acerto manual: ativa sem passar pelo Asaas.
export async function grantAccess(orgId: string, formData: FormData) {
  const { userId } = await requirePlatformAdmin();
  const seats = Number(formData.get("seats"));
  if (!z.uuid().safeParse(orgId).success || !Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) return;
  await createAdminClient().from("organizations").update({ status: "active", seats }).eq("id", orgId);
  await audit(userId, orgId, "grant_access", { seats });
  revalidatePath("/interno");
}

export async function suspendAccess(orgId: string) {
  const { userId } = await requirePlatformAdmin();
  if (!z.uuid().safeParse(orgId).success) return;
  await createAdminClient().from("organizations").update({ status: "canceled" }).eq("id", orgId);
  await audit(userId, orgId, "suspend_access", {});
  revalidatePath("/interno");
}

const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,30}$/, "Use de 3 a 30 letras e números, sem espaços."),
  kind: z.enum(["percent", "days"]),
  amount: z.coerce.number().int("Use um número inteiro.").min(1, "Mínimo 1."),
  maxRedemptions: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).optional()),
  expiresAt: z.preprocess((v) => (v === "" ? undefined : v), z.iso.date().optional()),
  description: z.string().trim().max(200).optional(),
});

export async function createCoupon(_: FormState, formData: FormData): Promise<FormState> {
  const { userId } = await requirePlatformAdmin();
  const parsed = couponSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const { code, kind, amount, maxRedemptions, expiresAt, description } = parsed.data;
  if (kind === "percent" && amount > 100) return { fieldErrors: { amount: "Desconto de no máximo 100%." } };
  if (kind === "days" && amount > 365) return { fieldErrors: { amount: "No máximo 365 dias." } };
  const { error } = await createAdminClient()
    .from("coupons")
    .insert({
      code,
      percent_off: kind === "percent" ? amount : null,
      free_days: kind === "days" ? amount : null,
      max_redemptions: maxRedemptions ?? null,
      // Vale até o fim do dia escolhido, no horário de Brasília.
      expires_at: expiresAt ? `${expiresAt}T23:59:59-03:00` : null,
      description: description || null,
    });
  if (error) {
    return error.code === "23505" ? { fieldErrors: { code: "Já existe um cupom com esse código." } } : { error: describeError(error) };
  }
  await audit(userId, null, "create_coupon", { code, kind, amount });
  revalidatePath("/interno");
  return { success: `Cupom ${code} criado.` };
}

export async function setCouponActive(code: string, active: boolean) {
  const { userId } = await requirePlatformAdmin();
  await createAdminClient().from("coupons").update({ active }).eq("code", code.slice(0, 30));
  await audit(userId, null, active ? "enable_coupon" : "disable_coupon", { code });
  revalidatePath("/interno");
}
