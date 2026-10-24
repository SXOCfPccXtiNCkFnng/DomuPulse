import "server-only";
import { geminiEnv } from "@/lib/env.server";

// Cliente do Google Gemini (IA do recrutamento), via REST. Barato e lê PDF.

export function geminiConfigured() {
  try {
    geminiEnv();
    return true;
  } catch {
    return false;
  }
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

async function generate(parts: Part[], opts: { schema?: object; system?: string; temperature?: number } = {}) {
  const { apiKey, model } = geminiEnv();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      generationConfig: opts.schema
        ? { responseMimeType: "application/json", responseSchema: opts.schema, temperature: opts.temperature ?? 0.2 }
        : { temperature: opts.temperature ?? 0.4 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export type ResumeData = {
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  summary: string | null;
  score: number;
  reason: string;
};

const RESUME_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    city: { type: "string" },
    summary: { type: "string" },
    score: { type: "integer" },
    reason: { type: "string" },
  },
  required: ["score", "reason"],
};

/** Lê o currículo (PDF/imagem) e pontua de 0 a 100 contra os critérios da vaga. */
export async function scoreResume(input: {
  base64: string;
  mimeType: string;
  vagaTitle: string;
  criteria: string | null;
  instructions?: string | null;
}): Promise<ResumeData> {
  const system =
    "Você é um analista de RH. Leia o currículo e avalie a aderência à vaga. " +
    "Extraia nome, e-mail, telefone e cidade quando houver. Dê uma nota de 0 a 100 (quanto maior, mais aderente) " +
    "e explique em uma ou duas frases, em português, de forma objetiva e sem viés por idade, gênero ou origem. " +
    "Baseie a nota só em experiência e requisitos. Responda apenas no formato pedido." +
    (input.instructions ? `\n\nContexto da empresa (considere ao avaliar): ${input.instructions}` : "");
  const prompt =
    `Vaga: ${input.vagaTitle}\n` +
    `Critérios da vaga: ${input.criteria || "não informados (avalie a adequação geral ao cargo)"}\n\n` +
    "Avalie o currículo em anexo.";
  const text = await generate([{ text: prompt }, { inlineData: { mimeType: input.mimeType, data: input.base64 } }], {
    system,
    schema: RESUME_SCHEMA,
  });
  const raw = JSON.parse(text) as Partial<ResumeData>;
  const clean = (v: unknown) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : null);
  return {
    name: clean(raw.name),
    email: clean(raw.email),
    phone: clean(raw.phone),
    city: clean(raw.city),
    summary: clean(raw.summary),
    score: Math.max(0, Math.min(100, Math.round(Number(raw.score ?? 0)))),
    reason: (clean(raw.reason) ?? "Avaliação indisponível.").slice(0, 2000),
  };
}

export type ChatTurn = { role: "user" | "bot"; text: string };

export type ChatDecision = {
  reply: string;
  /** choose_vaga: a pessoa disse a vaga. handoff: precisa de alguém da equipe. */
  action: "none" | "choose_vaga" | "handoff";
  vagaId: string | null;
};

const CHAT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    action: { type: "string", enum: ["none", "choose_vaga", "handoff"] },
    vagaId: { type: "string" },
  },
  required: ["reply", "action"],
};

/**
 * Atendimento do RH no WhatsApp: responde como uma pessoa da equipe e diz o
 * que fazer (vaga escolhida, passar para a equipe). Só sabe o que recebe aqui.
 */
