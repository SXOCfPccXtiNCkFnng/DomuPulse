import "server-only";
import { brandedEmail, contactFooterText, escapeHtml, sendEmail, siteUrl } from "@/lib/email";
import { formatMoney } from "@/lib/metrics";

const p = (html: string) => `<p style="margin:0 0 12px">${html}</p>`;

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

export function sendWelcomeEmail(input: { to: string; fullName: string; orgName: string }) {
  const name = firstName(input.fullName);
  const url = siteUrl("/ativar");
  return sendEmail({
    to: input.to,
    subject: "Bem-vindo ao Domu Pulse",
    html: brandedEmail({
      heading: `Parabéns, ${name}!`,
      preheader: "Falta só ativar a conta para a equipe começar.",
      bodyHtml:
        p(`A <strong>${escapeHtml(input.orgName)}</strong> agora faz parte do Domu Pulse.`) +
        p("Para começar:") +
        `<ol style="margin:0;padding-left:20px">
          <li>Ative a conta com a assinatura ou um cupom</li>
          <li>Crie a primeira equipe na aba Equipe</li>
          <li>Convide o gerente e os corretores</li>
          <li>Ative as notificações no celular na aba Conta</li>
        </ol>`,
      cta: { label: "Ativar minha conta", url },
    }),
    text: `Parabéns, ${name}!\n\nA ${input.orgName} agora faz parte do Domu Pulse.\n\nPara começar:\n1. Ative a conta com a assinatura ou um cupom\n2. Crie a primeira equipe na aba Equipe\n3. Convide o gerente e os corretores\n4. Ative as notificações no celular na aba Conta\n\nAcesse: ${url}${contactFooterText()}`,
  });
}

export function sendInviteEmail(input: { to: string; fullName: string; orgName: string; roleLabel: string; invitedBy: string; link: string }) {
  const name = firstName(input.fullName);
  return sendEmail({
    to: input.to,
    subject: `${input.invitedBy} convidou você para o Domu Pulse`,
    html: brandedEmail({
      heading: `Olá, ${name}`,
      preheader: `Você foi convidado como ${input.roleLabel.toLowerCase()} da ${input.orgName}.`,
      bodyHtml:
        p(`<strong>${escapeHtml(input.invitedBy)}</strong> convidou você para a equipe da <strong>${escapeHtml(input.orgName)}</strong> no Domu Pulse, como <strong>${escapeHtml(input.roleLabel.toLowerCase())}</strong>.`) +
        p("Toque no botão para criar sua senha e entrar. O link vale por 24 horas e só pode ser usado uma vez."),
      cta: { label: "Criar minha senha", url: input.link },
    }),
    text: `Olá, ${name}\n\n${input.invitedBy} convidou você para a equipe da ${input.orgName} no Domu Pulse, como ${input.roleLabel.toLowerCase()}.\n\nCrie sua senha por este link (vale por 24 horas, uso único):\n${input.link}${contactFooterText()}`,
  });
}

export function sendPasswordResetEmail(input: { to: string; link: string }) {
  return sendEmail({
    to: input.to,
    subject: "Crie uma nova senha no Domu Pulse",
    html: brandedEmail({
      heading: "Nova senha",
      bodyHtml:
        p("Recebemos um pedido para criar uma nova senha na sua conta do Domu Pulse.") +
        p("O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha atual continua valendo."),
      cta: { label: "Criar nova senha", url: input.link },
    }),
    text: `Recebemos um pedido para criar uma nova senha na sua conta do Domu Pulse.\n\nUse este link (vale por 1 hora, uso único):\n${input.link}\n\nSe não foi você, ignore este e-mail.${contactFooterText()}`,
  });
}

export type DigestData = {
  to: string;
  fullName: string;
  scopeLabel: string;
  weekLabel: string;
  link: string;
  metrics: { label: string; value: number; previous: number }[];
  delivery: { delivered: number; expected: number };
  top: { name: string; sales: number; visits: number }[];
  attention: { name: string; reason: string }[];
};

function delta(value: number, previous: number) {
  if (previous === 0) return value === 0 ? "igual à semana anterior" : "sem base na semana anterior";
  const pct = Math.round(((value - previous) / previous) * 100);
  if (pct === 0) return "igual à semana anterior";
  return `${pct > 0 ? "+" : ""}${pct}% sobre a semana anterior`;
}

