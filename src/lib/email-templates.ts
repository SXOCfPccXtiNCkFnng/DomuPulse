import "server-only";
import { brandedEmail, contactFooterText, escapeHtml, sendEmail, siteUrl } from "@/lib/email";
import { WELCOME_SUBJECT, welcomeEmailHtml, welcomeEmailText } from "@/lib/email-welcome";
import { CONTACT_EMAIL, contactWhatsappUrl } from "@/lib/legal";
import { formatMoney } from "@/lib/metrics";

const p = (html: string) => `<p style="margin:0 0 12px">${html}</p>`;

// Espaço entre os quadros de números. O Gmail descarta colunas vazias, então
// esta leva um espaço e largura fixa.
const STAT_GAP = '<td width="10" style="width:10px;min-width:10px;font-size:1px;line-height:1px">&nbsp;</td>';

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

export function sendWelcomeEmail(input: { to: string; fullName: string; orgName: string }) {
  const welcome = {
    firstName: firstName(input.fullName),
    orgName: input.orgName,
    baseUrl: siteUrl(),
    whatsappUrl: contactWhatsappUrl("Olá! Acabei de criar a conta no Domu Pulse e quero ajuda para começar."),
    contactEmail: CONTACT_EMAIL,
  };
  return sendEmail({ to: input.to, subject: WELCOME_SUBJECT, html: welcomeEmailHtml(welcome), text: welcomeEmailText(welcome) });
}

export function sendInviteEmail(input: { to: string; fullName: string; orgName: string; roleLabel: string; invitedBy: string; link: string }) {
  const name = firstName(input.fullName);
  return sendEmail({
    to: input.to,
    subject: `${input.invitedBy} convidou você para o Domu Pulse`,
    html: brandedEmail({
      eyebrow: "Convite",
      heading: `${name}, você foi convidado para a ${input.orgName}.`,
      intro: `${input.invitedBy} chamou você para a equipe no Domu Pulse, como ${input.roleLabel.toLowerCase()}.`,
      preheader: `Você foi convidado como ${input.roleLabel.toLowerCase()} da ${input.orgName}.`,
      bodyHtml:
        p("No Pulse você lança seus relatórios pelo celular em poucos toques, acompanha seu funil do dia e recebe um lembrete antes de cada horário.") +
        p("Toque no botão para criar sua senha e entrar. O link vale por 24 horas e só pode ser usado uma vez."),
      cta: { label: "Criar minha senha", url: input.link },
    }),
    text: `Olá, ${name}\n\n${input.invitedBy} convidou você para a equipe da ${input.orgName} no Domu Pulse, como ${input.roleLabel.toLowerCase()}.\n\nCrie sua senha por este link (vale por 24 horas, uso único):\n${input.link}${contactFooterText()}`,
  });
}

/** Corretor que entrou pelo link de convite da conta: já tem senha, só falta começar. */
export function sendTeamWelcomeEmail(input: { to: string; fullName: string; orgName: string }) {
  const name = firstName(input.fullName);
  const url = siteUrl("/painel");
  return sendEmail({
    to: input.to,
    subject: `Bem-vindo à equipe da ${input.orgName}`,
    html: brandedEmail({
      eyebrow: "Bem-vindo à equipe",
      heading: `Tudo pronto, ${name}.`,
      intro: `Você agora faz parte da equipe da ${input.orgName} no Domu Pulse.`,
      preheader: "Seu acesso está criado. Veja como lançar o primeiro relatório.",
      bodyHtml:
        p("<strong>Como funciona o seu dia:</strong>") +
        `<ol style="margin:0 0 12px;padding-left:20px">
          <li style="margin:4px 0">Marque <strong>Trabalhando</strong> ou <strong>Folga</strong> no começo do dia.</li>
          <li style="margin:4px 0">Em cada horário de relatório, lance visitas, propostas e vendas em poucos toques.</li>
          <li style="margin:4px 0">Cadastre seus clientes em <strong>Clientes</strong> e acompanhe cada um até a venda.</li>
        </ol>` +
        p("Dica: em <strong>Conta → Notificações</strong>, ative os avisos no celular. Você recebe um lembrete 10 minutos antes de cada horário."),
      cta: { label: "Abrir o Pulse", url },
    }),
    text: `Tudo pronto, ${name}.\n\nVocê agora faz parte da equipe da ${input.orgName} no Domu Pulse.\n\n1. Marque Trabalhando ou Folga no começo do dia.\n2. Em cada horário, lance visitas, propostas e vendas.\n3. Cadastre seus clientes em Clientes.\n\nAtive os avisos no celular em Conta > Notificações.\n\nAbrir o Pulse: ${url}${contactFooterText()}`,
  });
}

