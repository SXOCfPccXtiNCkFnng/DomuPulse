import "server-only";
import { publicEnv } from "@/lib/env";
import { emailEnv } from "@/lib/env.server";
import { CONTACT_EMAIL, contactWhatsappUrl } from "@/lib/legal";
import { logger } from "@/lib/logger";

export type EmailMessage = { to: string; subject: string; html: string; text: string };
export type SendResult = { ok: boolean; mode: "resend" | "dev"; error?: string };

/**
 * Envia pelo Resend. Sem chave: em desenvolvimento mostra o e-mail no
 * terminal (com os links, para testar convites e senha localmente); em
 * produção registra o erro no painel interno.
 *
 * `silent` evita o registro no painel: usado pelo próprio alerta de erro,
 * para uma falha de e-mail não gerar outro alerta.
 */
export async function sendEmail(message: EmailMessage, options: { silent?: boolean } = {}): Promise<SendResult> {
  let config: ReturnType<typeof emailEnv>;
  try {
    config = emailEnv();
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.info(`\n[e-mail de teste] para ${message.to}\nassunto: ${message.subject}\n\n${message.text}\n`);
      return { ok: true, mode: "dev" };
    }
    if (!options.silent) logger.error("email.not_configured", { message: "RESEND_API_KEY ou EMAIL_FROM ausente" });
    return { ok: false, mode: "resend", error: "Envio de e-mail não configurado." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      if (options.silent) console.error("email.failed", res.status, body);
      else logger.error("email.failed", { status: res.status, message: `Resend respondeu ${res.status}: ${body}` });
      return { ok: false, mode: "resend", error: "Falha ao enviar e-mail." };
    }
    return { ok: true, mode: "resend" };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (options.silent) console.error("email.exception", text);
    else logger.error("email.exception", { message: text });
    return { ok: false, mode: "resend", error: "Falha ao enviar e-mail." };
  }
}

// Todo dado vindo do usuário ou do banco passa por aqui antes de entrar no
// HTML. Sem isso, alguém cadastra o nome "<a href=...>" e manda phishing
// com a marca e o domínio do Pulse.
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function siteUrl(path = "") {
  return `${publicEnv().siteUrl.replace(/\/$/, "")}${path}`;
}

/**
 * Casca visual de todos os e-mails: topo azul-marinho com a marca, cartão
 * branco e rodapé de contato. Tabelas e estilos inline de propósito: é o que
 * Gmail e Outlook respeitam.
 */
export function brandedEmail({
  heading,
  bodyHtml,
  cta,
  preheader,
}: {
  heading: string;
  /** HTML já montado; escape os dados dinâmicos com escapeHtml. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Texto curto que aparece ao lado do assunto na caixa de entrada. */
  preheader?: string;
}): string {
  const button = cta
    ? `<tr><td style="padding-top:28px">
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#0f2a5f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 26px;border-radius:12px">${escapeHtml(cta.label)}</a>
      </td></tr>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f6fb">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px">
        <tr><td style="background:#0f2a5f;border-radius:16px 16px 0 0;padding:22px 32px">
          <img src="${siteUrl("/brand/mark-white.png")}" width="26" height="26" alt="" style="vertical-align:middle;border:0">
          <span style="vertical-align:middle;margin-left:10px;color:#ffffff;font-size:17px;font-weight:bold">Domu Pulse</span>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #e2e7f0;border-top:0;border-radius:0 0 16px 16px;padding:32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td>
              <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0b1b36">${escapeHtml(heading)}</h1>
              <div style="font-size:15px;line-height:1.65;color:#2b3a56">${bodyHtml}</div>
            </td></tr>
            ${button}
          </table>
        </td></tr>
        <tr><td style="padding:22px 12px 0;text-align:center;font-size:12px;line-height:1.7;color:#5d6983">
          Precisa de ajuda? Fale pelo
          <a href="${contactWhatsappUrl("Olá! Preciso de ajuda com o Domu Pulse.")}" style="color:#1a3a7c;font-weight:bold;text-decoration:none">WhatsApp</a>
          ou pelo <a href="mailto:${CONTACT_EMAIL}" style="color:#1a3a7c;font-weight:bold;text-decoration:none">e-mail</a>.<br>
          Domu Pulse, um produto DomuTech
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function contactFooterText() {
  return `\n\nPrecisa de ajuda?\nWhatsApp: ${contactWhatsappUrl("Olá! Preciso de ajuda com o Domu Pulse.")}\nE-mail: ${CONTACT_EMAIL}\n\nDomu Pulse, um produto DomuTech`;
}
