"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { describeError, logger } from "@/lib/logger";
import { BR_TIMEZONES, checkSlots } from "@/lib/org-settings";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, nameSchema, type FormState } from "@/lib/validation";

const schema = z.object({
  name: nameSchema,
  timezone: z.enum(BR_TIMEZONES.map((t) => t.id) as [string, ...string[]], "Escolha um fuso da lista."),
});

/**
 * Nome, fuso e horários de relatório. Grava com o cliente do usuário: o banco
 * só aceita do administrador e só nessas três colunas.
 */
export async function updateOrgSettings(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role !== "owner") return { error: "Só o administrador altera as configurações." };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const slots = checkSlots(formData.getAll("slot").map(String));
  if (!slots.ok) return { fieldErrors: { slots: slots.error } };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name, timezone: parsed.data.timezone, report_slots: slots.slots })
    .eq("id", me.org.id);
  if (error) {
    logger.error("org.settings", { message: describeError(error), orgId: me.org.id });
    return { error: "Não foi possível salvar. Tente novamente." };
  }

  // Os horários aparecem no painel de todo mundo.
  revalidatePath("/", "layout");
  return { success: "Configurações salvas. A equipe já vê os novos horários." };
}
