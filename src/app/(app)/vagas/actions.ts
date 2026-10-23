"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { describeError, logger } from "@/lib/logger";
import { requireHr } from "@/lib/recruitment";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation";

const vagaSchema = z.object({
  title: z.string().trim().min(2, "Dê um nome à vaga.").max(120),
  location: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(120).optional()),
  description: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(4000).optional()),
  criteria: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(2000).optional()),
});

/** Cria uma vaga. É por ela que os candidatos entram. */
export async function createVaga(_: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  const parsed = vagaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("vagas").insert({
    org_id: gate.org.id,
    title: v.title,
    location: v.location ?? null,
    description: v.description ?? null,
    criteria: v.criteria ?? null,
  });
  if (error) {
    logger.error("vaga.create", { message: describeError(error), orgId: gate.org.id });
    return { error: "Não foi possível criar a vaga. Tente de novo." };
  }
  revalidatePath("/vagas");
  return { success: "Vaga criada." };
}

/** Edita os dados de uma vaga. */
export async function updateVaga(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(id).success) return { error: "Vaga inválida." };
  const parsed = vagaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("vagas")
    .update({ title: v.title, location: v.location ?? null, description: v.description ?? null, criteria: v.criteria ?? null })
    .eq("id", id);
  if (error) return { error: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/vagas");
  return { success: "Vaga atualizada." };
}

/** Abre ou fecha a vaga (fechada deixa de receber candidatos). */
export async function setVagaStatus(id: string, status: "open" | "closed") {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(id).success) return { error: "Vaga inválida." };
  const supabase = await createClient();
  const { error } = await supabase.from("vagas").update({ status }).eq("id", id);
  if (error) return { error: "Não foi possível atualizar." };
  revalidatePath("/vagas");
  return { ok: true };
}

/** Apaga uma vaga sem candidatos. Com candidatos, feche em vez de apagar. */
export async function deleteVaga(id: string) {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(id).success) return { error: "Vaga inválida." };
  const supabase = await createClient();
  const { count } = await supabase.from("candidaturas").select("id", { count: "exact", head: true }).eq("vaga_id", id);
  if ((count ?? 0) > 0) return { error: "Essa vaga já tem candidatos. Feche a vaga em vez de apagar." };
  const { error } = await supabase.from("vagas").delete().eq("id", id);
  if (error) return { error: "Não foi possível apagar." };
  revalidatePath("/vagas");
  return { ok: true };
}
