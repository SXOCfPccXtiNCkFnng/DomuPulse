import "server-only";
import { getMediaBase64, sendText } from "@/lib/evolution";
import { type ChatTurn, chatReply, geminiConfigured, matchVaga, scoreResume } from "@/lib/gemini";
import { describeError, logger } from "@/lib/logger";
import { DEFAULT_CLOSING, DEFAULT_GREETING, fillBotText, RESUME_FILE_TYPES } from "@/lib/recruitment";
import { createAdminClient } from "@/lib/supabase/admin";

// Mensagem recebida no WhatsApp (evento MESSAGES_UPSERT do Evolution).
type Incoming = {
  key?: { remoteJid?: string; remoteJidAlt?: string; senderPn?: string; fromMe?: boolean; id?: string };
  message?: Record<string, unknown> & {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    documentMessage?: { mimetype?: string; fileName?: string; caption?: string };
    documentWithCaptionMessage?: { message?: { documentMessage?: { mimetype?: string; fileName?: string; caption?: string } } };
    imageMessage?: { mimetype?: string; caption?: string };
    audioMessage?: unknown;
  };
  messageType?: string;
  pushName?: string;
};

type Vaga = { id: string; title: string; criteria: string | null };
type Settings = { bot_enabled: boolean; greeting: string | null; instructions: string | null; closing: string | null } | null;
type Conv = {
  id: string;
  stage: string;
  vaga_id: string | null;
  candidato_id: string | null;
  name: string | null;
  updated_at: string;
  history?: ChatTurn[] | null;
};

const vagaPrompt = (vagas: Vaga[]) =>
  vagas.length === 1
    ? `Estamos com a vaga de *${vagas[0].title}*. Me envie seu currículo (PDF) que eu já encaminho. 🙂`
    : `Para qual vaga você quer se candidatar? Responda o número:\n` + vagas.map((v, i) => `${i + 1}. ${v.title}`).join("\n");

const MENU = "Como posso te ajudar? Responda o número:\n\n1. Quero me candidatar a uma vaga\n2. Tenho uma dúvida";
const MENU_AGAIN = "Não entendi. 🙂 Responda *1* para se candidatar a uma vaga ou *2* para falar com a nossa equipe.";
const HANDOFF = "Certo! Já avisei a nossa equipe, que vai te responder por aqui. Pode mandar sua dúvida. 🙂";
const NO_VAGAS = "No momento não temos vagas abertas, mas obrigado pelo interesse! Fique de olho, logo devem surgir novas oportunidades. 🙏";
const NO_AUDIO = "Oi! Por aqui eu não consigo ouvir áudio. 😅 Consegue me escrever?";

const greeting = (name: string | undefined, company: string | null, custom: string | null) =>
  `${fillBotText(custom?.trim() || DEFAULT_GREETING, { name, company })}\n\n${MENU}`;

const welcomeBack = (name: string | null | undefined, sentResume: boolean) => {
  const first = name?.trim().split(/\s+/)[0];
  const hello = `Olá${first ? `, ${first}` : ""}! Que bom falar com você de novo. 🙂`;
  const status = sentResume ? "\n\nSeu currículo já está com a nossa equipe. Se for selecionado(a), a gente te chama por aqui." : "";
  return `${hello}${status}\n\n${MENU}`;
};

/** "A", "A ou B", "A, B ou C". */
const titlesList = (vagas: Vaga[]) => {
  const t = vagas.map((v) => `*${v.title}*`);
  return t.length > 1 ? `${t.slice(0, -1).join(", ")} ou ${t[t.length - 1]}` : (t[0] ?? "");
};

// Depois de encerrar (currículo recebido), quanto tempo o roteiro ignora mensagens soltas.
const DONE_QUIET_MS = 30 * 60 * 1000;
// Conversa parada há mais que isso: recomeça (o roteiro recepciona de novo; a IA esquece o histórico).
const IDLE_RESTART_MS = 12 * 60 * 60 * 1000;
// Quantas mensagens a IA lembra por conversa.
const HISTORY_KEEP = 20;
// Pausa entre os balões de uma mesma resposta, como alguém digitando.
const BALLOON_GAP_MS = 1200;

// Palavras que indicam o que a pessoa quer, para não obrigar a responder só o número.
const APPLY_WORDS = /\b(vaga|curr[ií]culo|cv\b|candidat|emprego|trabalh|oportunidade|contrat)/i;
const QUESTION_WORDS = /\b(d[uú]vida|pergunt|informa[cç]|falar|atendente|algu[eé]m|pessoa|humano)/i;

