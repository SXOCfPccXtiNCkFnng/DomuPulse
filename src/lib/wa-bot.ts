import "server-only";
import { getMediaBase64, sendText } from "@/lib/evolution";
import { geminiConfigured, matchVaga, scoreResume } from "@/lib/gemini";
import { describeError, logger } from "@/lib/logger";
import { DEFAULT_CLOSING, DEFAULT_GREETING, fillBotText, RESUME_FILE_TYPES } from "@/lib/recruitment";
import { createAdminClient } from "@/lib/supabase/admin";

// Mensagem recebida no WhatsApp (evento MESSAGES_UPSERT do Evolution).
type Incoming = {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  message?: Record<string, unknown> & {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    documentMessage?: { mimetype?: string; fileName?: string };
    documentWithCaptionMessage?: { message?: { documentMessage?: { mimetype?: string; fileName?: string } } };
    imageMessage?: { mimetype?: string };
  };
  messageType?: string;
  pushName?: string;
};

type Vaga = { id: string; title: string; criteria: string | null };
type Settings = { bot_enabled: boolean; greeting: string | null; instructions: string | null; closing: string | null } | null;

const vagaPrompt = (vagas: Vaga[]) =>
  vagas.length === 1
    ? `Estamos com a vaga de *${vagas[0].title}*. Me envie seu currículo (PDF) que eu já encaminho. 🙂`
    : `Para qual vaga você quer se candidatar? Responda o número:\n` + vagas.map((v, i) => `${i + 1}. ${v.title}`).join("\n");

const greeting = (vagas: Vaga[], name: string | undefined, company: string | null, custom: string | null) => {
  const intro = fillBotText(custom?.trim() || DEFAULT_GREETING, { name, company });
  return `${intro}\n\n${vagaPrompt(vagas)}`;
};