export function sendPasswordResetEmail(input: { to: string; link: string }) {
  return sendEmail({
    to: input.to,
    subject: "Crie uma nova senha no Domu Pulse",
    html: brandedEmail({
      eyebrow: "Segurança",
      heading: "Vamos criar uma nova senha.",
      intro: "Recebemos um pedido para trocar a senha da sua conta.",
      preheader: "O link vale por 1 hora.",
      bodyHtml:
        p("Toque no botão para escolher a nova senha. O link vale por <strong>1 hora</strong> e só pode ser usado uma vez.") +
        p("Se não foi você, pode ignorar este e-mail: sua senha atual continua valendo."),
      cta: { label: "Criar nova senha", url: input.link },
    }),
    text: `Recebemos um pedido para criar uma nova senha na sua conta do Domu Pulse.\n\nUse este link (vale por 1 hora, uso único):\n${input.link}\n\nSe não foi você, ignore este e-mail.${contactFooterText()}`,
  });
}

export type DigestData = {
  to: string;
  fullName: string;
  scopeLabel: string;
  /** "05/10 a 11/10" no resumo semanal, "setembro de 2026" no mensal. */
  weekLabel: string;
  /** Semana (padrão) ou mês: muda título, comparação e assunto. */
  period?: "week" | "month";
  link: string;
  metrics: { label: string; value: number; previous: number }[];
  delivery: { delivered: number; expected: number };
  top: { name: string; sales: number; visits: number }[];
  attention: { name: string; reason: string }[];
};

function delta(value: number, previous: number, monthly = false) {
  const [equal, noBase, over] = monthly
    ? ["igual ao mês anterior", "sem base no mês anterior", "sobre o mês anterior"]
    : ["igual à semana anterior", "sem base na semana anterior", "sobre a semana anterior"];
  if (previous === 0) return value === 0 ? equal : noBase;
  const pct = Math.round(((value - previous) / previous) * 100);
  if (pct === 0) return equal;
  return `${pct > 0 ? "+" : ""}${pct}% ${over}`;
}

export function sendWeeklyDigestEmail(d: DigestData) {
  const monthly = d.period === "month";
  const name = firstName(d.fullName);
  const rate = d.delivery.expected ? Math.round((d.delivery.delivered / d.delivery.expected) * 100) : null;
  const cell = "padding:14px;border:1px solid #e2e7f0;border-radius:8px;background:#f8f9fc";

  const stats = d.metrics
    .map(
      (m) => `<td style="${cell};width:25%;vertical-align:top">
        <div style="font-size:12px;color:#5d6983">${escapeHtml(m.label)}</div>
        <div style="font-size:24px;font-weight:800;color:#040c30;margin-top:2px">${m.value}</div>
        <div style="font-size:11px;color:#5d6983;margin-top:2px">${delta(m.value, m.previous, monthly)}</div>
      </td>`,
    )
    .join(STAT_GAP);

  const list = (items: string[]) =>
    items.length ? `<ol style="margin:0;padding-left:20px">${items.map((i) => `<li style="margin:3px 0">${i}</li>`).join("")}</ol>` : "";

  const top = list(d.top.map((t) => `<strong>${escapeHtml(t.name)}</strong>: ${t.sales} vendas, ${t.visits} visitas`));
  const attention = list(d.attention.map((a) => `<strong>${escapeHtml(a.name)}</strong>: ${escapeHtml(a.reason)}`));
  const section = (title: string) =>
    `<div style="margin:22px 0 8px;font-size:12px;font-weight:700;letter-spacing:2px;color:#1a3a7c;text-transform:uppercase">&#8212;&nbsp; ${title}</div>`;

  const html = brandedEmail({
    eyebrow: monthly ? "Resumo do mês" : "Resumo da semana",
    heading: monthly ? `Seu mês, ${name}.` : `Sua semana, ${name}.`,
    intro: `${d.scopeLabel}, ${monthly ? "em" : "de"} ${d.weekLabel}.`,
    preheader: `${d.scopeLabel}, ${d.weekLabel}`,
    bodyHtml:
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px"><tr>${stats}</tr></table>` +
      (rate !== null ? section("Entregas") + p(`<strong>${rate}%</strong> dos relatórios entregues (${d.delivery.delivered} de ${d.delivery.expected} esperados).`) : "") +
      (top ? section("Destaques") + top : "") +
      (attention ? section("Precisam de atenção") + attention : ""),
    cta: { label: "Ver relatório completo", url: d.link },
  });

  const text =
    `${monthly ? "Seu mês" : "Sua semana"}, ${name}\n\nResumo de ${d.scopeLabel} ${monthly ? "em" : "na semana de"} ${d.weekLabel}.\n\n` +
    d.metrics.map((m) => `${m.label}: ${m.value} (${delta(m.value, m.previous, monthly)})`).join("\n") +
    (rate !== null ? `\n\nRelatórios entregues: ${rate}% (${d.delivery.delivered} de ${d.delivery.expected})` : "") +
    (d.top.length ? `\n\nDestaques:\n${d.top.map((t, i) => `${i + 1}. ${t.name}: ${t.sales} vendas, ${t.visits} visitas`).join("\n")}` : "") +
    (d.attention.length ? `\n\nPrecisam de atenção:\n${d.attention.map((a) => `${a.name}: ${a.reason}`).join("\n")}` : "") +
    `\n\nRelatório completo: ${d.link}${contactFooterText()}`;

  return sendEmail({ to: d.to, subject: `${monthly ? "Resumo do mês" : "Resumo da semana"}: ${d.weekLabel}`, html, text });
}