/** O que a pessoa quer, pela resposta ao menu. */
function intentOf(text: string): "apply" | "question" | null {
  const t = text.trim();
  if (/^1\b/.test(t)) return "apply";
  if (/^2\b/.test(t)) return "question";
  if (APPLY_WORDS.test(t)) return "apply";
  if (QUESTION_WORDS.test(t)) return "question";
  // Frase mais longa sem palavra de candidatura: provavelmente já é a dúvida.
  return t.split(/\s+/).length >= 6 ? "question" : null;
}

/**
 * Número de telefone do contato. Com o endereçamento LID do WhatsApp, o
 * remoteJid vira um id interno (…@lid) e o número real vem em remoteJidAlt
 * (ou senderPn, conforme a versão do Evolution).
 */
function contactNumber(key: NonNullable<Incoming["key"]>): string | null {
  const pn = [key.remoteJid, key.remoteJidAlt, key.senderPn].find((j) => j?.endsWith("@s.whatsapp.net"));
  if (pn) return pn.split("@")[0].split(":")[0];
  // Sem o número: responde pelo próprio LID, que o Evolution também aceita.
  return key.remoteJid?.endsWith("@lid") ? key.remoteJid : null;
}

export async function handleIncoming(orgId: string, incoming: Incoming) {
  const jid = incoming.key?.remoteJid ?? "";
  // Ignora grupos.
  if (jid.endsWith("@g.us") || !jid) return;
  const phone = contactNumber(incoming.key ?? {});
  if (!phone) return;
  const contact: string = phone;

  // Mensagem enviada pelo nosso número: ou é o próprio bot, ou o recrutador
  // respondendo na mão (handoff).
  if (incoming.key?.fromMe) {
    await handleOutgoing(orgId, phone, incoming.key.id ?? null);
    return;
  }

  const m = incoming.message;
  const docMsg = m?.documentMessage ?? m?.documentWithCaptionMessage?.message?.documentMessage;
  const text = (m?.conversation ?? m?.extendedTextMessage?.text ?? docMsg?.caption ?? m?.imageMessage?.caption ?? "").trim();
  const doc = docMsg ?? (m?.imageMessage ? { mimetype: m.imageMessage.mimetype, fileName: null as string | null } : undefined);

  const admin = createAdminClient();
  const turns: ChatTurn[] = [];
  // Envia e registra o id da mensagem do bot, para não confundir com a resposta
  // do recrutador na mão (handoff).
  const say = async (t: string) => {
    turns.push({ role: "bot", text: t });
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
  const existing = convRaw as Conv | null;

  // Handoff: se o recrutador assumiu a conversa, o bot fica calado.
  if (existing?.stage === "human") return;

  // Sem texto nem arquivo: áudio pede para escrever; figurinha, reação etc. ignora.
  if (!text && !doc) {
    if (m?.audioMessage) await say(NO_AUDIO);
    return;
  }

  // Vagas abertas da empresa.
  const { data: vagasRaw } = await admin
    .from("vagas")
    .select("id, title, criteria")
    .eq("org_id", orgId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const vagas = (vagasRaw ?? []) as Vaga[];

  const idle = existing ? Date.now() - new Date(existing.updated_at).getTime() : 0;
  const past = existing && idle < IDLE_RESTART_MS && Array.isArray(existing.history) ? existing.history : [];

  let conv = existing;
  if (!conv) {
    const { data, error } = await admin
      .from("wa_conversations")
      .insert({ org_id: orgId, phone, name: incoming.pushName ?? null, stage: "awaiting_intent" })
      .select("*")
      .single();
    conv = data as Conv | null;
    if (!conv) {
      // 23514: a etapa 'awaiting_intent' exige a migração 20261101000000_wa_intent.sql.
      logger.error("wa.conversation", { message: error ? `${error.code}: ${error.message}` : "conversa não criada", orgId });
      return;
    }
  }
  const convId = conv.id;
  turns.push({ role: "user", text: doc ? `[mandou um arquivo]${text ? ` ${text}` : ""}` : text });

  try {
    // Conversa natural com a IA. Arquivo (currículo) segue o fluxo fixo abaixo.
    if (!doc && geminiConfigured()) {
      const ok = await converse(conv, past).then(
        () => true,
        (e) => {
          logger.warn("wa.chat", { message: describeError(e), orgId });
          return false;
        },
      );
      if (ok) return;
    }
    await scripted(conv);
  } finally {
    await admin.from("wa_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
    // Sem a coluna history (migração 20261102000000_wa_history.sql), só não guarda.
    await admin.from("wa_conversations").update({ history: [...past, ...turns].slice(-HISTORY_KEEP) }).eq("id", convId);
  }

  async function converse(c: Conv, history: ChatTurn[]) {
    const decision = await chatReply({
      company,
      contactName: incoming.pushName ?? c.name,
      greeting: fillBotText(settings?.greeting?.trim() || DEFAULT_GREETING, { name: incoming.pushName ?? c.name, company }),
      instructions: settings?.instructions ?? null,
      vagas,
      chosenVagaId: c.vaga_id,
      resumeSent: Boolean(c.candidato_id),
      history,
      message: text,
    });
    for (const [i, part] of decision.messages.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, BALLOON_GAP_MS));
      await say(part);
    }
    const now = new Date().toISOString();
    if (decision.action === "choose_vaga") {
      await admin.from("wa_conversations").update({ vaga_id: decision.vagaId, stage: "awaiting_resume", updated_at: now }).eq("id", c.id);
    } else if (decision.action === "handoff") {
      await admin.from("wa_conversations").update({ stage: "human", updated_at: now }).eq("id", c.id);
      logger.info("wa.handoff", { message: "Atendimento passou a conversa para a equipe", orgId });
    }
  }

  // Roteiro fixo: currículos e, sem IA (ou se ela falhar), o menu numerado.
  async function scripted(c: Conv) {
    // Quem volta depois de um tempo é recepcionado de novo. Logo depois de
    // encerrar, fica calado (é o "obrigado" do candidato).
    if (existing && !doc && idle > (c.stage === "done" ? DONE_QUIET_MS : IDLE_RESTART_MS)) {
      await admin.from("wa_conversations").update({ stage: "awaiting_intent", vaga_id: null, updated_at: new Date().toISOString() }).eq("id", c.id);
      await say(welcomeBack(incoming.pushName ?? c.name, Boolean(c.candidato_id)));
      return;
    }

    // Primeiro contato: recepciona e pergunta o que a pessoa quer. Quem já chega
    // mandando o currículo pula a pergunta.
    if (!existing && !doc) {
      await say(greeting(incoming.pushName, company, settings?.greeting ?? null));
      return;
    }

    // Esperando a pessoa dizer se quer se candidatar ou tirar uma dúvida.
    if (c.stage === "awaiting_intent") {
      const intent = doc ? "apply" : intentOf(text);
      if (intent === "question") {
        await say(HANDOFF);
        await admin.from("wa_conversations").update({ stage: "human", updated_at: new Date().toISOString() }).eq("id", c.id);
        logger.info("wa.handoff", { message: "Contato pediu para falar com a equipe", orgId });
        return;
      }
      if (intent !== "apply") {
        await say(MENU_AGAIN);
        return;
      }
      if (vagas.length === 0) {
        await say(NO_VAGAS);
        await admin.from("wa_conversations").update({ stage: "done", updated_at: new Date().toISOString() }).eq("id", c.id);
        return;
      }
      const only = vagas.length === 1 ? vagas[0].id : null;
      await admin
        .from("wa_conversations")
        .update({ vaga_id: only, stage: only ? "awaiting_resume" : "awaiting_vaga", updated_at: new Date().toISOString() })
        .eq("id", c.id);
      c = { ...c, vaga_id: only, stage: only ? "awaiting_resume" : "awaiting_vaga" };
      if (!doc) {
        await say(vagaPrompt(vagas));
        return;
      }
    }

    if (c.stage === "done") {
      if (!doc) return; // encerrado; só reage a um currículo novo
    }
    if (vagas.length === 0) {
      await say(NO_VAGAS);
      await admin.from("wa_conversations").update({ stage: "done", updated_at: new Date().toISOString() }).eq("id", c.id);
      return;
    }

    // Descobre a vaga, se ainda não tem.
    let vagaId = c.vaga_id;
    if (!vagaId && text) {
      const n = Number(text.replace(/\D/g, ""));
      if (n >= 1 && n <= vagas.length) vagaId = vagas[n - 1].id;
      else if (geminiConfigured()) vagaId = await matchVaga(text, vagas).catch(() => null);
      if (vagaId) await admin.from("wa_conversations").update({ vaga_id: vagaId, stage: "awaiting_resume", updated_at: new Date().toISOString() }).eq("id", c.id);
    }

    // Chegou um currículo.
    if (doc) {
      if (!vagaId) {
        await say(`Recebi seu arquivo, obrigado! 🙂 Só me diz: é para qual vaga? Temos ${titlesList(vagas)}. Depois me manda o currículo de novo, por favor.`);
        return;
      }
      await processResume(orgId, c.id, contact, vagaId, c.name, company, incoming, doc, vagas, settings, say);
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
}

type Admin = ReturnType<typeof createAdminClient>;

// Quantos ids de mensagens do bot guardar por conversa (só os recentes importam).
const BOT_MSG_KEEP = 50;
// O eco da mensagem do bot pode chegar no webhook antes de o id ser gravado.
const ECHO_GRACE_MS = 4000;

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
  return conv.vaga_id ? "awaiting_resume" : "awaiting_intent";
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
