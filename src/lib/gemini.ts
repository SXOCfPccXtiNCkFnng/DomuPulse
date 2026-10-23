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

async function generate(parts: Part[], opts: { schema?: object; system?: string } = {}) {
  const { apiKey, model } = geminiEnv();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      generationConfig: opts.schema
        ? { responseMimeType: "application/json", responseSchema: opts.schema, temperature: 0.2 }
        : { temperature: 0.4 },
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