export type DailyDigestData = {
  to: string;
  fullName: string;
  dayLabel: string;
  link: string;
  metrics: { label: string; value: number; previous: number }[];
  delivery: { delivered: number; expected: number };
  top: { name: string; sales: number; visits: number }[];
  pending: { name: string; reason: string }[];
  notes: { name: string; slot: string; text: string }[];
};

function vsYesterday(value: number, previous: number) {
  const diff = value - previous;
  if (diff === 0) return "igual a ontem";
  return `${diff > 0 ? "+" : ""}${diff} em relação a ontem`;
}

export function sendDailyDigestEmail(d: DailyDigestData) {
  const name = firstName(d.fullName);
  const rate = d.delivery.expected ? Math.round((d.delivery.delivered / d.delivery.expected) * 100) : null;
  const cell = "padding:14px;border:1px solid #e2e7f0;border-radius:8px;background:#f8f9fc";
  const stats = d.metrics
    .map(
      (m) => `<td style="${cell};width:25%;vertical-align:top">
        <div style="font-size:12px;color:#5d6983">${escapeHtml(m.label)}</div>
        <div style="font-size:24px;font-weight:800;color:#040c30;margin-top:2px">${m.value}</div>
        <div style="font-size:11px;color:#5d6983;margin-top:2px">${vsYesterday(m.value, m.previous)}</div>
      </td>`,
    )
    .join(STAT_GAP);
  const list = (items: string[]) =>
    items.length ? `<ol style="margin:0;padding-left:20px">${items.map((i) => `<li style="margin:3px 0">${i}</li>`).join("")}</ol>` : "";
  const section = (title: string) =>
    `<div style="margin:22px 0 8px;font-size:12px;font-weight:700;letter-spacing:2px;color:#1a3a7c;text-transform:uppercase">&#8212;&nbsp; ${title}</div>`;

  const top = list(d.top.map((t) => `<strong>${escapeHtml(t.name)}</strong>: ${t.sales} vendas, ${t.visits} visitas`));
  const pending = list(d.pending.map((a) => `<strong>${escapeHtml(a.name)}</strong>: ${escapeHtml(a.reason)}`));
  const notes = d.notes.length
    ? d.notes
        .map(
          (n) => `<div style="margin:0 0 8px;padding:10px 12px;border-left:3px solid #7ea5ff;background:#f8f9fc">
            <div style="font-size:12px;color:#5d6983"><strong style="color:#040c30">${escapeHtml(n.name)}</strong>, relatório das ${escapeHtml(n.slot)}</div>
            <div style="margin-top:2px">${escapeHtml(n.text)}</div>
          </div>`,
        )
        .join("")
    : "";

  const html = brandedEmail({
    eyebrow: "Resumo do dia",
    heading: `O dia fechou, ${name}.`,
    intro: `Como foi a equipe em ${d.dayLabel}.`,
    preheader: rate !== null ? `${rate}% dos relatórios entregues hoje.` : `Resumo de ${d.dayLabel}.`,
    bodyHtml:
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px"><tr>${stats}</tr></table>` +
      (rate !== null ? section("Entregas") + p(`<strong>${rate}%</strong> dos relatórios entregues (${d.delivery.delivered} de ${d.delivery.expected} esperados).`) : "") +
      (top ? section("Destaques do dia") + top : "") +
      (pending ? section("Ficaram devendo") + pending : "") +
      (notes ? section("Observações da equipe") + notes : ""),
    cta: { label: "Ver o dia completo", url: d.link },
  });

  const text =
    `O dia fechou, ${name}.\n\nResumo de ${d.dayLabel}.\n\n` +
    d.metrics.map((m) => `${m.label}: ${m.value} (${vsYesterday(m.value, m.previous)})`).join("\n") +
    (rate !== null ? `\n\nRelatórios entregues: ${rate}% (${d.delivery.delivered} de ${d.delivery.expected})` : "") +
    (d.top.length ? `\n\nDestaques:\n${d.top.map((t, i) => `${i + 1}. ${t.name}: ${t.sales} vendas, ${t.visits} visitas`).join("\n")}` : "") +
    (d.pending.length ? `\n\nFicaram devendo:\n${d.pending.map((a) => `${a.name}: ${a.reason}`).join("\n")}` : "") +
    (d.notes.length ? `\n\nObservações:\n${d.notes.map((n) => `${n.name} (${n.slot}): ${n.text}`).join("\n")}` : "") +
    `\n\nVer o dia completo: ${d.link}${contactFooterText()}`;

  return sendEmail({ to: d.to, subject: `Resumo do dia: ${d.dayLabel}`, html, text });
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
      eyebrow: "Segurança",
      heading: "Sua senha foi alterada.",
      intro: `Em ${when}, horário de Brasília.`,
      bodyHtml:
        p("Se foi você, está tudo certo e não precisa fazer nada.") +
        p("<strong>Se não foi você</strong>, crie uma nova senha agora. Isso desconecta quem estiver usando sua conta."),
      cta: { label: "Não fui eu", url },
    }),
    text: `A senha da sua conta do Domu Pulse foi alterada em ${when} (horário de Brasília).\n\nSe não foi você, crie uma nova senha agora:\n${url}${contactFooterText()}`,
  });
}

