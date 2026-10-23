// Versão vigente dos Termos e da Política. Troque a data ao alterar o texto:
// é ela que fica registrada no aceite de cada pessoa, e quem aceitou uma
// versão anterior é levado a aceitar a nova antes de continuar.
export const LEGAL_DOCS_VERSION = "2026-10-23";

export const CONTACT_EMAIL = "contato@domutech.digital";
export const CONTACT_WHATSAPP_NUMBER = "5511921474360";
export const CONTACT_WHATSAPP_DISPLAY = "+55 11 92147 4360";

/**
 * Identificação da empresa nos Termos e na Política. Preencha antes de vender:
 * documentos com razão social, CNPJ e endereço têm muito mais força. Campos
 * vazios simplesmente não aparecem no texto.
 */
export const COMPANY = {
  /** Nome comercial, como aparece para os clientes. */
  name: "DomuTech",
  /** Razão social do CNPJ, por exemplo "DomuTech Tecnologia Ltda.". */
  legalName: "DomuTech",
  /** CNPJ no formato 00.000.000/0001-00. */
  cnpj: "63.032.580/0001-19",
  /** Endereço da sede: rua, número, bairro, cidade, UF e CEP. */
  address: "São Roque - SP",
  /** Cidade e UF do foro escolhido para disputas, por exemplo "São Paulo/SP". */
  forumCity: "",
  /** Nome do encarregado de dados (LGPD, art. 41). Vazio usa o e-mail de contato. */
  dpoName: "",
};

/** "DomuTech Tecnologia Ltda., inscrita no CNPJ sob o nº ..., com sede em ..." com o que estiver preenchido. */
export function companyIdentification() {
  const parts = [COMPANY.legalName || COMPANY.name];
  if (COMPANY.cnpj) parts.push(`inscrita no CNPJ sob o nº ${COMPANY.cnpj}`);
  if (COMPANY.address) parts.push(`com sede em ${COMPANY.address}`);
  return parts.join(", ");
}

export function contactWhatsappUrl(text?: string) {
  return `https://wa.me/${CONTACT_WHATSAPP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
