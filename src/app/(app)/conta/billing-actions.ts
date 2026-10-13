"use server";

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
import { MAX_SEATS, MIN_SEATS, monthlyPriceCents } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeError, logger } from "@/lib/logger";
import { todayIn } from "@/lib/time";
import type { FormState } from "@/lib/validation";

const schema = z.object({
  seats: z.coerce.number().int().min(MIN_SEATS).max(MAX_SEATS),
  cpfCnpj: z.string().refine(isCpfOrCnpj, "CPF ou CNPJ inválido."),
  coupon: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z0-9]{3,30}$/.test(v), "Cupom inválido.")
    .optional(),
});

export type BillingState = FormState & { url?: string };

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

  // Cupom: o já aplicado continua valendo; um novo só entra se ainda for válido.
  const couponCode = (org.coupon_code as string | null) ?? (parsed.data.coupon || null);
  let percentOff = 0;
  if (couponCode) {
    const { data: coupon } = await admin
      .from("coupons")
      .select("percent_off, active, expires_at, max_redemptions, redemption_count")
      .eq("code", couponCode)
      .maybeSingle();
    const usable =
      coupon &&
      (org.coupon_code ||
        (coupon.active &&
          (!coupon.expires_at || new Date(coupon.expires_at) > new Date()) &&
          (coupon.max_redemptions == null || coupon.redemption_count < coupon.max_redemptions)));
    if (!usable) return { fieldErrors: { coupon: "Cupom inválido, vencido ou esgotado." } };
    percentOff = Number(coupon.percent_off);
  }

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
        description: `Domu Pulse, ${parsed.data.seats} assentos${percentOff ? `, cupom ${couponCode}` : ""}`,
      });
      subscriptionId = subscription.id;
      await admin.from("organizations").update({ asaas_subscription_id: subscriptionId }).eq("id", org.id);
    }

    // Assentos pedidos viram ativos quando o pagamento confirmar (webhook).
    await admin.from("organizations").update({ subscribed_seats: parsed.data.seats }).eq("id", org.id);

    if (couponCode && !org.coupon_code) {
      await admin.rpc("redeem_coupon", { p_code: couponCode });
      await admin.from("organizations").update({ coupon_code: couponCode }).eq("id", org.id);
    }

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
