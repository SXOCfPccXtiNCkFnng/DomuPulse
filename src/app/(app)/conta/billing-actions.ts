"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AsaasError,
  createCustomer,
  createSubscription,
  firstPendingPayment,
  updateSubscriptionValue,
} from "@/lib/asaas";
import { getCurrentMember } from "@/lib/auth";
import { isCpfOrCnpj, onlyDigits } from "@/lib/document";
import { describeError, logger } from "@/lib/logger";
import { MAX_SEATS, MIN_SEATS, monthlyPriceCents } from "@/lib/plans";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/time";
import type { FormState } from "@/lib/validation";

const schema = z.object({
  seats: z.coerce.number().int().min(MIN_SEATS).max(MAX_SEATS),
  cpfCnpj: z.string().refine(isCpfOrCnpj, "CPF ou CNPJ inválido."),
});

export type BillingState = FormState & { url?: string };

/** Desconto do cupom já aplicado na organização, em %. */
async function appliedPercent(code: string | null) {
  if (!code) return 0;
  const { data } = await createAdminClient().from("coupons").select("percent_off").eq("code", code).maybeSingle();
  return Number(data?.percent_off ?? 0);
}

export async function startSubscription(_: BillingState, formData: FormData): Promise<BillingState> {
  const me = await getCurrentMember();
  if (me.role !== "owner") return { error: "Só o administrador gerencia a assinatura." };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, asaas_customer_id, asaas_subscription_id, coupon_code")
    .eq("id", me.org.id)
    .single();
  if (!org) return { error: "Organização não encontrada." };

  const percentOff = await appliedPercent(org.coupon_code as string | null);
  const valueCents = monthlyPriceCents(parsed.data.seats, percentOff);

  try {
    const { data: auth } = await admin.auth.admin.getUserById(me.userId);
    let customerId = org.asaas_customer_id as string | null;
    if (!customerId) {
      const customer = await createCustomer({
        name: org.name,
        email: auth.user?.email ?? "",
        cpfCnpj: onlyDigits(parsed.data.cpfCnpj),
        orgId: org.id,
      });
      customerId = customer.id;
      await admin.from("organizations").update({ asaas_customer_id: customerId }).eq("id", org.id);
    }

    let subscriptionId = org.asaas_subscription_id as string | null;
    if (subscriptionId) {
      await updateSubscriptionValue(subscriptionId, valueCents);
    } else {
      const subscription = await createSubscription({
        customerId,
        valueCents,
        orgId: org.id,
        nextDueDate: todayIn(me.org.timezone),
        description: `Domu Pulse, ${parsed.data.seats} assentos${percentOff ? `, cupom ${org.coupon_code}` : ""}`,
      });
      subscriptionId = subscription.id;
      await admin.from("organizations").update({ asaas_subscription_id: subscriptionId }).eq("id", org.id);
    }

    // Assentos pedidos viram ativos quando o pagamento confirmar (webhook).
    await admin.from("organizations").update({ subscribed_seats: parsed.data.seats }).eq("id", org.id);

    const payment = await firstPendingPayment(subscriptionId);
    if (payment?.invoiceUrl?.startsWith("https://")) return { url: payment.invoiceUrl };
    return { success: "Assinatura atualizada. O novo valor vale a partir da próxima fatura." };
  } catch (error) {
    logger.error("billing.asaas", {
      message: error instanceof AsaasError ? `Asaas ${error.status}: ${JSON.stringify(error.details).slice(0, 500)}` : describeError(error),
      orgId: me.org.id,
    });
    return { error: "Não foi possível falar com o meio de pagamento agora. Tente em alguns minutos." };
  }
}

/**
 * Aplica um cupom à imobiliária. "Dias grátis" libera o acesso na hora, sem
 * pagamento; "desconto" fica guardado e vale em todas as faturas da assinatura.
 * O banco garante que cada imobiliária usa cada cupom uma vez só.
 */
export async function redeemCoupon(_: BillingState, formData: FormData): Promise<BillingState> {
  const me = await getCurrentMember();
  if (me.role !== "owner") return { error: "Só o administrador aplica cupons." };

  const code = String(formData.get("coupon") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,30}$/.test(code)) return { fieldErrors: { coupon: "Digite o código do cupom." } };

  const limit = await rateLimit(`coupon:${me.org.id}`, 10, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("coupon_code, status, trial_ends_at").eq("id", me.org.id).single();

  // Desconto só cabe um por assinatura: confere antes de gastar o cupom.
  const { data: coupon } = await admin.from("coupons").select("percent_off").eq("code", code).maybeSingle();
  if (coupon?.percent_off != null && org?.coupon_code) {
    return { fieldErrors: { coupon: "Sua assinatura já tem um cupom de desconto." } };
  }

  const { data } = await admin
    .rpc("redeem_coupon", { p_code: code, p_org: me.org.id })
    .maybeSingle<{ percent_off: number | null; free_days: number | null }>();
  if (!data) return { fieldErrors: { coupon: "Cupom inválido, vencido, esgotado ou já usado por esta imobiliária." } };

  if (data.free_days) {
    // Soma a partir de hoje ou do fim do acesso atual, o que for depois.
    const base = Math.max(Date.now(), Date.parse(org?.trial_ends_at ?? new Date().toISOString()));
    const until = new Date(base + data.free_days * 86_400_000);
    const update =
      org?.status === "trialing"
        ? { trial_ends_at: until.toISOString(), trial_reminder_sent_at: null, trial_ended_notified_at: null }
        : null;
    if (update) await admin.from("organizations").update(update).eq("id", me.org.id);
    await admin.from("audit_log").insert({
      org_id: me.org.id,
      actor: me.userId,
      table_name: "platform",
      record_id: me.org.id,
      action: "redeem_free_days",
      new_data: { code, free_days: data.free_days },
    });
    revalidatePath("/", "layout");
    return update
      ? { success: `Cupom aplicado: ${data.free_days} dias de acesso liberados.`, url: "/painel" }
      : { success: "Cupom registrado. Como sua assinatura já está ativa, os dias grátis não se aplicam." };
  }

  await admin.from("organizations").update({ coupon_code: code }).eq("id", me.org.id);
  revalidatePath("/", "layout");
  return { success: `Cupom aplicado: ${Number(data.percent_off)}% de desconto em todas as faturas.` };
}
