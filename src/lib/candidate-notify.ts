import "server-only";
import { brandedEmail, escapeHtml, sendEmail } from "@/lib/email";
import { describeError, logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendFromPulse } from "@/lib/wa-bot";

// Avisos ao candidato (aprovado / recusado) por WhatsApp e e-mail. Tudo é
// best-effort: se faltar número ou e-mail, manda pelo que houver; se o
// WhatsApp da empresa não estiver conectado, o aviso ainda vai por e-mail.

// Quanto tempo depois da recusa o candidato é avisado. A recusa não sai na
// cara: deixa o processo respirar antes do retorno.
const REJECTION_DELAY_MS = 24 * 60 * 60 * 1000;

/** Quando avisar uma recusa (usado ao gravar o status). */
export function rejectionNotifyAt(from = new Date()): string {
  return new Date(from.getTime() + REJECTION_DELAY_MS).toISOString();
}

type Outcome = "aprovado" | "reprovado";

type NoticeData = {
  candidaturaId: string;
  orgId: string;
  orgName: string;
  candidateName: string;
  phone: string | null;
  email: string | null;
  vagaTitle: string;
  reviewNote: string | null;
};

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name.trim();
}

/** Normaliza o telefone para o formato do WhatsApp (só dígitos, com DDI 55). */
export function toWhatsappNumber(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`; // DDD + número, sem país
  if (digits.length < 12 || digits.length > 13) return null; // fora do padrão br
  return digits;
}

function messageFor(outcome: Outcome, d: NoticeData) {
  const nome = firstName(d.candidateName);
  const retorno = d.reviewNote?.trim() ? `\n\nRetorno da equipe: ${d.reviewNote.trim()}` : "";
  if (outcome === "aprovado") {
    return {
      subject: `Boas notícias sobre a vaga de ${d.vagaTitle}`,
      text:
        `Olá, ${nome}! Temos boas notícias sobre a vaga de ${d.vagaTitle} na ${d.orgName}: ` +
        `você avançou no processo seletivo. Em breve entramos em contato com os próximos passos.${retorno}`,
    };
  }
  return {
    subject: `Sobre a vaga de ${d.vagaTitle}`,
    text:
      `Olá, ${nome}. Obrigado por participar do processo da vaga de ${d.vagaTitle} na ${d.orgName}. ` +
      `Dessa vez seguimos com outros candidatos, mas seu currículo fica no nosso banco de talentos ` +
      `para novas oportunidades. Desejamos muito sucesso!${retorno}`,
  };
}

function emailHtml(outcome: Outcome, d: NoticeData, text: string) {
  const bodyHtml = escapeHtml(text).replace(/\n/g, "<br>");
  return brandedEmail({
    eyebrow: d.orgName,
    heading: outcome === "aprovado" ? "Você avançou no processo" : "Retorno do processo seletivo",
    bodyHtml: `<p style="margin:0">${bodyHtml}</p>`,
    preheader: outcome === "aprovado" ? "Boas notícias sobre a sua candidatura" : "Sobre a sua candidatura",
  });
}

/** Entrega o aviso ao candidato pelos canais disponíveis. Não lança erro. */
async function deliver(outcome: Outcome, d: NoticeData) {
  const { subject, text } = messageFor(outcome, d);

  const number = toWhatsappNumber(d.phone);
  if (number) {
    // Aprovado: a equipe segue a conversa na mão, o bot sai de cena.
    await sendFromPulse(d.orgId, number, text, { pauseBot: outcome === "aprovado" }).catch((e) =>
      logger.warn("candidate_notify.whatsapp", { message: describeError(e), orgId: d.orgId, candidaturaId: d.candidaturaId }),
    );
  }
  if (d.email) {
    await sendEmail({ to: d.email, subject, html: emailHtml(outcome, d, text), text }).catch((e) =>
      logger.warn("candidate_notify.email", { message: describeError(e), orgId: d.orgId, candidaturaId: d.candidaturaId }),
    );
  }
}

/** Busca os dados da candidatura para montar o aviso (consultas explícitas). */
async function loadNotice(candidaturaId: string): Promise<NoticeData | null> {
  const admin = createAdminClient();
  const { data: cand } = await admin
    .from("candidaturas")
    .select("id, org_id, candidato_id, vaga_id, review_note")
    .eq("id", candidaturaId)
    .maybeSingle<{ id: string; org_id: string; candidato_id: string; vaga_id: string; review_note: string | null }>();
  if (!cand) return null;

  const [{ data: candidato }, { data: vaga }, { data: org }] = await Promise.all([
    admin.from("candidatos").select("name, phone, email").eq("id", cand.candidato_id).maybeSingle<{ name: string; phone: string | null; email: string | null }>(),
    admin.from("vagas").select("title").eq("id", cand.vaga_id).maybeSingle<{ title: string }>(),
    admin.from("organizations").select("name").eq("id", cand.org_id).maybeSingle<{ name: string }>(),
  ]);
  if (!candidato) return null;

  return {
    candidaturaId: cand.id,
    orgId: cand.org_id,
    orgName: org?.name ?? "a empresa",
    candidateName: candidato.name,
    phone: candidato.phone,
    email: candidato.email,
    vagaTitle: vaga?.title ?? "a vaga",
    reviewNote: cand.review_note,
  };
}

/** Avisa a aprovação na hora. Chamar em segundo plano (after). */
export async function notifyApproval(candidaturaId: string) {
  const notice = await loadNotice(candidaturaId).catch((e) => {
    logger.error("candidate_notify.load", { message: describeError(e), candidaturaId });
    return null;
  });
  if (notice) await deliver("aprovado", notice);
}

/**
 * Envia as recusas que já passaram da hora (chamado pelo cron). Marca
 * 'notified_at' mesmo se o envio falhar, para não repetir todo dia.
 */
export async function sendPendingRejections(): Promise<number> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: due } = await admin
    .from("candidaturas")
    .select("id")
    .eq("status", "reprovado")
    .is("notified_at", null)
    .not("notify_at", "is", null)
    .lte("notify_at", nowIso)
    .limit(200);

  let sent = 0;
  for (const { id } of due ?? []) {
    const notice = await loadNotice(id).catch(() => null);
    if (notice) {
      await deliver("reprovado", notice);
      sent += 1;
    }
    await admin.from("candidaturas").update({ notified_at: new Date().toISOString() }).eq("id", id);
  }
  return sent;
}
