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
import { todayIn } from "@/lib/time";
import type { FormState } from "@/lib/validation";

const schema = z.object({
  seats: z.coerce.number().int().min(MIN_SEATS).max(MAX_SEATS),
  cpfCnpj: z.string().refine(isCpfOrCnpj, "CPF ou CNPJ inválido."),
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
    .select("id, name, asaas_customer_id, asaas_subscription_id")
    .eq("id", me.org.id)
    .single();
  if (!org) return { error: "Organização não encontrada." };

  const valueCents = monthlyPriceCents(parsed.data.seats);

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
        description: `Domu Pulse, ${parsed.data.seats} assentos`,
      });
      subscriptionId = subscription.id;
      await admin.from("organizations").update({ asaas_subscription_id: subscriptionId }).eq("id", org.id);
    }

    const payment = await firstPendingPayment(subscriptionId);
    if (payment?.invoiceUrl?.startsWith("https://")) return { url: payment.invoiceUrl };
    return { success: "Assinatura atualizada. O novo valor vale a partir da próxima fatura." };
  } catch (error) {
    if (error instanceof AsaasError) console.error("asaas", error.status, JSON.stringify(error.details));
    else console.error("asaas", error);
    return { error: "Não foi possível falar com o meio de pagamento agora. Tente em alguns minutos." };
  }
}
