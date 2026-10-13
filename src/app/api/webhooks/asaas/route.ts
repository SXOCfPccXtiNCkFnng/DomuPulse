import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import type { AsaasWebhook } from "@/lib/asaas";
import { sendPaymentConfirmedEmail, sendPaymentOverdueEmail } from "@/lib/email-templates";
import { asaasEnv } from "@/lib/env.server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { describeError, logger } from "@/lib/logger";
import { notifyRoles } from "@/lib/notify";
import { orgOwnerContact } from "@/lib/org-owner";
import { createAdminClient } from "@/lib/supabase/admin";

function configuredToken() {
  try {
    return asaasEnv().webhookToken;
  } catch {
    return null;
  }
}

function sameToken(received: string | null, expected: string | null) {
  // Sem token configurado, ninguém passa.
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const STATUS_BY_EVENT: Record<string, "active" | "past_due" | "canceled"> = {
  PAYMENT_CONFIRMED: "active",
  PAYMENT_RECEIVED: "active",
  PAYMENT_OVERDUE: "past_due",
  SUBSCRIPTION_DELETED: "canceled",
  SUBSCRIPTION_INACTIVATED: "canceled",
};

export async function POST(request: NextRequest) {
  // O Asaas envia o token cadastrado no painel neste cabeçalho.
  if (!sameToken(request.headers.get("asaas-access-token"), configuredToken())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as AsaasWebhook | null;
  if (!body?.id || !body.event) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const admin = createAdminClient();

  // Idempotência: o Asaas reenvia eventos; cada id é processado uma vez só.
  const { error: dupError } = await admin.from("billing_events").insert({ id: body.id, event: body.event, payload: body });
  if (dupError?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (dupError) {
    logger.error("webhook.asaas", { message: describeError(dupError) });
    return NextResponse.json({ error: "storage" }, { status: 500 });
  }

  const status = STATUS_BY_EVENT[body.event];
  const subscriptionId = body.payment?.subscription ?? body.subscription?.id ?? null;
  if (!status || !subscriptionId) {
    await recordHeartbeat("webhook.asaas", { ok: true, result: { event: body.event, ignored: true } });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data: org } = await admin
    .from("organizations")
    .select("id, name, seats, subscribed_seats")
    .eq("asaas_subscription_id", subscriptionId)
    .maybeSingle();
  if (!org) {
    logger.warn("webhook.asaas", { message: `Assinatura ${subscriptionId} sem organização no Pulse`, event: body.event });
    await recordHeartbeat("webhook.asaas", { ok: true, result: { event: body.event, orphan: true } });
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Assentos só aumentam com pagamento confirmado: o pedido fica em
  // subscribed_seats até o dinheiro entrar.
  const seats = status === "active" ? (org.subscribed_seats ?? org.seats) : org.seats;
  const { error } = await admin.from("organizations").update({ status, seats }).eq("id", org.id);
  if (error) {
    logger.error("webhook.asaas", { message: describeError(error), orgId: org.id });
    await recordHeartbeat("webhook.asaas", { ok: false, error: describeError(error) });
    // Libera o evento para o Asaas tentar de novo.
    await admin.from("billing_events").delete().eq("id", body.id);
    return NextResponse.json({ error: "update" }, { status: 500 });
  }

  await recordHeartbeat("webhook.asaas", { ok: true, result: { event: body.event } });

  // Cartão gera CONFIRMED na hora e RECEIVED dias depois: avisa uma vez só.
  const payment = body.payment;
  const confirmedNow =
    body.event === "PAYMENT_CONFIRMED" || (body.event === "PAYMENT_RECEIVED" && payment?.billingType !== "CREDIT_CARD");

  if (confirmedNow || body.event === "PAYMENT_OVERDUE") {
    after(async () => {
      await notifyRoles(
        org.id,
        ["owner"],
        body.event === "PAYMENT_OVERDUE"
          ? { kind: "payment_overdue", title: "Fatura em aberto", body: "A fatura venceu e o pagamento ainda não foi identificado.", url: "/conta#assinatura" }
          : { kind: "payment_confirmed", title: "Pagamento confirmado", body: `Assinatura ativa com ${seats} assentos.`, url: "/conta#assinatura" },
      );
      const owner = await orgOwnerContact(org.id);
      if (!owner) return;
      if (body.event === "PAYMENT_OVERDUE") {
        await sendPaymentOverdueEmail({ to: owner.email, fullName: owner.fullName, orgName: org.name });
      } else {
        await sendPaymentConfirmedEmail({
          to: owner.email,
          fullName: owner.fullName,
          orgName: org.name,
          seats,
          valueCents: Math.round((payment?.value ?? 0) * 100),
        });
      }
    });
  }

  return NextResponse.json({ ok: true });
}
