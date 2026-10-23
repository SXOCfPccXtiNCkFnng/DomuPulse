import "server-only";
import { siteUrl } from "@/lib/email";
import { evolutionEnv } from "@/lib/env.server";
import { describeError, logger } from "@/lib/logger";

// Cliente do Evolution API (WhatsApp do RH). Uma instância por empresa.

// Eventos que o Pulse quer receber: mensagem nova (currículo e conversa),
// mudança de conexão (conectou/caiu) e QR novo durante o pareamento.
const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"] as const;

/** Nome único e estável da instância de uma empresa. */
export function instanceName(orgId: string) {
  return `pulse_${orgId.replace(/-/g, "")}`;
}

function webhookUrl() {
  // O token confere que o aviso veio do nosso Evolution. O Evolution precisa
  // alcançar este endereço pela internet: em dev, localhost não serve.
  const { webhookToken, webhookBaseUrl } = evolutionEnv();
  const path = `/api/webhooks/whatsapp?token=${webhookToken}`;
  return webhookBaseUrl ? `${webhookBaseUrl}${path}` : siteUrl(path);
}

async function evo(path: string, init: { method: string; body?: unknown }) {
  const { url, apiKey } = evolutionEnv();
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method: init.method,
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    // Servidor fora do ar ou ainda acordando (Render free).
    throw new EvolutionError(0, "servidor não respondeu (pode estar acordando — tente de novo em ~30s)");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Resposta em texto puro (ex.: "Not Found"). Não é JSON.
  }
  if (!res.ok) {
    const msg = (data as { message?: string } | null)?.message ?? (text ? text.slice(0, 200) : `HTTP ${res.status}`);
    throw new EvolutionError(res.status, msg);
  }
  return data;
}

export class EvolutionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "EvolutionError";
  }
}

/** As chaves do Evolution estão no ambiente? */
export function evolutionConfigured() {
  try {
    evolutionEnv();
    return true;
  } catch {
    return false;
  }
}

type CreateResult = { instance: string; qrcodeBase64: string | null; pairingCode: string | null };

/**
 * Cria a instância da empresa já pré-configurada: integração Baileys, webhook
 * apontando para o Pulse com os eventos certos, e settings de bot (ignora
 * grupos, fica sempre online, rejeita ligação, marca como lido). Devolve o QR
 * para parear o número.
 */
export async function createInstance(orgId: string): Promise<CreateResult> {
  const name = instanceName(orgId);
  const data = (await evo("/instance/create", {
    method: "POST",
    body: {
      instanceName: name,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      // Settings de bot de recrutamento.
      rejectCall: true,
      msgCall: "Não atendo ligações por aqui. Me mande uma mensagem que eu te respondo. 🙂",
      groupsIgnore: true,
      alwaysOnline: true,
      readMessages: true,
      readStatus: false,
      syncFullHistory: false,
      // Webhook inline (formato v2).
      webhook: { url: webhookUrl(), byEvents: false, base64: true, events: [...WEBHOOK_EVENTS] },
    },
  })) as { qrcode?: { base64?: string; pairingCode?: string } } | null;

  // Reforço: garante o webhook também pelo endpoint dedicado (algumas versões
  // ignoram o webhook inline do create).
  await setWebhook(orgId).catch((error) => logger.warn("evolution.webhook_set", { message: describeError(error) }));

  return {
    instance: name,
    qrcodeBase64: data?.qrcode?.base64 ?? null,
    pairingCode: data?.qrcode?.pairingCode ?? null,
  };
}

/** (Re)aponta o webhook da instância para o Pulse. */
export async function setWebhook(orgId: string) {
  await evo(`/webhook/set/${instanceName(orgId)}`, {
    method: "POST",
    body: { webhook: { enabled: true, url: webhookUrl(), byEvents: false, base64: true, events: [...WEBHOOK_EVENTS] } },
  });
}

/** Reabre o pareamento e devolve um QR novo (quando a instância já existe mas caiu). */
export async function connectInstance(orgId: string): Promise<{ qrcodeBase64: string | null; pairingCode: string | null }> {
  const data = (await evo(`/instance/connect/${instanceName(orgId)}`, { method: "GET" })) as
    | { base64?: string; pairingCode?: string; qrcode?: { base64?: string; pairingCode?: string } }
    | null;
  return {
    qrcodeBase64: data?.base64 ?? data?.qrcode?.base64 ?? null,
    pairingCode: data?.pairingCode ?? data?.qrcode?.pairingCode ?? null,
  };
}

/** Situação da conexão: 'open' (conectado), 'connecting', 'close'. */
export async function connectionState(orgId: string): Promise<{ state: string; number: string | null }> {
  const data = (await evo(`/instance/connectionState/${instanceName(orgId)}`, { method: "GET" })) as
    | { instance?: { state?: string; number?: string } }
    | null;
  return { state: data?.instance?.state ?? "close", number: data?.instance?.number ?? null };
}

/** Desconecta o número (mantém a instância para reconectar). */
export async function logoutInstance(orgId: string) {
  await evo(`/instance/logout/${instanceName(orgId)}`, { method: "DELETE" });
}

/** Apaga a instância por completo. */
export async function deleteInstance(orgId: string) {
  await evo(`/instance/delete/${instanceName(orgId)}`, { method: "DELETE" });
}

/** Envia uma mensagem de texto para um número (só dígitos com DDI, ex.: 5511999999999). */
export async function sendText(orgId: string, number: string, text: string): Promise<{ id: string | null }> {
  const data = (await evo(`/message/sendText/${instanceName(orgId)}`, { method: "POST", body: { number, text } })) as
    | { key?: { id?: string } }
    | null;
  return { id: data?.key?.id ?? null };
}

/** Baixa a mídia (currículo) de uma mensagem e devolve em base64. */
export async function getMediaBase64(
  orgId: string,
  message: unknown,
): Promise<{ base64: string; mimeType: string; fileName: string | null } | null> {
  const data = (await evo(`/chat/getBase64FromMediaMessage/${instanceName(orgId)}`, { method: "POST", body: { message } })) as
    | { base64?: string; mimetype?: string; fileName?: string }
    | null;
  if (!data?.base64) return null;
  return { base64: data.base64, mimeType: data.mimetype ?? "application/pdf", fileName: data.fileName ?? null };
}