/** Processa uma mensagem recebida: recepciona, pega a vaga, recebe e pontua o currículo. */
export async function handleIncoming(orgId: string, incoming: Incoming) {
  const jid = incoming.key?.remoteJid ?? "";
  // Ignora grupos.
  if (jid.endsWith("@g.us") || !jid) return;
  const phone = jid.split("@")[0].split(":")[0];

  // Mensagem enviada pelo nosso número: ou é o próprio bot, ou o recrutador
  // respondendo na mão (handoff).
  if (incoming.key?.fromMe) {
    await handleOutgoing(orgId, phone, incoming.key.id ?? null);
    return;
  }

  const text = (incoming.message?.conversation ?? incoming.message?.extendedTextMessage?.text ?? "").trim();
  const doc =
    incoming.message?.documentMessage ??
    incoming.message?.documentWithCaptionMessage?.message?.documentMessage ??
    (incoming.message?.imageMessage ? { mimetype: incoming.message.imageMessage.mimetype, fileName: null as string | null } : undefined);

  const admin = createAdminClient();
  // Envia e registra o id da mensagem do bot, para não confundir com a resposta
  // do recrutador na mão (handoff).
  const say = async (t: string) => {
    const res = await sendText(orgId, phone, t).catch((e) => {
      logger.warn("wa.reply", { message: describeError(e), orgId });
      return null;
    });
    if (res?.id) await markBotMsg(admin, orgId, phone, res.id).catch(() => {});
  };

  // Configuração do atendimento. Se o automático está desligado, não responde.
  const [{ data: settings }, { data: org }] = await Promise.all([
    admin.from("rh_settings").select("bot_enabled, greeting, instructions, closing").eq("org_id", orgId).maybeSingle<Settings>(),
    admin.from("organizations").select("name").eq("id", orgId).maybeSingle<{ name: string }>(),
  ]);
  if (settings?.bot_enabled === false) return;
  const company = org?.name ?? null;

  // Conversa (memória por número).
  const { data: convRaw } = await admin.from("wa_conversations").select("*").eq("org_id", orgId).eq("phone", phone).maybeSingle();
  let conv = convRaw as { id: string; stage: string; vaga_id: string | null; candidato_id: string | null; name: string | null } | null;

  // Handoff: se o recrutador assumiu a conversa, o bot fica calado.
  if (conv?.stage === "human") return;

  // Vagas abertas da empresa.
  const { data: vagasRaw } = await admin
    .from("vagas")
    .select("id, title, criteria")
    .eq("org_id", orgId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const vagas = (vagasRaw ?? []) as Vaga[];
  if (vagas.length === 0) {
    await ensureConversation(admin, orgId, phone, incoming.pushName ?? null);
    await say("Obrigado pelo contato! No momento não temos vagas abertas, mas vou guardar seu interesse. 🙏");
    return;
  }

  if (!conv) {
    const vagaId = vagas.length === 1 ? vagas[0].id : null;
    const { data } = await admin
      .from("wa_conversations")
      .insert({ org_id: orgId, phone, name: incoming.pushName ?? null, vaga_id: vagaId, stage: vagaId ? "awaiting_resume" : "awaiting_vaga" })
      .select("id, stage, vaga_id, candidato_id, name")
      .single();
    conv = data as typeof conv;
    await say(greeting(vagas, incoming.pushName, company, settings?.greeting ?? null));
    return;
  }
  if (conv.stage === "done") {
    if (!doc) return; // encerrado; só reage a um currículo novo
  }

  // Descobre a vaga, se ainda não tem.
  let vagaId = conv.vaga_id;
  if (!vagaId && text) {
    const n = Number(text.replace(/\D/g, ""));
    if (n >= 1 && n <= vagas.length) vagaId = vagas[n - 1].id;
    else if (geminiConfigured()) vagaId = await matchVaga(text, vagas).catch(() => null);
    if (vagaId) await admin.from("wa_conversations").update({ vaga_id: vagaId, stage: "awaiting_resume", updated_at: new Date().toISOString() }).eq("id", conv.id);
  }

  // Chegou um currículo.
  if (doc) {
    if (!vagaId) {
      await say("Antes, me diga a vaga:\n" + vagas.map((v, i) => `${i + 1}. ${v.title}`).join("\n"));
      return;
    }
    await processResume(orgId, conv.id, phone, vagaId, conv.name, company, incoming, doc, vagas, settings, say);
    return;
  }

  // Sem currículo: guia a pessoa.
  if (!vagaId) {
    await say("Não achei essa vaga. Responda o número:\n" + vagas.map((v, i) => `${i + 1}. ${v.title}`).join("\n"));
  } else {
    const title = vagas.find((v) => v.id === vagaId)?.title;
    await say(`Perfeito${title ? ` — vaga de *${title}*` : ""}! Agora me envie o seu *currículo em PDF*. 📄`);
  }
}

type Admin = ReturnType<typeof createAdminClient>;

// Quantos ids de mensagens do bot guardar por conversa (só os recentes importam).
const BOT_MSG_KEEP = 50;
// O eco da mensagem do bot pode chegar no webhook antes de o id ser gravado.
const ECHO_GRACE_MS = 4000;

/** Garante que a conversa existe (sem mexer numa que já existe). */
async function ensureConversation(admin: Admin, orgId: string, phone: string, name: string | null) {
  await admin.from("wa_conversations").upsert({ org_id: orgId, phone, name }, { onConflict: "org_id,phone", ignoreDuplicates: true });
}

/** Registra o id de uma mensagem enviada pelo bot. */
async function markBotMsg(admin: Admin, orgId: string, phone: string, msgId: string) {
  const { data } = await admin.from("wa_conversations").select("id, bot_msg_ids").eq("org_id", orgId).eq("phone", phone).maybeSingle();
  if (!data) return;
  const ids = [...((data.bot_msg_ids as string[] | null) ?? []), msgId].slice(-BOT_MSG_KEEP);
  await admin.from("wa_conversations").update({ bot_msg_ids: ids }).eq("id", data.id);
}

async function isBotMsg(admin: Admin, orgId: string, phone: string, msgId: string) {
  const { data } = await admin.from("wa_conversations").select("bot_msg_ids").eq("org_id", orgId).eq("phone", phone).maybeSingle();
  return ((data?.bot_msg_ids as string[] | null) ?? []).includes(msgId);
}

/** Mensagem 'fromMe': se não foi o bot, o recrutador assumiu a conversa. */
async function handleOutgoing(orgId: string, phone: string, msgId: string | null) {
  if (!msgId) return;
  const admin = createAdminClient();
  if (await isBotMsg(admin, orgId, phone, msgId)) return;
  await new Promise((r) => setTimeout(r, ECHO_GRACE_MS));
  if (await isBotMsg(admin, orgId, phone, msgId)) return;
  await admin
    .from("wa_conversations")
    .upsert({ org_id: orgId, phone, stage: "human", updated_at: new Date().toISOString() }, { onConflict: "org_id,phone" });
  logger.info("wa.handoff", { message: "Recrutador assumiu a conversa", orgId });
}

/**
 * Mensagem que o Pulse envia por conta própria (aviso de aprovação, recusa,
 * checklist). O id fica registrado como do bot, para o eco não parecer o
 * recrutador assumindo. Com pauseBot, o atendimento automático para nessa
 * conversa (ex.: o candidato vai mandar documentos, que o bot leria como currículo).
 */
export async function sendFromPulse(orgId: string, phone: string, text: string, { pauseBot = false } = {}) {
  const admin = createAdminClient();
  await admin.from("wa_conversations").upsert({ org_id: orgId, phone, stage: "done" }, { onConflict: "org_id,phone", ignoreDuplicates: true });
  const res = await sendText(orgId, phone, text);
  if (res.id) await markBotMsg(admin, orgId, phone, res.id).catch(() => {});
  if (pauseBot) {
    await admin.from("wa_conversations").update({ stage: "human", updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("phone", phone);
  }
}

/** Em que ponto o bot retoma uma conversa que estava com o recrutador. */
export function resumeStage(conv: { candidato_id: string | null; vaga_id: string | null }) {
  if (conv.candidato_id) return "done";
  return conv.vaga_id ? "awaiting_resume" : "awaiting_vaga";
}

async function processResume(
  orgId: string,
  convId: string,
  phone: string,
  vagaId: string,
  pushName: string | null,
  company: string | null,
  incoming: Incoming,
  doc: { mimetype?: string; fileName?: string | null },
  vagas: Vaga[],
  settings: Settings,
  say: (t: string) => Promise<void>,
) {
  const admin = createAdminClient();
  const media = await getMediaBase64(orgId, incoming).catch((e) => {
    logger.error("wa.media", { message: describeError(e), orgId });
    return null;
  });
  if (!media) {
    await say("Não consegui abrir o arquivo. Pode mandar de novo em PDF? 🙏");
    return;
  }
  const mime = media.mimeType || doc.mimetype || "application/pdf";
  const ext = RESUME_FILE_TYPES[mime] ?? "pdf";
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(media.base64, "base64");
  await admin.storage.from("resumes").upload(path, buffer, { contentType: mime, upsert: true });

  // IA lê e pontua (se configurada).
  const vaga = vagas.find((v) => v.id === vagaId);
  let data: Awaited<ReturnType<typeof scoreResume>> | null = null;
  if (geminiConfigured()) {
    data = await scoreResume({ base64: media.base64, mimeType: mime, vagaTitle: vaga?.title ?? "", criteria: vaga?.criteria ?? null, instructions: settings?.instructions ?? null }).catch((e) => {
      logger.error("wa.score", { message: describeError(e), orgId });
      return null;
    });
  }

  const { data: candidato } = await admin
    .from("candidatos")
    .insert({
      org_id: orgId,
      name: data?.name ?? pushName ?? "Candidato",
      phone,
      email: data?.email ?? null,
      city: data?.city ?? null,
      resume_path: path,
      resume_name: media.fileName ?? doc.fileName ?? `curriculo.${ext}`,
      resume_data: data ? { summary: data.summary } : null,
      source: "whatsapp",
    })
    .select("id")
    .single();

  if (candidato) {
    await admin.from("candidaturas").insert({
      org_id: orgId,
      candidato_id: candidato.id,
      vaga_id: vagaId,
      status: "novo",
      score: data?.score ?? null,
      score_reason: data?.reason ?? null,
    });
  }

  await admin.from("wa_conversations").update({ stage: "done", candidato_id: candidato?.id ?? null, updated_at: new Date().toISOString() }).eq("id", convId);
  await say(fillBotText(settings?.closing?.trim() || DEFAULT_CLOSING, { name: data?.name ?? pushName, company }));
}
