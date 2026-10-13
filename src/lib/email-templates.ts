import "server-only";
import { brandedEmail, contactFooterText, escapeHtml, sendEmail, siteUrl } from "@/lib/email";
import { formatMoney } from "@/lib/metrics";

const p = (html: string) => `<p style="margin:0 0 12px">${html}</p>`;

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

export function sendWelcomeEmail(input: { to: string; fullName: string; orgName: string }) {
  const name = firstName(input.fullName);
  const url = siteUrl("/painel");
  return sendEmail({
    to: input.to,
    subject: "Bem-vindo ao Domu Pulse",
    html: brandedEmail({
      heading: `Parabéns, ${name}!`,
      preheader: "Seu teste grátis de 14 dias já começou.",
      bodyHtml:
        p(`A <strong>${escapeHtml(input.orgName)}</strong> agora faz parte do Domu Pulse. Seu teste grátis de 14 dias já começou.`) +
        p("Para começar:") +
        `<ol style="margin:0;padding-left:20px">
          <li>Crie a primeira equipe na aba Equipe</li>
          <li>Convide o gerente e os corretores</li>
          <li>Ative as notificações no celular na aba Conta</li>
        </ol>`,
      cta: { label: "Acessar o painel", url },
    }),
    text: `Parabéns, ${name}!\n\nA ${input.orgName} agora faz parte do Domu Pulse. Seu teste grátis de 14 dias já começou.\n\nPara começar:\n1. Crie a primeira equipe na aba Equipe\n2. Convide o gerente e os corretores\n3. Ative as notificações no celular na aba Conta\n\nAcesse: ${url}${contactFooterText()}`,
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

export function sendTrialEndingEmail(input: { to: string; fullName: string; orgName: string; daysLeft: number }) {
  const name = firstName(input.fullName);
  const days = input.daysLeft === 1 ? "1 dia" : `${input.daysLeft} dias`;
  const url = siteUrl("/conta#assinatura");
  return sendEmail({
    to: input.to,
    subject: `Faltam ${days} de teste grátis no Domu Pulse`,
    html: brandedEmail({
      heading: `Faltam ${days}, ${name}`,
      bodyHtml:
        p(`O teste grátis da <strong>${escapeHtml(input.orgName)}</strong> termina em ${days}.`) +
        p("Para a equipe continuar enviando relatórios sem interrupção, ative a assinatura. O pagamento pode ser por Pix, boleto ou cartão."),
      cta: { label: "Ativar assinatura", url },
    }),
    text: `Faltam ${days}, ${name}\n\nO teste grátis da ${input.orgName} termina em ${days}. Para a equipe continuar enviando relatórios, ative a assinatura:\n${url}${contactFooterText()}`,
  });
}

export function sendTrialEndedEmail(input: { to: string; fullName: string; orgName: string }) {
  const name = firstName(input.fullName);
  const url = siteUrl("/conta#assinatura");
  return sendEmail({
    to: input.to,
    subject: "Seu teste grátis do Domu Pulse terminou",
    html: brandedEmail({
      heading: `O teste terminou, ${name}`,
      bodyHtml:
        p(`O teste grátis da <strong>${escapeHtml(input.orgName)}</strong> chegou ao fim. Todos os dados continuam salvos e disponíveis para consulta.`) +
        p("Ative a assinatura para a equipe voltar a enviar relatórios e agendar visitas."),
      cta: { label: "Ativar assinatura", url },
    }),
    text: `O teste terminou, ${name}\n\nO teste grátis da ${input.orgName} chegou ao fim. Os dados continuam salvos. Ative a assinatura para voltar a usar:\n${url}${contactFooterText()}`,
  });
}

export function sendPaymentConfirmedEmail(input: { to: string; fullName: string; orgName: string; seats: number; valueCents: number }) {
  const name = firstName(input.fullName);
  const value = formatMoney(input.valueCents);
  return sendEmail({
    to: input.to,
    subject: "Pagamento confirmado no Domu Pulse",
    html: brandedEmail({
      heading: `Pagamento confirmado, ${name}`,
      bodyHtml:
        p(`Recebemos o pagamento de <strong>${value}</strong> da <strong>${escapeHtml(input.orgName)}</strong>.`) +
        p(`A assinatura está ativa com <strong>${input.seats} assentos</strong>. Obrigado por confiar no Domu Pulse.`),
      cta: { label: "Acessar o painel", url: siteUrl("/painel") },
    }),
    text: `Pagamento confirmado, ${name}\n\nRecebemos o pagamento de ${value} da ${input.orgName}. A assinatura está ativa com ${input.seats} assentos.${contactFooterText()}`,
  });
}

export function sendPaymentOverdueEmail(input: { to: string; fullName: string; orgName: string }) {
  const name = firstName(input.fullName);
  const url = siteUrl("/conta#assinatura");
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
