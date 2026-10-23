import "server-only";
import { firstName, toWhatsappNumber } from "@/lib/candidate-notify";
import { brandedEmail, escapeHtml, sendEmail } from "@/lib/email";
import { describeError, logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, dateIn, formatTimeIn, todayIn } from "@/lib/time";
import { sendFromPulse } from "@/lib/wa-bot";

// Avisos de entrevista ao candidato: confirmação ao marcar, aviso de mudança,
// lembrete antes do horário e aviso de cancelamento. Vai pelo WhatsApp da
// empresa (se conectado) e por e-mail (se houver).

export type InterviewNotice = "confirm" | "reschedule" | "reminder" | "cancel";

/** Opções de antecedência do lembrete, em minutos. */
export const REMIND_OPTIONS = [60, 120, 1440] as const;

export type InterviewData = {
  id: string;
  orgId: string;
  orgName: string;
  timezone: string;
  at: string;
  location: string | null;
  candidateName: string;
  phone: string | null;
  email: string | null;
  vagaTitle: string;
};

/** Quando o lembrete deve sair. Null se não houver lembrete ou se já passou da hora. */
export function remindAtFor(scheduledAt: string, beforeMin: number | null, now = Date.now()): string | null {
  if (!beforeMin) return null;
  const at = new Date(scheduledAt).getTime() - beforeMin * 60_000;
  return at > now ? new Date(at).toISOString() : null;
}

export async function loadInterview(id: string): Promise<InterviewData | null> {
  const admin = createAdminClient();
  const { data: e } = await admin
    .from("entrevistas")
    .select("id, org_id, candidatura_id, scheduled_at, location")
    .eq("id", id)
    .maybeSingle<{ id: string; org_id: string; candidatura_id: string; scheduled_at: string; location: string | null }>();
  if (!e) return null;

  const [{ data: app }, { data: org }] = await Promise.all([
    admin.from("candidaturas").select("candidato_id, vaga_id").eq("id", e.candidatura_id).maybeSingle<{ candidato_id: string; vaga_id: string }>(),
    admin.from("organizations").select("name, timezone").eq("id", e.org_id).maybeSingle<{ name: string; timezone: string }>(),
  ]);
  if (!app) return null;
  const [{ data: cand }, { data: vaga }] = await Promise.all([
    admin.from("candidatos").select("name, phone, email").eq("id", app.candidato_id).maybeSingle<{ name: string; phone: string | null; email: string | null }>(),
    admin.from("vagas").select("title").eq("id", app.vaga_id).maybeSingle<{ title: string }>(),
  ]);
  if (!cand) return null;

  return {
    id: e.id,
    orgId: e.org_id,
    orgName: org?.name ?? "a empresa",
    timezone: org?.timezone ?? "America/Sao_Paulo",
    at: e.scheduled_at,
    location: e.location,
    candidateName: cand.name,
    phone: cand.phone,
    email: cand.email,
    vagaTitle: vaga?.title ?? "a vaga",
  };
}

function when(d: InterviewData) {
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: d.timezone, weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(d.at));
  return `${day} às ${formatTimeIn(d.at, d.timezone)}`;
}

function relativeDay(d: InterviewData) {
  const date = dateIn(d.at, d.timezone);
  const today = todayIn(d.timezone);
  if (date === today) return "hoje";
  if (date === addDays(today, 1)) return "amanhã";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: d.timezone, weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(d.at));
}

