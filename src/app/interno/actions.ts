"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSignupAlertEmails } from "@/lib/interno";
import { describeError } from "@/lib/logger";
import { clearRecoveryCodes } from "@/lib/mfa-recovery";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailSchema, type FormState } from "@/lib/validation";

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
export async function grantAccess(orgId: string) {
  const { userId } = await requirePlatformAdmin();
  if (!z.uuid().safeParse(orgId).success) return;
  // Liberar limpa a suspensão: a partir daqui o webhook volta a mandar.
  await createAdminClient().from("organizations").update({ status: "active", suspended_at: null }).eq("id", orgId);
  await audit(userId, orgId, "grant_access", {});
  revalidatePath("/interno");
}

// Valor em reais digitado no painel, como "500" ou "499,90".
const priceSchema = z.object({
  price: z
    .string()
    .trim()
    .regex(/^\d{1,7}([.,]\d{1,2})?$/, "Digite o valor em reais, como 500 ou 499,90.")
    .transform((v) => Math.round(Number(v.replace(",", ".")) * 100))
    .refine((c) => c >= 100, "Mínimo de R$ 1,00."),
});

/** Muda o valor mensal das novas assinaturas. Quem já assinou continua no valor dela. */
export async function setMonthlyPrice(_: FormState, formData: FormData): Promise<FormState> {
  const { userId } = await requirePlatformAdmin();
  const parsed = priceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: { price: parsed.error.issues[0].message } };
  const { error } = await createAdminClient()
    .from("platform_settings")
    .upsert({ id: true, monthly_price_cents: parsed.data.price, updated_at: new Date().toISOString() });
  if (error) return { error: describeError(error) };
  await audit(userId, null, "set_monthly_price", { monthly_price_cents: parsed.data.price });
  revalidatePath("/interno");
  return { success: "Valor atualizado. Vale para as próximas assinaturas." };
}

export async function suspendAccess(orgId: string) {
  const { userId } = await requirePlatformAdmin();
  if (!z.uuid().safeParse(orgId).success) return;
  // Suspensão "pegajosa": o webhook não reativa por um pagamento atrasado.
  await createAdminClient().from("organizations").update({ status: "canceled", suspended_at: new Date().toISOString() }).eq("id", orgId);
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

const alertEmailSchema = z.object({
  email: emailSchema,
});

export async function addSignupAlertEmail(_: FormState, formData: FormData): Promise<FormState> {
  const { userId } = await requirePlatformAdmin();
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsed = alertEmailSchema.safeParse({ email: rawEmail });
  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0].message } };
  }
  const emailToAdd = parsed.data.email;
  const current = await getSignupAlertEmails();
  if (current.includes(emailToAdd)) {
    return { fieldErrors: { email: "Este e-mail já está na lista de alertas." } };
  }
  const updated = [...current, emailToAdd];
  const { error } = await createAdminClient()
    .from("platform_settings")
    .upsert({ id: true, signup_alert_emails: updated, updated_at: new Date().toISOString() });
  if (error) return { error: describeError(error) };
  await audit(userId, null, "add_signup_alert_email", { email: emailToAdd });
  revalidatePath("/interno");
  return { success: `E-mail ${emailToAdd} adicionado aos alertas.` };
}

export async function removeSignupAlertEmail(emailToRemove: string): Promise<FormState> {
  const { userId } = await requirePlatformAdmin();
  const emailClean = emailToRemove.trim().toLowerCase();
  const current = await getSignupAlertEmails();
  const updated = current.filter((e) => e !== emailClean);
  if (updated.length === 0) {
    return { error: "A lista de alertas precisa ter pelo menos um e-mail." };
  }
  const { error } = await createAdminClient()
    .from("platform_settings")
    .upsert({ id: true, signup_alert_emails: updated, updated_at: new Date().toISOString() });
  if (error) return { error: describeError(error) };
  await audit(userId, null, "remove_signup_alert_email", { email: emailClean });
  revalidatePath("/interno");
  return { success: `E-mail ${emailClean} removido dos alertas.` };
}

// --- Verificação em duas etapas (2FA) das pessoas -------------------------
// Para quando alguém perde o acesso ao app de códigos (trocou de celular) e
// pede ajuda. O administrador remove a 2FA; a pessoa entra só com a senha e
// configura de novo. Fica registrado no audit_log.

export type MfaFactor = { id: string; type: string; friendlyName: string | null; status: string };
export type MfaLookup =
  | { error: string }
  | { found: false }
  | {
      found: true;
      userId: string;
      email: string;
      memberships: { orgName: string; role: string; active: boolean }[];
      factors: MfaFactor[];
    };

/** Acha a conta pelo e-mail e diz se ela tem 2FA ativa. */
export async function lookupMfa(emailInput: string): Promise<MfaLookup> {
  await requirePlatformAdmin();
  const email = String(emailInput ?? "").trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) return { error: "Digite um e-mail válido." };
  const admin = createAdminClient();

  // O Auth não busca por e-mail direto: percorre as páginas até achar.
  let user: { id: string; email?: string | null } | null = null;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { error: "Não foi possível consultar as contas. Tente de novo." };
    user = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
    if (user || data.users.length < 200) break;
  }
  if (!user) return { found: false };

  const { data: full } = await admin.auth.admin.getUserById(user.id);
  const factors: MfaFactor[] = (full.user?.factors ?? []).map((f) => ({
    id: f.id,
    type: f.factor_type,
    friendlyName: f.friendly_name ?? null,
    status: f.status,
  }));

  const { data: members } = await admin.from("members").select("role, active, organizations (name)").eq("user_id", user.id);
  const memberships = ((members ?? []) as unknown as { role: string; active: boolean; organizations: { name: string } | null }[]).map((m) => ({
    orgName: m.organizations?.name ?? "Sem empresa",
    role: m.role,
    active: m.active,
  }));

  return { found: true, userId: user.id, email: user.email ?? email, memberships, factors };
}

/** Remove todos os fatores de 2FA de uma conta. */
export async function resetMfa(userId: string): Promise<{ error: string } | { ok: true; removed: number }> {
  const { userId: actor } = await requirePlatformAdmin();
  if (!z.uuid().safeParse(userId).success) return { error: "Conta inválida." };
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return { error: "Conta não encontrada." };
  const factors = data.user.factors ?? [];

  let removed = 0;
  for (const f of factors) {
    const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (delErr) return { error: "Não foi possível remover a verificação. Tente de novo." };
    removed += 1;
  }

  // Os códigos de recuperação não valem mais sem o 2FA.
  await clearRecoveryCodes(userId);
  await audit(actor, null, "reset_mfa", { targetUserId: userId, email: data.user.email ?? null, removed });
  revalidatePath("/interno");
  return { ok: true, removed };
}

