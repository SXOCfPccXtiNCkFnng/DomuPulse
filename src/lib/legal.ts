// Versão vigente dos Termos e da Política. Troque a data ao alterar o texto:
// é ela que fica registrada no aceite de cada pessoa.
export const LEGAL_DOCS_VERSION = "2026-10-13";

export const CONTACT_EMAIL = "contato@domutech.digital";
export const CONTACT_WHATSAPP_NUMBER = "5511921474360";
export const CONTACT_WHATSAPP_DISPLAY = "+55 11 92147 4360";

export function contactWhatsappUrl(text?: string) {
  return `https://wa.me/${CONTACT_WHATSAPP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
