import "server-only";
import { publicEnv } from "@/lib/env";
import { emailEnv } from "@/lib/env.server";
import { CONTACT_EMAIL, contactWhatsappUrl } from "@/lib/legal";
import { logger } from "@/lib/logger";

export type EmailMessage = { to: string; subject: string; html: string; text: string; replyTo?: string; fromName?: string; bcc?: string };
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

  // O endereço continua o do domínio verificado; só o nome exibido pode mudar
  // (ex.: a carta de reajuste sai no nome da empresa, não "Domu Pulse").
  const fromAddress = config.from.match(/<([^>]+)>/)?.[1] ?? config.from;
  const from = message.fromName ? `"${message.fromName.replace(/["<>\r\n]/g, " ").trim().slice(0, 78)}" <${fromAddress}>` : config.from;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.bcc ? { bcc: [message.bcc] } : {}),
      }),
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

// Fonte do sistema de cada aparelho, com Arial de reserva.
export const EMAIL_FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function siteUrl(path = "") {
  return `${publicEnv().siteUrl.replace(/\/$/, "")}${path}`;
}

// O provedor de e-mail busca as imagens pela internet: um endereço local
// (localhost, http) chega quebrado. Nesses casos usa o domínio público.
const PUBLIC_ORIGIN = "https://pulse.domutech.digital";

/** Endereço público de uma imagem usada nos e-mails. */
export function emailAssetUrl(path: string) {
  const base = siteUrl();
  return /^https:\/\/(?!localhost|127\.)/.test(base) ? `${base}${path}` : `${PUBLIC_ORIGIN}${path}`;
}

/**
 * Casca visual de todos os e-mails, no estilo da página inicial: topo preto
 * com a marca, faixa azul-marinho com o título, corpo branco, botão azul e
 * rodapé de ajuda. Tabelas e estilos inline de propósito: é o que Gmail,
 * Outlook e Apple Mail respeitam.
 */
export function brandedEmail({
  heading,
  eyebrow,
  intro,
  bodyHtml,
  cta,
  preheader,
}: {
  heading: string;
  /** Rótulo pequeno acima do título, como "Convite" ou "Segurança". */
  eyebrow?: string;
  /** Frase curta embaixo do título, ainda na faixa escura. Texto puro. */
  intro?: string;
  /** HTML já montado; escape os dados dinâmicos com escapeHtml. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Texto curto que aparece ao lado do assunto na caixa de entrada. */
  preheader?: string;
}): string {
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px"><tr>
        <td bgcolor="#0259f3" style="background:#0259f3;border-radius:8px">
          <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:15px 28px;font-family:${EMAIL_FONT};font-size:14px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;text-decoration:none">${escapeHtml(cta.label)} &rarr;</a>
        </td>
      </tr></table>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
</head>
<body style="margin:0;padding:0;background:#eef1f7">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef1f7" style="background:#eef1f7">
    <tr><td align="center" style="padding:32px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
        <tr><td bgcolor="#02050b" style="background:#02050b;border-radius:14px 14px 0 0;padding:22px 36px">
          <img src="${emailAssetUrl("/brand/mark-white.png")}" width="24" height="24" alt="" style="display:inline-block;vertical-align:middle;border:0;outline:none;text-decoration:none">
          <span style="vertical-align:middle;margin-left:10px;font-family:${EMAIL_FONT};font-size:16px;color:#ffffff"><span style="color:#8f9bb5">Domu</span> <strong>Pulse</strong></span>
        </td></tr>
        <tr><td bgcolor="#0a1428" style="background:#0a1428;padding:38px 36px 34px">
          ${eyebrow ? `<div style="font-family:${EMAIL_FONT};font-size:12px;font-weight:700;letter-spacing:2.5px;color:#7ea5ff;text-transform:uppercase">&#8212;&nbsp; ${escapeHtml(eyebrow)}</div>` : ""}
          <h1 style="margin:${eyebrow ? "16px" : "0"} 0 0;font-family:${EMAIL_FONT};font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.6px;color:#ffffff">${escapeHtml(heading)}</h1>
          ${intro ? `<p style="margin:14px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:1.6;color:#c7d3ea">${escapeHtml(intro)}</p>` : ""}
        </td></tr>
        <tr><td bgcolor="#ffffff" style="background:#ffffff;padding:34px 36px 38px">
          <div style="font-family:${EMAIL_FONT};font-size:15px;line-height:1.65;color:#2b3a56">${bodyHtml}</div>
          ${button}
        </td></tr>
        <tr><td bgcolor="#f4f6fb" style="background:#f4f6fb;border-top:1px solid #e2e7f0;border-radius:0 0 14px 14px;padding:22px 36px">
          <p style="margin:0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.6;color:#2b3a56">
            <strong>Precisa de ajuda?</strong> Chame no
            <a href="${contactWhatsappUrl("Olá! Preciso de ajuda com o Domu Pulse.")}" style="color:#0259f3;font-weight:700;text-decoration:none">WhatsApp</a>
            ou escreva para <a href="mailto:${CONTACT_EMAIL}" style="color:#0259f3;font-weight:700;text-decoration:none">${CONTACT_EMAIL}</a>.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:22px 12px 0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.7;color:#8f9bb5">
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
