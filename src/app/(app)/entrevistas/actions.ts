"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deliverInterviewNotice, deliveryLabel, loadInterview, remindAtFor, REMIND_OPTIONS } from "@/lib/interview-notify";
import { describeError, logger } from "@/lib/logger";
import { requireHr } from "@/lib/recruitment";
import { createClient } from "@/lib/supabase/server";
import { zonedToIso } from "@/lib/time";
import { fieldErrors, type FormState } from "@/lib/validation";

const optionalText = (max: number) => z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(max).optional());

const entrevistaSchema = z.object({
  candidaturaId: z.uuid("Escolha o candidato."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Informe o horário."),
  duration: z.coerce.number().int().min(5, "Mínimo de 5 minutos.").max(480, "Máximo de 8 horas."),
  location: optionalText(300),
  notes: optionalText(2000),
  remindBefore: z.coerce
    .number()
    .int()
    .refine((n) => n === 0 || (REMIND_OPTIONS as readonly number[]).includes(n), "Escolha uma opção.")
    .default(0),
  notify: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

// Ao marcar entrevista, quem ainda estava no começo do funil avança sozinho.
const ADVANCE_FROM = ["novo", "triagem"];

const NO_CHANNEL = "Não deu para avisar o candidato: WhatsApp da empresa desconectado e candidato sem e-mail.";

/** Marca uma entrevista para uma candidatura e, se pedido, avisa o candidato. */
export async function createEntrevista(_: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  const parsed = entrevistaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: app } = await supabase.from("candidaturas").select("id, status").eq("id", v.candidaturaId).maybeSingle();
  if (!app) return { fieldErrors: { candidaturaId: "Candidato inválido." } };

  const scheduledAt = zonedToIso(v.date, v.time, gate.org.timezone);
  const { data: created, error } = await supabase
    .from("entrevistas")
    .insert({
      org_id: gate.org.id,
      candidatura_id: v.candidaturaId,
      scheduled_at: scheduledAt,
      duration_min: v.duration,
      location: v.location ?? null,
      notes: v.notes ?? null,
      remind_before_min: v.remindBefore || null,
      remind_at: remindAtFor(scheduledAt, v.remindBefore),
    })
    .select("id")
    .single();
  if (error || !created) {
    logger.error("entrevista.create", { message: describeError(error), orgId: gate.org.id });
    return { error: "Não foi possível marcar a entrevista. Tente de novo." };
  }

  if (ADVANCE_FROM.includes(app.status as string)) {
    await supabase.from("candidaturas").update({ status: "entrevista" }).eq("id", v.candidaturaId);
    revalidatePath("/candidatos");
  }
  revalidatePath("/entrevistas");

  if (!v.notify) return { success: "Entrevista marcada." };
  const via = await notify("confirm", created.id as string);
  return via ? { success: `Entrevista marcada. Confirmação enviada ${via}.` } : { success: `Entrevista marcada. ${NO_CHANNEL}` };
}

/** Remarca ou edita uma entrevista. Avisa o candidato se mudou data, horário ou local. */
export async function updateEntrevista(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(id).success) return { error: "Entrevista inválida." };
  const parsed = entrevistaSchema.omit({ candidaturaId: true }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("entrevistas")
    .select("scheduled_at, location, remind_before_min, reminded_at, confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { error: "Entrevista não encontrada." };

  const scheduledAt = zonedToIso(v.date, v.time, gate.org.timezone);
  const moved = new Date(before.scheduled_at as string).getTime() !== new Date(scheduledAt).getTime();
  const changed = moved || ((before.location as string | null) ?? null) !== (v.location ?? null);
  const remindChanged = ((before.remind_before_min as number | null) ?? 0) !== v.remindBefore;

  const { error } = await supabase
    .from("entrevistas")
    .update({
      scheduled_at: scheduledAt,
      duration_min: v.duration,
      location: v.location ?? null,
      notes: v.notes ?? null,
      remind_before_min: v.remindBefore || null,
      remind_at: remindAtFor(scheduledAt, v.remindBefore),
      // Horário ou antecedência novos: o lembrete volta a valer.
      ...(moved || remindChanged ? { reminded_at: null } : {}),
    })
    .eq("id", id);
  if (error) return { error: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/entrevistas");

  if (!v.notify || !changed) return { success: "Entrevista atualizada." };
  const via = await notify(before.confirmed_at ? "reschedule" : "confirm", id);
  return via ? { success: `Entrevista atualizada. Candidato avisado ${via}.` } : { success: `Entrevista atualizada. ${NO_CHANNEL}` };
}

/** Desmarca uma entrevista e, se pedido, avisa o candidato. */
export async function deleteEntrevista(id: string, notifyCandidate = false) {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(id).success) return { error: "Entrevista inválida." };
  const supabase = await createClient();
  const { data: exists } = await supabase.from("entrevistas").select("id, scheduled_at").eq("id", id).maybeSingle();
  if (!exists) return { error: "Entrevista não encontrada." };

  // Carrega antes de apagar: depois não há mais de onde tirar os dados.
  const upcoming = new Date(exists.scheduled_at as string).getTime() > Date.now();
  const data = notifyCandidate && upcoming ? await loadInterview(id).catch(() => null) : null;

  const { error } = await supabase.from("entrevistas").delete().eq("id", id);
  if (error) return { error: "Não foi possível desmarcar." };
  revalidatePath("/entrevistas");

  if (data) await deliverInterviewNotice("cancel", data);
  return { ok: true };
}

async function notify(kind: "confirm" | "reschedule", id: string) {
  const data = await loadInterview(id).catch(() => null);
  if (!data) return null;
  const via = deliveryLabel(await deliverInterviewNotice(kind, data));
  if (via) {
    const supabase = await createClient();
    await supabase.from("entrevistas").update({ confirmed_at: new Date().toISOString() }).eq("id", id);
  }
  return via;
}
