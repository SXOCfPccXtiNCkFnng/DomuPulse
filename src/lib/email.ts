import "server-only";
import { publicEnv } from "@/lib/env";
import { emailEnv } from "@/lib/env.server";

// Nome e imobiliária vêm do formulário: tudo que entra no HTML é escapado.
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function send(to: string, subject: string, html: string, text: string) {
  let config: ReturnType<typeof emailEnv>;
  try {
    config = emailEnv();
  } catch {
    console.warn("e-mail não enviado: RESEND_API_KEY ou EMAIL_FROM ausente");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: config.from, to: [to], subject, html, text }),
  });
  if (!res.ok) console.error("e-mail falhou", res.status, await res.text().catch(() => ""));
}

export async function sendWelcomeEmail(input: { to: string; fullName: string; orgName: string }) {
  const firstName = input.fullName.split(" ")[0];
  const name = escapeHtml(firstName);
  const org = escapeHtml(input.orgName);
  const url = `${publicEnv().siteUrl}/painel`;

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0b1b36">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e7f0;border-radius:16px;overflow:hidden">
        <tr><td style="background:#0f2a5f;padding:28px 32px">
          <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:-0.2px">Domu Pulse</span>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0b1b36">Parabéns, ${name}!</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2b3a56">
            A <strong>${org}</strong> agora faz parte do Domu Pulse. Seu teste grátis de 14 dias já começou.
          </p>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#2b3a56">Para começar:</p>
          <ol style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.7;color:#2b3a56">
            <li>Crie a primeira equipe na aba Equipe</li>
            <li>Convide o gerente e os corretores</li>
            <li>Ative as notificações no celular na aba Conta</li>
          </ol>
          <a href="${url}" style="display:inline-block;background:#0f2a5f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 24px;border-radius:12px">Acessar o painel</a>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #e2e7f0;font-size:12px;color:#5d6983">
          Domu Pulse, um produto DomuTech
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Parabéns, ${firstName}!

A ${input.orgName} agora faz parte do Domu Pulse. Seu teste grátis de 14 dias já começou.

Para começar:
1. Crie a primeira equipe na aba Equipe
2. Convide o gerente e os corretores
3. Ative as notificações no celular na aba Conta

Acesse o painel: ${url}

Domu Pulse, um produto DomuTech`;

  await send(input.to, "Bem-vindo ao Domu Pulse", html, text);
}
