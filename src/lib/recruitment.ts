import "server-only";
import { getCurrentMember, orgCanWrite, type CurrentMember } from "@/lib/auth";

/**
 * Só contas de RH, com assinatura ativa, gerenciam recrutamento. Todo mundo da
 * conta de RH é recrutador e pode gerenciar (não há "corretor" aqui).
 */
export async function requireHr(): Promise<CurrentMember | { error: string }> {
  const me = await getCurrentMember();
  if (me.org.segment !== "hr") return { error: "Disponível só para contas de recrutamento." };
  if (!orgCanWrite(me.org)) return { error: "A assinatura está inativa. Fale com o administrador." };
  return me;
}

export const CANDIDATURA_STATUS = ["novo", "triagem", "entrevista", "aprovado", "reprovado", "contratado"] as const;
export type CandidaturaStatus = (typeof CANDIDATURA_STATUS)[number];

export const STATUS_LABEL: Record<CandidaturaStatus, { label: string; tone: "neutral" | "brand" | "warn" | "danger" }> = {
  novo: { label: "Novo", tone: "neutral" },
  triagem: { label: "Em triagem", tone: "neutral" },
  entrevista: { label: "Entrevista", tone: "warn" },
  aprovado: { label: "Aprovado", tone: "brand" },
  reprovado: { label: "Recusado", tone: "danger" },
  contratado: { label: "Contratado", tone: "brand" },
};

// Mensagens padrão do atendimento no WhatsApp. {nome} e {empresa} são trocados
// pelo primeiro nome do candidato e pelo nome da empresa.
export const DEFAULT_GREETING = "Olá, {nome}! 👋 Aqui é o recrutamento da {empresa}.";
export const DEFAULT_CLOSING = "Recebi seu currículo, obrigado! ✅ Nossa equipe vai avaliar e te retorna. Boa sorte! 🍀";

/** Troca {nome} e {empresa}. Sem nome, some junto com a vírgula: "Olá, {nome}!" vira "Olá!". */
export function fillBotText(text: string, vars: { name?: string | null; company?: string | null }) {
  const first = vars.name?.trim().split(/\s+/)[0] ?? "";
  return text
    .replace(/,?\s*\{nome\}/gi, (m) => (first ? m.replace(/\{nome\}/i, first) : ""))
    .replace(/\{empresa\}/gi, vars.company?.trim() || "empresa");
}

// Checklist de admissão usado enquanto a empresa não monta o dela.
export const DEFAULT_DOC_CHECKLIST = [
  "RG ou CNH",
  "CPF",
  "Carteira de trabalho (pode ser a digital)",
  "Número do PIS",
  "Comprovante de residência recente",
  "Título de eleitor",
  "Comprovante de escolaridade",
  "Certidão de nascimento ou casamento",
  "Foto 3x4",
  "Dados bancários (banco, agência e conta)",
];
export const DOC_CHECKLIST_MAX = 30;
export const DOC_ITEM_MAX = 120;

// Tipos de arquivo aceitos para o currículo.
export const RESUME_FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg",
  "image/png": "png",
};
export const RESUME_MAX_BYTES = 10 * 1024 * 1024;
