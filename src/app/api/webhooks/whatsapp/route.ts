import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { evolutionEnv } from "@/lib/env.server";
import { describeError, logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleIncoming } from "@/lib/wa-bot";

function sameToken(received: string | null) {
  let expected: string;
  try {
    expected = evolutionEnv().webhookToken;
  } catch {
    return false;
  }
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const STATE_TO_STATUS: Record<string, "connected" | "connecting" | "disconnected"> = {
  open: "connected",
  connecting: "connecting",
  close: "disconnected",
};

/**
 * Recebe os eventos do Evolution (WhatsApp do RH). O token no endereço confere
 * que o aviso é do nosso servidor. Responde rápido: o processamento pesado
 * (ler currículo, pontuar) não pode travar o webhook.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!sameToken(token)) {
    logger.warn("wa.webhook_unauthorized", { hasToken: Boolean(token), tokenLength: token?.length ?? 0 });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { event?: string; instance?: string; data?: unknown } | null;
  if (!body?.event || !body.instance) return NextResponse.json({ ok: true, ignored: true });

  const admin = createAdminClient();
  const { data: conn } = await admin.from("wa_connections").select("org_id").eq("instance", body.instance).maybeSingle();
  if (!conn) {
    logger.info("wa.webhook", { message: `Instância ${body.instance} sem empresa no Pulse`, event: body.event });
    return NextResponse.json({ ok: true, ignored: true });
  }
  const orgId = conn.org_id as string;

  try {
    if (body.event === "CONNECTION_UPDATE") {
      const data = body.data as { state?: string; wuid?: string };
      const status = STATE_TO_STATUS[data?.state ?? ""] ?? "disconnected";
      const phone = data?.wuid ? data.wuid.split("@")[0].split(":")[0] : undefined;
      await admin
        .from("wa_connections")
        .update({ status, ...(phone ? { phone } : {}), updated_at: new Date().toISOString() })
        .eq("org_id", orgId);
    } else if (body.event === "MESSAGES_UPSERT") {
      // O Evolution pode mandar uma mensagem ou uma lista. Processa em segundo
      // plano para responder o webhook rápido.
      const raw = body.data as { messages?: unknown[] } | unknown;
      const messages = Array.isArray((raw as { messages?: unknown[] })?.messages)
        ? (raw as { messages: unknown[] }).messages
        : [raw];
      logger.info("wa.webhook", { event: body.event, orgId, count: messages.length });
      for (const msg of messages) {
        after(() => handleIncoming(orgId, msg as Parameters<typeof handleIncoming>[1]).catch((e) => logger.error("wa.bot", { message: describeError(e), orgId })));
      }
    }
  } catch (error) {
    logger.error("wa.webhook", { message: describeError(error), orgId });
  }

  return NextResponse.json({ ok: true });
}