export function sendWeeklyDigestEmail(d: DigestData) {
  const name = firstName(d.fullName);
  const rate = d.delivery.expected ? Math.round((d.delivery.delivered / d.delivery.expected) * 100) : null;
  const cell = "padding:12px;border:1px solid #e2e7f0;border-radius:12px";

  const stats = d.metrics
    .map(
      (m) => `<td style="${cell};width:25%;vertical-align:top">
        <div style="font-size:12px;color:#5d6983">${escapeHtml(m.label)}</div>
        <div style="font-size:22px;font-weight:bold;color:#040c30;margin-top:2px">${m.value}</div>
        <div style="font-size:11px;color:#5d6983;margin-top:2px">${delta(m.value, m.previous)}</div>
      </td>`,
    )
    .join('<td style="width:8px"></td>');

  const list = (items: string[]) =>
    items.length ? `<ol style="margin:0;padding-left:20px">${items.map((i) => `<li style="margin:2px 0">${i}</li>`).join("")}</ol>` : "";

  const top = list(d.top.map((t) => `<strong>${escapeHtml(t.name)}</strong>: ${t.sales} vendas, ${t.visits} visitas`));
  const attention = list(d.attention.map((a) => `<strong>${escapeHtml(a.name)}</strong>: ${escapeHtml(a.reason)}`));

  const html = brandedEmail({
    heading: `Sua semana, ${name}`,
    preheader: `${d.scopeLabel}, ${d.weekLabel}`,
    bodyHtml:
      p(`Resumo de <strong>${escapeHtml(d.scopeLabel)}</strong> na semana de ${escapeHtml(d.weekLabel)}.`) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px"><tr>${stats}</tr></table>` +
      (rate !== null ? p(`Relatórios entregues: <strong>${rate}%</strong> (${d.delivery.delivered} de ${d.delivery.expected} esperados).`) : "") +
      (top ? p("<strong>Destaques</strong>") + top : "") +
      (attention ? `<div style="height:12px"></div>` + p("<strong>Precisam de atenção</strong>") + attention : ""),
    cta: { label: "Ver relatório completo", url: d.link },
  });

  const text =
    `Sua semana, ${name}\n\nResumo de ${d.scopeLabel} na semana de ${d.weekLabel}.\n\n` +
    d.metrics.map((m) => `${m.label}: ${m.value} (${delta(m.value, m.previous)})`).join("\n") +
    (rate !== null ? `\n\nRelatórios entregues: ${rate}% (${d.delivery.delivered} de ${d.delivery.expected})` : "") +
    (d.top.length ? `\n\nDestaques:\n${d.top.map((t, i) => `${i + 1}. ${t.name}: ${t.sales} vendas, ${t.visits} visitas`).join("\n")}` : "") +
    (d.attention.length ? `\n\nPrecisam de atenção:\n${d.attention.map((a) => `${a.name}: ${a.reason}`).join("\n")}` : "") +
    `\n\nRelatório completo: ${d.link}${contactFooterText()}`;

  return sendEmail({ to: d.to, subject: `Resumo da semana: ${d.weekLabel}`, html, text });
}

export function sendPasswordChangedEmail(input: { to: string }) {
  const when = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  const url = siteUrl("/recuperar-senha");
  return sendEmail({
    to: input.to,
    subject: "Sua senha do Domu Pulse foi alterada",
    html: brandedEmail({
      heading: "Senha alterada",
      bodyHtml:
        p(`A senha da sua conta foi alterada em ${escapeHtml(when)} (horário de Brasília).`) +
        p("Se foi você, está tudo certo. Se não foi, crie uma nova senha agora: isso desconecta quem estiver usando sua conta."),
      cta: { label: "Não fui eu, criar nova senha", url },
    }),
    text: `A senha da sua conta do Domu Pulse foi alterada em ${when} (horário de Brasília).\n\nSe não foi você, crie uma nova senha agora:\n${url}${contactFooterText()}`,
  });
}

export function sendTrialEndingEmail(input: { to: string; fullName: string; orgName: string; daysLeft: number }) {
  const name = firstName(input.fullName);
  const days = input.daysLeft === 1 ? "1 dia" : `${input.daysLeft} dias`;
  const url = siteUrl("/conta?aba=assinatura");
  return sendEmail({
    to: input.to,
    subject: `Faltam ${days} de acesso gratuito no Domu Pulse`,
    html: brandedEmail({
      heading: `Faltam ${days}, ${name}`,
      bodyHtml:
        p(`O acesso gratuito da <strong>${escapeHtml(input.orgName)}</strong> termina em ${days}.`) +
        p("Para a equipe continuar enviando relatórios sem interrupção, ative a assinatura. O pagamento pode ser por Pix, boleto ou cartão."),
      cta: { label: "Ativar assinatura", url },
    }),
    text: `Faltam ${days}, ${name}\n\nO acesso gratuito da ${input.orgName} termina em ${days}. Para a equipe continuar enviando relatórios, ative a assinatura:\n${url}${contactFooterText()}`,
  });
}

