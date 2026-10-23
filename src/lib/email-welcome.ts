// E-mail de boas-vindas do cadastro. Fica separado dos outros modelos porque
// tem um desenho próprio, no estilo da página inicial: faixa azul-marinho,
// passos numerados e botão em destaque. Tabelas e estilos inline de propósito:
// é o que Gmail, Outlook e Apple Mail respeitam.

export type WelcomeSegment = "brokers" | "hr";

type WelcomeInput = {
  firstName: string;
  orgName: string;
  segment: WelcomeSegment;
  /** Endereço público do app, sem barra no final. */
  baseUrl: string;
  /** Endereço público da marca branca (precisa abrir fora do app). */
  logoUrl: string;
  whatsappUrl: string;
  contactEmail: string;
};

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const SEGMENT_LABEL: Record<WelcomeSegment, string> = {
  brokers: "Gestão de corretores",
  hr: "Recrutamento (RH)",
};

// O que cada módulo entrega e os primeiros passos de quem acabou de entrar.
const CONTENT: Record<WelcomeSegment, { lead: string; features: [string, string][]; steps: { title: string; text: string }[] }> = {
  brokers: {
    lead: "A partir de agora, cada relatório, visita e venda da equipe aparece no seu painel no momento em que acontece. Chega de cobrar relatório no grupo.",
    features: [
      ["Painel ao vivo", "quem entregou cada relatório, ranking e funil da equipe"],
      ["Lembretes automáticos", "o corretor recebe o aviso 10 minutos antes de cada horário"],
      ["Metas e carteira", "meta mensal por corretor e os clientes de cada um, etapa por etapa"],
    ],
    steps: [
      { title: "Ative a conta", text: "Assine com Pix, boleto ou cartão, ou use um cupom de acesso. Leva um minuto." },
      { title: "Crie a primeira equipe", text: "Na aba Equipe, dê um nome a cada time da empresa." },
      { title: "Chame os corretores", text: "Mande o link de convite no WhatsApp. Cada um cria a própria senha e já entra." },
      { title: "Ative as notificações", text: "Em Conta, ligue os avisos no celular para saber na hora quando um relatório chega." },
    ],
  },
  hr: {
    lead: "A partir de agora, os currículos chegam organizados e com nota, e você acompanha cada candidato do primeiro contato até a contratação. Chega de procurar currículo no meio das conversas.",
    features: [
      ["Atendimento no WhatsApp", "o candidato escolhe a vaga e envia o currículo sozinho, a qualquer hora"],
      ["Nota por inteligência artificial", "cada currículo recebe uma nota de 0 a 100 pelos critérios da vaga"],
      ["Candidatos e entrevistas", "situação de cada candidato, agenda de entrevistas e planilha para relatório"],
    ],
    steps: [
      { title: "Ative a conta", text: "Assine com Pix, boleto ou cartão, ou use um cupom de acesso. Leva um minuto." },
      { title: "Cadastre a primeira vaga", text: "Na aba Vagas, descreva a vaga e o que é importante no candidato. A nota usa esses critérios." },
      { title: "Conecte o WhatsApp", text: "Em Conta, leia o QR Code com o WhatsApp da empresa. Os candidatos passam a ser atendidos sozinhos." },
      { title: "Chame a equipe de RH", text: "Mande o link de convite. Cada recrutador cria a própria senha e já entra." },
    ],
  },
};

export function welcomeSubject(segment: WelcomeSegment) {
  return segment === "hr" ? "Bem-vindo ao Domu Pulse Recrutamento" : "Bem-vindo ao Domu Pulse";
}

