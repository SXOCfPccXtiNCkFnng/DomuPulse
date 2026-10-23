"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { firstName, notifyApproval, rejectionNotifyAt, toWhatsappNumber } from "@/lib/candidate-notify";
import { describeError, logger } from "@/lib/logger";
import { CANDIDATURA_STATUS, DOC_CHECKLIST_MAX, DOC_ITEM_MAX, RESUME_FILE_TYPES, RESUME_MAX_BYTES, requireHr } from "@/lib/recruitment";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation";
import { sendFromPulse } from "@/lib/wa-bot";

const BUCKET = "resumes";

/** Passo 1 do envio do currículo: devolve um link de upload de uso único. */
export async function prepareResumeUpload(file: { name: string; size: number; type: string }) {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  const ext = RESUME_FILE_TYPES[file.type];
  if (!ext) return { error: "Envie o currículo em PDF, Word, JPG ou PNG." };
  if (!(file.size > 0 && file.size <= RESUME_MAX_BYTES)) return { error: "O arquivo precisa ter até 10 MB." };

  const path = `${gate.org.id}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    logger.error("resume.upload_url", { message: describeError(error), orgId: gate.org.id });
    return { error: "Não foi possível preparar o envio. Tente de novo." };
  }
  return { path: data.path, token: data.token };
}

const candidateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(120),
  phone: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(20).optional()),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.email("E-mail inválido.").max(254).optional()),
  city: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(120).optional()),
  vagaId: z.uuid("Escolha a vaga."),
  resumePath: z.string().max(300).optional(),
  resumeName: z.string().trim().max(200).optional(),
});

/** Cadastra um candidato manualmente e já o liga a uma vaga. */
export async function addCandidate(_: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  const parsed = candidateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  // A vaga precisa ser desta organização (o RLS já garante, conferimos a existência).
  const { data: vaga } = await supabase.from("vagas").select("id").eq("id", v.vagaId).maybeSingle();
  if (!vaga) return { fieldErrors: { vagaId: "Vaga inválida." } };

  if (v.resumePath && !v.resumePath.startsWith(`${gate.org.id}/`)) return { error: "Arquivo inválido. Anexe de novo." };

  const { data: candidato, error } = await supabase
    .from("candidatos")
    .insert({
      org_id: gate.org.id,
      name: v.name,
      phone: v.phone ?? null,
      email: v.email ?? null,
      city: v.city ?? null,
      resume_path: v.resumePath ?? null,
      resume_name: v.resumeName ?? null,
      source: "manual",
    })
    .select("id")
    .single();
  if (error || !candidato) {
    logger.error("candidate.create", { message: describeError(error), orgId: gate.org.id });
    return { error: "Não foi possível cadastrar. Tente de novo." };
  }

  const { error: appError } = await supabase.from("candidaturas").insert({
    org_id: gate.org.id,
    candidato_id: candidato.id,
    vaga_id: v.vagaId,
    status: "novo",
  });
  if (appError) {
    logger.error("candidatura.create", { message: describeError(appError), orgId: gate.org.id });
    return { error: "O candidato foi salvo, mas não entrou na vaga. Tente ligar de novo." };
  }

  revalidatePath("/candidatos");
  return { success: "Candidato adicionado à vaga." };
}

/** Muda a situação de uma candidatura (aprovar, recusar, avançar). */
export async function setCandidaturaStatus(id: string, status: string, note?: string) {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(id).success || !CANDIDATURA_STATUS.includes(status as (typeof CANDIDATURA_STATUS)[number])) {
    return { error: "Pedido inválido." };
  }
  const reviewNote = note?.trim().slice(0, 2000) || null;
  // Aprovado: avisa na hora. Recusado: aviso com atraso (o cron envia).
  // Qualquer outro status: nada a avisar.
  const notify =
    status === "aprovado"
      ? { notify_at: null, notified_at: new Date().toISOString() }
      : status === "reprovado"
        ? { notify_at: rejectionNotifyAt(), notified_at: null }
        : { notify_at: null, notified_at: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidaturas")
    .update({ status, review_note: reviewNote, ...notify })
    .eq("id", id);
  if (error) return { error: "Não foi possível atualizar." };

  // Boa notícia sai na hora, em segundo plano (não trava o clique).
  if (status === "aprovado") after(() => notifyApproval(id));

  revalidatePath("/candidatos");
  return { ok: true };
}

/**
 * Envia o checklist de documentos pelo WhatsApp da empresa. Os documentos
 * chegam no próprio WhatsApp; o Pulse não os recebe. A conversa passa para
 * atendimento humano, senão o bot leria a foto de um documento como currículo.
 */
export async function sendChecklist(candidaturaId: string, items: string[], note?: string) {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(candidaturaId).success) return { error: "Candidato inválido." };
  const list = items.map((i) => i.trim().slice(0, DOC_ITEM_MAX)).filter(Boolean).slice(0, DOC_CHECKLIST_MAX);
  if (list.length === 0) return { error: "Marque ao menos um documento." };
  const extra = note?.trim().slice(0, 500);

  const supabase = await createClient();
  const { data: app } = await supabase.from("candidaturas").select("id, candidato_id, vaga_id").eq("id", candidaturaId).maybeSingle();
  if (!app) return { error: "Candidato inválido." };
  const [{ data: cand }, { data: vaga }] = await Promise.all([
    supabase.from("candidatos").select("name, phone").eq("id", app.candidato_id).maybeSingle(),
    supabase.from("vagas").select("title").eq("id", app.vaga_id).maybeSingle(),
  ]);
  const number = toWhatsappNumber((cand?.phone as string | null) ?? null);
  if (!number) return { error: "Esse candidato não tem um WhatsApp válido cadastrado." };

  const admin = createAdminClient();
  const { data: conn } = await admin.from("wa_connections").select("status").eq("org_id", gate.org.id).maybeSingle();
  if (conn?.status !== "connected") return { error: "Conecte o WhatsApp da empresa em Conta antes de enviar." };

  const text =
    `Olá, ${firstName((cand?.name as string) ?? "")}! Para seguirmos com a sua admissão` +
    `${vaga?.title ? ` na vaga de *${vaga.title}*` : ""}, precisamos destes documentos:\n\n` +
    list.map((i, n) => `${n + 1}. ${i}`).join("\n") +
    (extra ? `\n\n${extra}` : "") +
    `\n\nPode enviar por aqui mesmo, em foto legível ou PDF. Qualquer dúvida, é só chamar. 🙂`;

  try {
    await sendFromPulse(gate.org.id, number, text, { pauseBot: true });
  } catch (error) {
    logger.error("checklist.send", { message: describeError(error), orgId: gate.org.id });
    return { error: "Não foi possível enviar pelo WhatsApp. Tente de novo." };
  }

  await supabase.from("candidaturas").update({ checklist_sent_at: new Date().toISOString() }).eq("id", candidaturaId);
  revalidatePath("/candidatos");
  return { ok: true };
}

export type CandidateDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  source: "manual" | "whatsapp";
  createdAt: string;
  hasResume: boolean;
  resumeName: string | null;
  summary: string | null;
  notes: string;
  candidaturas: {
    id: string;
    vagaTitle: string;
    status: string;
    score: number | null;
    scoreReason: string | null;
    reviewNote: string | null;
    createdAt: string;
  }[];
  entrevistas: { id: string; at: string; duration: number; vagaTitle: string }[];
};

/** Ficha completa do candidato: dados, resumo da IA, vagas e entrevistas. */
export async function getCandidateDetail(candidatoId: string): Promise<{ detail: CandidateDetail } | { error: string }> {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(candidatoId).success) return { error: "Candidato inválido." };

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("candidatos")
    .select("id, name, phone, email, city, source, created_at, resume_path, resume_name, resume_data, notes")
    .eq("id", candidatoId)
    .maybeSingle();
  if (!c) return { error: "Candidato não encontrado." };

  const { data: apps } = await supabase
    .from("candidaturas")
    .select("id, vaga_id, status, score, score_reason, review_note, created_at")
    .eq("candidato_id", candidatoId)
    .order("created_at", { ascending: false });
  const appIds = (apps ?? []).map((a) => a.id as string);
  const vagaIds = [...new Set((apps ?? []).map((a) => a.vaga_id as string))];
  const [{ data: vagas }, { data: ents }] = await Promise.all([
    vagaIds.length ? supabase.from("vagas").select("id, title").in("id", vagaIds) : Promise.resolve({ data: [] }),
    appIds.length
      ? supabase.from("entrevistas").select("id, candidatura_id, scheduled_at, duration_min").in("candidatura_id", appIds).order("scheduled_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const vagaTitle = new Map((vagas ?? []).map((v) => [v.id as string, v.title as string]));
  const appVaga = new Map((apps ?? []).map((a) => [a.id as string, vagaTitle.get(a.vaga_id as string) ?? "-"]));
  const resumeData = c.resume_data as { summary?: string } | null;

  return {
    detail: {
      id: c.id as string,
      name: c.name as string,
      phone: (c.phone as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      city: (c.city as string | null) ?? null,
      source: c.source as "manual" | "whatsapp",
      createdAt: c.created_at as string,
      hasResume: Boolean(c.resume_path),
      resumeName: (c.resume_name as string | null) ?? null,
      summary: resumeData?.summary?.trim() || null,
      notes: (c.notes as string | null) ?? "",
      candidaturas: (apps ?? []).map((a) => ({
        id: a.id as string,
        vagaTitle: vagaTitle.get(a.vaga_id as string) ?? "-",
        status: a.status as string,
        score: (a.score as number | null) ?? null,
        scoreReason: (a.score_reason as string | null) ?? null,
        reviewNote: (a.review_note as string | null) ?? null,
        createdAt: a.created_at as string,
      })),
      entrevistas: (ents ?? []).map((e) => ({
        id: e.id as string,
        at: e.scheduled_at as string,
        duration: e.duration_min as number,
        vagaTitle: appVaga.get(e.candidatura_id as string) ?? "-",
      })),
    },
  };
}

/** Anotações internas do RH sobre o candidato. */
export async function saveCandidateNotes(candidatoId: string, notes: string) {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(candidatoId).success) return { error: "Candidato inválido." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("candidatos")
    .update({ notes: notes.trim().slice(0, 2000) || null })
    .eq("id", candidatoId);
  if (error) return { error: "Não foi possível salvar." };
  return { ok: true };
}

/**
 * Apaga o candidato de vez (pedido de exclusão, LGPD): candidaturas e
 * entrevistas saem junto (cascata), o currículo sai do armazenamento e a
 * conversa do WhatsApp guardada pelo bot também. Só a liderança apaga.
 */
export async function deleteCandidate(candidatoId: string) {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (gate.role === "broker") return { error: "Só a liderança pode apagar candidatos." };
  if (!z.uuid().safeParse(candidatoId).success) return { error: "Candidato inválido." };

  const supabase = await createClient();
  const { data: c } = await supabase.from("candidatos").select("id, phone, resume_path").eq("id", candidatoId).maybeSingle();
  if (!c) return { error: "Candidato não encontrado." };

  const admin = createAdminClient();
  const resumePath = c.resume_path as string | null;
  if (resumePath?.startsWith(`${gate.org.id}/`)) {
    const { error: storageError } = await admin.storage.from(BUCKET).remove([resumePath]);
    if (storageError) {
      logger.error("candidate.delete_resume", { message: describeError(storageError), orgId: gate.org.id });
      return { error: "Não foi possível apagar o currículo. Tente de novo." };
    }
  }

  const number = toWhatsappNumber((c.phone as string | null) ?? null);
  await admin.from("wa_conversations").delete().eq("org_id", gate.org.id).eq("candidato_id", candidatoId);
  if (number) await admin.from("wa_conversations").delete().eq("org_id", gate.org.id).eq("phone", number);

  const { error } = await supabase.from("candidatos").delete().eq("id", candidatoId);
  if (error) {
    logger.error("candidate.delete", { message: describeError(error), orgId: gate.org.id });
    return { error: "Não foi possível apagar. Tente de novo." };
  }
  // Registro sem dado pessoal: só quem apagou e o id.
  logger.info("candidate.deleted", { message: `Candidato ${candidatoId} apagado por ${gate.id}`, orgId: gate.org.id });

  revalidatePath("/candidatos");
  revalidatePath("/entrevistas");
  revalidatePath("/recrutamento");
  return { ok: true };
}

/** Link temporário para abrir o currículo guardado. */
export async function resumeLink(candidatoId: string) {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(candidatoId).success) return { error: "Candidato inválido." };
  const supabase = await createClient();
  const { data } = await supabase.from("candidatos").select("resume_path").eq("id", candidatoId).maybeSingle();
  if (!data?.resume_path) return { error: "Esse candidato ainda não tem currículo." };
  const { data: signed, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(data.resume_path as string, 600);
  if (error || !signed) return { error: "Não foi possível abrir o currículo." };
  return { url: signed.signedUrl };
}