/** Aviso de segurança: o resumo semanal passou a ir para outro endereço. */
export function sendDigestEmailChangedEmail(input: { to: string; newEmail: string | null }) {
  const url = siteUrl("/conta?aba=notificacoes");
  const destination = input.newEmail ?? input.to;
  return sendEmail({
    to: input.to,
    subject: "O resumo semanal mudou de endereço",
    html: brandedEmail({
      eyebrow: "Segurança",
      heading: "O resumo semanal mudou de endereço.",
      intro: input.newEmail ? `Agora ele vai para ${input.newEmail}.` : "Ele voltou para o seu e-mail de login.",
      bodyHtml:
        p(`A partir da próxima segunda, o resumo da semana da sua equipe chega em <strong>${escapeHtml(destination)}</strong>.`) +
        p("<strong>Se não foi você</strong>, troque sua senha agora e volte o endereço em Conta → Notificações."),
      cta: { label: "Revisar notificações", url },
    }),
    text: `O resumo semanal do Domu Pulse agora vai para ${destination}.\n\nSe não foi você, troque sua senha e revise em:\n${url}${contactFooterText()}`,
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
      eyebrow: "Acesso gratuito",
      heading: `Faltam ${days}, ${name}.`,
      intro: `O acesso gratuito da ${input.orgName} está acabando.`,
      bodyHtml:
        p("Para a equipe continuar enviando relatórios sem interrupção, ative a assinatura. O pagamento pode ser por Pix, boleto ou cartão.") +
        p("Os dados ficam todos salvos: nada se perde na troca."),
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
      eyebrow: "Acesso gratuito",
      heading: `O acesso gratuito terminou, ${name}.`,
      intro: `Os dados da ${input.orgName} continuam salvos e disponíveis para consulta.`,
      bodyHtml: p("Ative a assinatura para a equipe voltar a enviar relatórios, cadastrar clientes e agendar visitas."),
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
      eyebrow: "Assinatura",
      heading: `Pagamento confirmado, ${name}.`,
      intro: `Recebemos ${value} da ${input.orgName}.`,
      bodyHtml: p("A assinatura está ativa e a equipe pode usar normalmente. Obrigado por confiar no Domu Pulse."),
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
      eyebrow: "Assinatura",
      heading: `Fatura em aberto, ${name}.`,
      intro: `A fatura da ${input.orgName} venceu e ainda não identificamos o pagamento.`,
      bodyHtml:
        p("Por enquanto tudo continua funcionando. Regularize para evitar o bloqueio dos novos lançamentos.") +
        p("Se já pagou, pode desconsiderar: a confirmação pode levar algumas horas."),
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
        eyebrow: "Alerta da plataforma",
        heading: "Novo erro no Pulse.",
        intro: input.source,
        bodyHtml:
          (input.orgId ? p(`<strong>Organização:</strong> ${escapeHtml(input.orgId)}`) : "") +
          p(`<strong>Mensagem:</strong> ${escapeHtml(input.message)}`),
        cta: { label: "Abrir painel interno", url },
      }),
      text: `Novo erro na plataforma\n\nOrigem: ${input.source}\n${input.orgId ? `Organização: ${input.orgId}\n` : ""}Mensagem: ${input.message}\n\n${url}`,
    },
    { silent: true },
  );
}