export function welcomeEmailHtml(input: WelcomeInput) {
  const name = esc(input.firstName);
  const org = esc(input.orgName);
  const cta = `${input.baseUrl}/ativar`;
  const content = CONTENT[input.segment];
  const moduleLabel = esc(SEGMENT_LABEL[input.segment]);

  const steps = content.steps.map(
    (s, i) => `
      <tr>
        <td valign="top" width="56" style="padding:18px 0;border-top:1px solid #e2e7f0;font-family:${FONT};font-size:22px;font-weight:700;color:#0259f3;letter-spacing:-0.5px">0${i + 1}</td>
        <td valign="top" style="padding:18px 0;border-top:1px solid #e2e7f0;font-family:${FONT}">
          <div style="font-size:16px;font-weight:700;color:#040c30">${s.title}</div>
          <div style="margin-top:4px;font-size:14px;line-height:1.55;color:#5d6983">${s.text}</div>
        </td>
      </tr>`,
  ).join("");

  const features = content.features.map(
    ([title, text]) => `
      <tr>
        <td valign="top" width="22" style="padding:7px 0;font-family:${FONT};font-size:14px;color:#7ea5ff">&#9679;</td>
        <td valign="top" style="padding:7px 0;font-family:${FONT};font-size:14px;line-height:1.5;color:#c7d3ea">
          <strong style="color:#ffffff">${title}:</strong> ${text}
        </td>
      </tr>`,
  ).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>${welcomeSubject(input.segment)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f7">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">A ${org} já está no Pulse. Falta só ativar para a equipe começar.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef1f7" style="background:#eef1f7">
    <tr><td align="center" style="padding:32px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">

        <!-- Topo -->
        <tr><td bgcolor="#02050b" style="background:#02050b;border-radius:14px 14px 0 0;padding:22px 36px">
          <img src="${input.logoUrl}" width="24" height="24" alt="" style="display:inline-block;vertical-align:middle;border:0;outline:none;text-decoration:none">
          <span style="vertical-align:middle;margin-left:10px;font-family:${FONT};font-size:16px;color:#ffffff"><span style="color:#8f9bb5">Domu</span> <strong>Pulse</strong></span>
        </td></tr>

        <!-- Destaque -->
        <tr><td bgcolor="#0a1428" style="background:#0a1428;padding:44px 36px 40px">
          <div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:2.5px;color:#7ea5ff;text-transform:uppercase">&#8212;&nbsp; Bem-vindo ao Pulse</div>
          <h1 style="margin:18px 0 0;font-family:${FONT};font-size:32px;line-height:1.12;font-weight:800;letter-spacing:-0.8px;color:#ffffff">
            Parabéns, ${name}.<br>A <span style="color:#7ea5ff">${org}</span> já está no Pulse.
          </h1>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>
            <td style="border:1px solid #2a3d66;border-radius:999px;padding:6px 14px;font-family:${FONT};font-size:13px;color:#c7d3ea">
              Módulo: <strong style="color:#ffffff">${moduleLabel}</strong>
            </td>
          </tr></table>
          <p style="margin:18px 0 0;font-family:${FONT};font-size:16px;line-height:1.6;color:#c7d3ea">
            ${content.lead}
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px">${features}</table>
        </td></tr>

        <!-- Passos -->
        <tr><td bgcolor="#ffffff" style="background:#ffffff;padding:36px 36px 8px">
          <div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:2.5px;color:#1a3a7c;text-transform:uppercase">&#8212;&nbsp; Seus primeiros passos</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">${steps}</table>
        </td></tr>

        <!-- Botão -->
        <tr><td bgcolor="#ffffff" align="left" style="background:#ffffff;padding:20px 36px 40px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td bgcolor="#0259f3" style="background:#0259f3;border-radius:8px">
              <a href="${cta}" style="display:inline-block;padding:16px 30px;font-family:${FONT};font-size:14px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;text-decoration:none">Ativar minha conta &rarr;</a>
            </td>
          </tr></table>
          <p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:#5d6983">
            Ou copie o endereço no navegador: <a href="${cta}" style="color:#1a3a7c">${cta.replace(/^https?:\/\//, "")}</a>
          </p>
        </td></tr>

        <!-- Ajuda -->
        <tr><td bgcolor="#f4f6fb" style="background:#f4f6fb;border-top:1px solid #e2e7f0;border-radius:0 0 14px 14px;padding:24px 36px">
          <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;color:#2b3a56">
            <strong>Ficou com alguma dúvida?</strong> Chame no
            <a href="${input.whatsappUrl}" style="color:#0259f3;font-weight:700;text-decoration:none">WhatsApp</a>
            ou escreva para <a href="mailto:${input.contactEmail}" style="color:#0259f3;font-weight:700;text-decoration:none">${input.contactEmail}</a>. ${
              input.segment === "hr" ? "A gente ajuda a deixar o recrutamento rodando." : "A gente ajuda a colocar a equipe para rodar."
            }
          </p>
        </td></tr>

        <tr><td align="center" style="padding:22px 12px 0;font-family:${FONT};font-size:12px;line-height:1.7;color:#8f9bb5">
          Domu Pulse, um produto DomuTech<br>
          Você recebeu este e-mail porque criou uma conta no Domu Pulse.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function welcomeEmailText(input: WelcomeInput) {
  const cta = `${input.baseUrl}/ativar`;
  const content = CONTENT[input.segment];
  return [
    `Parabéns, ${input.firstName}. A ${input.orgName} já está no Pulse.`,
    `Módulo: ${SEGMENT_LABEL[input.segment]}`,
    "",
    content.lead,
    "",
    "Seus primeiros passos:",
    ...content.steps.map((s, i) => `0${i + 1}. ${s.title}: ${s.text}`),
    "",
    `Ativar minha conta: ${cta}`,
    "",
    `Dúvidas? WhatsApp: ${input.whatsappUrl}`,
    `E-mail: ${input.contactEmail}`,
    "",
    "Domu Pulse, um produto DomuTech",
  ].join("\n");
}
