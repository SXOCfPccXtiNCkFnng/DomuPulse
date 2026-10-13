import "server-only";
import { createHash } from "node:crypto";
import { sendOpsAlertEmail } from "@/lib/email-templates";
import { platformAdminEmails } from "@/lib/platform-admins";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE_KEY = /token|secret|password|senha|authorization|api[_-]?key|cookie|cpf|cnpj/i;

/**
 * Identidade do erro para agrupar: origem e mensagem sem o que muda a cada
 * vez (ids, números). "Falhou para a org X" e "para a org Y" viram uma linha.
 */
export function fingerprintOf(source: string, message: string): string {
  const normalized = message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
    .replace(/\d+/g, "<n>")
    .slice(0, 300);
  return createHash("sha1").update(`${source}|${normalized}`).digest("hex");
}

/** Tira segredos e dados pessoais e corta textos longos antes de gravar. */
export function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta ?? {}).slice(0, 25)) {
    if (key === "message") continue;
    if (SENSITIVE_KEY.test(key)) out[key] = "[oculto]";
    else if (typeof value === "string") out[key] = value.slice(0, 800);
    else if (value == null || typeof value === "number" || typeof value === "boolean") out[key] = value;
    else {
      try {
        out[key] = JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "string" ? v.slice(0, 300) : v)));
      } catch {
        out[key] = String(value).slice(0, 300);
      }
    }
  }
  return out;
}

/**
 * Grava no painel interno, agrupando repetições. Erro novo (ou que voltou
 * depois de resolvido) avisa a equipe por e-mail; repetição só soma.
 * Nunca lança: registrar um erro não pode virar outro erro.
 */
export async function recordOpsEvent(input: {
  source: string;
  message: string;
  level: "error" | "warn";
  orgId?: string | null;
  meta?: Record<string, unknown>;
  count?: number;
}) {
  try {
    const source = input.source.slice(0, 80);
    const message = input.message.slice(0, 2000);
    const orgId = input.orgId && UUID.test(input.orgId) ? input.orgId : null;

    const { data: isNew, error } = await createAdminClient().rpc("record_ops_event", {
      p_fingerprint: fingerprintOf(source, message),
      p_source: source,
      p_level: input.level,
      p_message: message,
      p_org_id: orgId,
      p_meta: sanitizeMeta(input.meta),
      p_count: input.count ?? 1,
    });
    if (error) throw error;

    if (isNew && input.level === "error") {
      await Promise.all(platformAdminEmails().map((to) => sendOpsAlertEmail({ to, source, message, orgId })));
    }
  } catch (error) {
    // console direto: o logger grava aqui, e isso viraria um laço.
    console.error("[ops] falha ao registrar", error instanceof Error ? error.message : error);
  }
}