export async function chatReply(input: {
  company: string | null;
  contactName: string | null;
  greeting: string | null;
  instructions: string | null;
  vagas: { id: string; title: string; criteria: string | null }[];
  chosenVagaId: string | null;
  resumeSent: boolean;
  history: ChatTurn[];
  message: string;
}): Promise<ChatDecision> {
  const company = input.company?.trim() || "a empresa";
  const vagas = input.vagas.length
    ? input.vagas.map((v) => `- ${v.title} [${v.id}]${v.criteria ? `: ${v.criteria.slice(0, 400)}` : ""}`).join("\n")
    : "Nenhuma vaga aberta no momento.";
  const chosen = input.vagas.find((v) => v.id === input.chosenVagaId)?.title;
  const system =
    `Você é a pessoa do recrutamento (RH) da ${company}, atendendo pelo WhatsApp. ` +
    "Converse como uma pessoa de verdade: português do Brasil, simpática, natural e direta. " +
    "Mensagens curtas (no máximo 3 frases), no máximo um emoji, sem listas numeradas e sem pedir para responder com número. " +
    "Nunca diga que é um robô ou uma IA, a menos que perguntem diretamente; se perguntarem, diga que é o atendimento automático do RH.\n\n" +
    "Seu objetivo: entender o que a pessoa quer e ajudar a se candidatar. Para se candidatar, ela precisa dizer a vaga e mandar o currículo " +
    "(PDF ou foto) aqui na conversa. Quando ela indicar a vaga, use action=choose_vaga com o id exato da vaga. " +
    "Se houver só uma vaga aberta e ela quiser se candidatar, é essa vaga. " +
    "Se ela perguntar algo que você não sabe pelas informações abaixo (salário, benefícios, horário, andamento do processo etc.), " +
    "ou pedir para falar com alguém, use action=handoff e diga que alguém da equipe vai responder por aqui. " +
    "Nunca invente vagas, salários, benefícios, prazos ou resultados. Se não houver vagas abertas, diga com gentileza.\n\n" +
    `Vagas abertas:\n${vagas}\n\n` +
    (input.instructions ? `Sobre a empresa e o processo:\n${input.instructions}\n\n` : "") +
    (input.greeting ? `Modelo de saudação da empresa (use como base no primeiro contato): ${input.greeting}\n\n` : "") +
    `Nome da pessoa no WhatsApp: ${input.contactName || "desconhecido"}.\n` +
    (chosen ? `Ela já escolheu a vaga: ${chosen}.\n` : "") +
    (input.resumeSent ? "Ela já mandou o currículo, que está com a equipe para avaliação.\n" : "");
  const history = input.history.map((t) => `${t.role === "user" ? "Pessoa" : "Você"}: ${t.text}`).join("\n");
  const prompt =
    (history ? `Conversa até agora:\n${history}\n\n` : "Primeira mensagem da pessoa (ainda não houve conversa).\n\n") +
    `Nova mensagem da pessoa: ${input.message}\n\nResponda a ela.`;
  const out = JSON.parse(await generate([{ text: prompt }], { system, schema: CHAT_SCHEMA, temperature: 0.7 })) as Partial<ChatDecision>;
  const reply = typeof out.reply === "string" ? out.reply.trim() : "";
  if (!reply) throw new Error("Gemini sem resposta");
  const vagaId = input.vagas.some((v) => v.id === out.vagaId) ? (out.vagaId as string) : null;
  const action = out.action === "handoff" ? "handoff" : out.action === "choose_vaga" && vagaId ? "choose_vaga" : "none";
  return { reply: reply.slice(0, 1000), action, vagaId };
}

/** Descobre a qual vaga o texto do candidato se refere. Devolve o id ou null. */
export async function matchVaga(text: string, vagas: { id: string; title: string }[]): Promise<string | null> {
  if (vagas.length === 0) return null;
  const list = vagas.map((v, i) => `${i + 1}. ${v.title} [${v.id}]`).join("\n");
  const schema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
  const out = await generate(
    [
      {
        text:
          `Vagas abertas:\n${list}\n\n` +
          `A pessoa escreveu: "${text}".\n` +
          'Qual vaga ela quer? Responda com o id exato entre colchetes, ou "" se não der para saber.',
      },
    ],
    { schema },
  );
  try {
    const id = (JSON.parse(out) as { id?: string }).id;
    return vagas.some((v) => v.id === id) ? (id as string) : null;
  } catch {
    return null;
  }
}
