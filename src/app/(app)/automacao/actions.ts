"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_CLOSING, DEFAULT_GREETING, DOC_CHECKLIST_MAX, DOC_ITEM_MAX, requireHr } from "@/lib/recruitment";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors, type FormState } from "@/lib/validation";
import { resumeStage } from "@/lib/wa-bot";

const schema = z.object({
  botEnabled: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  greeting: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(1000).optional()),
  instructions: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(2000).optional()),
  closing: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(1000).optional()),
});

/** Salva a configuração da IA de recrutamento da empresa. */
export async function saveAutomation(_: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (gate.role !== "owner") return { error: "Só o administrador configura a automação." };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const { error } = await createAdminClient().from("rh_settings").upsert({
    org_id: gate.org.id,
    bot_enabled: v.botEnabled,
    // Igual ao padrão: guarda vazio, para seguir o padrão se ele mudar.
    greeting: v.greeting && v.greeting !== DEFAULT_GREETING ? v.greeting : null,
    instructions: v.instructions ?? null,
    closing: v.closing && v.closing !== DEFAULT_CLOSING ? v.closing : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/automacao");
  return { success: "Configuração salva." };
}

/** Pausa o atendimento automático numa conversa, ou devolve a conversa ao bot. */
export async function setBotPaused(conversationId: string, paused: boolean) {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(conversationId).success) return { error: "Conversa inválida." };

  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("wa_conversations")
    .select("id, candidato_id, vaga_id")
    .eq("id", conversationId)
    .eq("org_id", gate.org.id)
    .maybeSingle<{ id: string; candidato_id: string | null; vaga_id: string | null }>();
  if (!conv) return { error: "Conversa não encontrada." };

  const { error } = await admin
    .from("wa_conversations")
    .update({ stage: paused ? "human" : resumeStage(conv), updated_at: new Date().toISOString() })
    .eq("id", conv.id);
  if (error) return { error: "Não foi possível atualizar." };
  revalidatePath("/automacao");
  return { ok: true };
}

/** Salva o checklist de documentos (um item por linha). */
export async function saveChecklist(_: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (gate.role === "broker") return { error: "Só a liderança monta o checklist." };

  const items = [
    ...new Set(
      String(formData.get("items") ?? "")
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*(?:[-•*☐]\s*|\d+[.)]\s+)?/, "").trim())
        .filter(Boolean),
    ),
  ];
  if (items.length > DOC_CHECKLIST_MAX) return { fieldErrors: { items: `Use no máximo ${DOC_CHECKLIST_MAX} documentos.` } };
  if (items.some((i) => i.length > DOC_ITEM_MAX)) return { fieldErrors: { items: `Cada documento pode ter até ${DOC_ITEM_MAX} caracteres.` } };

  const { error } = await createAdminClient()
    .from("rh_settings")
    .upsert({ org_id: gate.org.id, doc_checklist: items, updated_at: new Date().toISOString() });
  if (error) return { error: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/automacao");
  revalidatePath("/candidatos");
  return { success: items.length ? "Checklist salvo." : "Checklist apagado. Vale a lista padrão." };
}