export async function sendNewSignupAlert(input: {
  fullName: string;
  email: string;
  orgName: string;
  phone: string;
  ip?: string;
}) {
  const { getSignupAlertEmails } = await import("@/lib/interno");
  const recipients = await getSignupAlertEmails();
  if (!recipients.length) return;

  const url = siteUrl("/interno?aba=clientes");
  const cleanPhone = input.phone.replace(/\D/g, "");
  const waUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : null;
  const now = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const bodyHtml =
    p("Um novo cliente contratante acabou de se cadastrar no Domu Pulse:") +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;border-collapse:collapse;font-size:14px;line-height:22px">
      <tr>
        <td style="padding:6px 0;color:#666;width:120px"><strong>Nome:</strong></td>
        <td style="padding:6px 0;color:#111"><strong>${escapeHtml(input.fullName)}</strong></td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#666"><strong>Imobiliária:</strong></td>
        <td style="padding:6px 0;color:#111">${escapeHtml(input.orgName)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#666"><strong>E-mail:</strong></td>
        <td style="padding:6px 0;color:#111"><a href="mailto:${escapeHtml(input.email)}" style="color:#0259f3">${escapeHtml(input.email)}</a></td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#666"><strong>WhatsApp:</strong></td>
        <td style="padding:6px 0;color:#111">${waUrl ? `<a href="${escapeHtml(waUrl)}" style="color:#0259f3">${escapeHtml(input.phone)} (abrir WhatsApp)</a>` : escapeHtml(input.phone)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#666"><strong>Data/Hora:</strong></td>
        <td style="padding:6px 0;color:#111">${escapeHtml(now)}</td>
      </tr>
    </table>`;

  const text = `Novo cadastro no Domu Pulse!\n\nNome: ${input.fullName}\nImobiliária: ${input.orgName}\nE-mail: ${input.email}\nWhatsApp: ${input.phone}${waUrl ? ` (${waUrl})` : ""}\nData/Hora: ${now}\n\nVer no painel: ${url}`;

  await Promise.allSettled(
    recipients.map((to) =>
      sendEmail(
        {
          to,
          subject: `[Novo Cliente] ${input.fullName} cadastrou a imobiliária ${input.orgName}`,
          html: brandedEmail({
            eyebrow: "Novo Cliente",
            heading: "Novo cadastro no Pulse!",
            intro: `${input.fullName} acabou de criar a conta da ${input.orgName}.`,
            preheader: `Novo cadastro: ${input.fullName} (${input.orgName})`,
            bodyHtml,
            cta: { label: "Abrir painel interno", url },
          }),
          text,
        },
        { silent: true },
      ),
    ),
  );
}

