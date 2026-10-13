import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { AsaasWebhook } from "@/lib/asaas";
import { asaasEnv } from "@/lib/env.server";
import { seatsForPayment } from "@/lib/plans";
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
  const { error: dupError } = await admin
    .from("billing_events")
    .insert({ id: body.id, event: body.event, payload: body });
  if (dupError?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (dupError) return NextResponse.json({ error: "storage" }, { status: 500 });

  const status = STATUS_BY_EVENT[body.event];
  if (!status) return NextResponse.json({ ok: true, ignored: true });

  const subscriptionId = body.payment?.subscription ?? body.subscription?.id ?? null;
  if (!subscriptionId) return NextResponse.json({ ok: true, ignored: true });

  const update: Record<string, unknown> = { status };
  if (status === "active" && body.payment) {
    update.seats = seatsForPayment(Math.round(body.payment.value * 100));
  }

  const { error } = await admin.from("organizations").update(update).eq("asaas_subscription_id", subscriptionId);
  if (error) {
    // Libera o evento para o Asaas tentar de novo.
    await admin.from("billing_events").delete().eq("id", body.id);
    return NextResponse.json({ error: "update" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