function messageFor(kind: InterviewNotice, d: InterviewData) {
  const nome = firstName(d.candidateName);
  const vaga = `*${d.vagaTitle}*`;
  const local = d.location?.trim() ? `\n📍 ${d.location.trim()}` : "";
  const reply = "\n\nSe não puder comparecer, é só responder esta mensagem.";
  switch (kind) {
    case "confirm":
      return {
        subject: `Entrevista marcada: ${d.vagaTitle}`,
        heading: "Sua entrevista está marcada",
        text: `Olá, ${nome}! Sua entrevista para a vaga de ${vaga} na ${d.orgName} está marcada para *${when(d)}*.${local}${reply}`,
      };
    case "reschedule":
      return {
        subject: `Entrevista remarcada: ${d.vagaTitle}`,
        heading: "Sua entrevista mudou",
        text: `Olá, ${nome}! Sua entrevista para a vaga de ${vaga} na ${d.orgName} mudou. Agora é *${when(d)}*.${local}${reply}`,
      };
    case "reminder":
      return {
        subject: `Lembrete: entrevista ${relativeDay(d)} às ${formatTimeIn(d.at, d.timezone)}`,
        heading: "Lembrete da sua entrevista",
        text: `Olá, ${nome}! Passando para lembrar da sua entrevista para a vaga de ${vaga} na ${d.orgName}, *${relativeDay(d)} às ${formatTimeIn(d.at, d.timezone)}*.${local}\n\nAté lá! 🙂`,
      };
    case "cancel":
      return {
        subject: `Entrevista desmarcada: ${d.vagaTitle}`,
        heading: "Entrevista desmarcada",
        text: `Olá, ${nome}. A entrevista para a vaga de ${vaga} na ${d.orgName}, que estava marcada para ${when(d)}, foi desmarcada. Se houver uma nova data, entramos em contato.`,
      };
  }
}

/**
 * Envia o aviso pelos canais disponíveis. Não lança erro; diz por onde saiu,
 * para a tela contar ao recrutador.
 */
export async function deliverInterviewNotice(kind: InterviewNotice, d: InterviewData) {
  const { subject, heading, text } = messageFor(kind, d);
  const sent = { whatsapp: false, email: false };

  const number = toWhatsappNumber(d.phone);
  if (number) {
    const { data: conn } = await createAdminClient().from("wa_connections").select("status").eq("org_id", d.orgId).maybeSingle();
    if (conn?.status === "connected") {
      // Resposta do candidato (ex.: "não vou conseguir") vai para a equipe, não para o bot.
      await sendFromPulse(d.orgId, number, text, { pauseBot: true })
        .then(() => (sent.whatsapp = true))
        .catch((e) => logger.warn("interview_notify.whatsapp", { message: describeError(e), orgId: d.orgId, entrevistaId: d.id }));
    }
  }

  if (d.email) {
    const plain = text.replace(/\*/g, "");
    const html = brandedEmail({
      eyebrow: d.orgName,
      heading,
      bodyHtml: `<p style="margin:0">${escapeHtml(plain.replace("\n\nSe não puder comparecer, é só responder esta mensagem.", "")).replace(/\n/g, "<br>")}</p>`,
      preheader: subject,
    });
    await sendEmail({ to: d.email, subject, html, text: plain })
      .then(() => (sent.email = true))
      .catch((e) => logger.warn("interview_notify.email", { message: describeError(e), orgId: d.orgId, entrevistaId: d.id }));
  }
  return sent;
}

/** Texto curto para a tela, conforme por onde o aviso saiu. */
export function deliveryLabel(sent: { whatsapp: boolean; email: boolean }) {
  if (sent.whatsapp && sent.email) return "pelo WhatsApp e por e-mail";
  if (sent.whatsapp) return "pelo WhatsApp";
  if (sent.email) return "por e-mail";
  return null;
}

/** Lembretes que já chegaram na hora (chamado pelo cron a cada 5 minutos). */
export async function sendInterviewReminders(): Promise<number> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: due } = await admin
    .from("entrevistas")
    .select("id")
    .is("reminded_at", null)
    .not("remind_at", "is", null)
    .lte("remind_at", now)
    .gt("scheduled_at", now)
    .limit(100);

  let sent = 0;
  for (const { id } of due ?? []) {
    // Reserva antes de enviar: duas execuções do cron não mandam em dobro.
    const { data: claimed } = await admin
      .from("entrevistas")
      .update({ reminded_at: new Date().toISOString() })
      .eq("id", id)
      .is("reminded_at", null)
      .select("id");
    if (!claimed?.length) continue;

    const d = await loadInterview(id).catch(() => null);
    if (!d) continue;
    const r = await deliverInterviewNotice("reminder", d);
    if (r.whatsapp || r.email) sent += 1;
  }
  return sent;
}