export function sendTrialEndedEmail(input: { to: string; fullName: string; orgName: string }) {
  const name = firstName(input.fullName);
  const url = siteUrl("/conta?aba=assinatura");
  return sendEmail({
    to: input.to,
    subject: "Seu acesso gratuito ao Domu Pulse terminou",
    html: brandedEmail({
      heading: `O acesso gratuito terminou, ${name}`,
      bodyHtml:
        p(`O acesso gratuito da <strong>${escapeHtml(input.orgName)}</strong> chegou ao fim. Todos os dados continuam salvos e disponíveis para consulta.`) +
        p("Ative a assinatura para a equipe voltar a enviar relatórios e agendar visitas."),
      cta: { label: "Ativar assinatura", url },
    }),
    text: `O acesso gratuito terminou, ${name}\n\nO acesso gratuito da ${input.orgName} chegou ao fim. Os dados continuam salvos. Ative a assinatura para voltar a usar:\n${url}${contactFooterText()}`,
  });
}

export function sendPaymentConfirmedEmail(input: { to: string; fullName: string; orgName: string; valueCents: number }) {
  const name = firstName(input.fullName);
  const value = formatMoney(input.valueCents);
  return sendEmail({
    to: input.to,
    subject: "Pagamento confirmado no Domu Pulse",
    html: brandedEmail({
      heading: `Pagamento confirmado, ${name}`,
      bodyHtml:
        p(`Recebemos o pagamento de <strong>${value}</strong> da <strong>${escapeHtml(input.orgName)}</strong>.`) +
        p("A assinatura está ativa. Obrigado por confiar no Domu Pulse."),
      cta: { label: "Acessar o painel", url: siteUrl("/painel") },
    }),
    text: `Pagamento confirmado, ${name}\n\nRecebemos o pagamento de ${value} da ${input.orgName}. A assinatura está ativa.${contactFooterText()}`,
  });
}

export function sendPaymentOverdueEmail(input: { to: string; fullName: string; orgName: string }) {
  const name = firstName(input.fullName);
  const url = siteUrl("/conta?aba=assinatura");
  return sendEmail({
    to: input.to,
    subject: "Fatura do Domu Pulse em aberto",
    html: brandedEmail({
      heading: `Fatura em aberto, ${name}`,
      bodyHtml:
        p(`A fatura da <strong>${escapeHtml(input.orgName)}</strong> venceu e ainda não identificamos o pagamento.`) +
        p("Por enquanto tudo continua funcionando. Regularize para evitar o bloqueio dos novos lançamentos. Se já pagou, desconsidere: a confirmação pode levar algumas horas."),
      cta: { label: "Ver assinatura", url },
    }),
    text: `Fatura em aberto, ${name}\n\nA fatura da ${input.orgName} venceu e ainda não identificamos o pagamento. Regularize para evitar o bloqueio:\n${url}\n\nSe já pagou, desconsidere.${contactFooterText()}`,
  });
}

// Alerta para a equipe DomuTech. Silencioso: se o próprio e-mail falhar, não
// gera outro alerta.
export function sendOpsAlertEmail(input: { to: string; source: string; message: string; orgId?: string | null }) {
  const url = siteUrl("/interno?aba=erros");
  return sendEmail(
    {
      to: input.to,
      subject: `[Pulse] Erro em ${input.source}`,
      html: brandedEmail({
        heading: "Novo erro na plataforma",
        bodyHtml:
          p(`<strong>Origem:</strong> ${escapeHtml(input.source)}`) +
          (input.orgId ? p(`<strong>Organização:</strong> ${escapeHtml(input.orgId)}`) : "") +
          p(`<strong>Mensagem:</strong> ${escapeHtml(input.message)}`),
        cta: { label: "Abrir painel interno", url },
      }),
      text: `Novo erro na plataforma\n\nOrigem: ${input.source}\n${input.orgId ? `Organização: ${input.orgId}\n` : ""}Mensagem: ${input.message}\n\n${url}`,
    },
    { silent: true },
  );
}
