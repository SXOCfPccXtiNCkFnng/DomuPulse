"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { describeError, logger } from "@/lib/logger";
import { propertyLabel, type Property } from "@/lib/properties";
import { createClient } from "@/lib/supabase/server";

// A agenda fica ligada ao cliente: agendar escolhe (ou cria) um cliente, e o
// funil anda sozinho, mas só para frente (nunca rebaixa um negócio adiantado).

type Stage = "lead" | "talking" | "scheduled" | "visited" | "proposal" | "presale" | "won" | "lost";
const uuid = (v: string) => z.uuid().safeParse(v).success;

/** Agenda uma visita ligada a um cliente (existente ou novo). */
export async function scheduleVisit(input: {
  memberId: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string | null;
  propertyId?: string | null;
  scheduledAt: string;
}): Promise<{ error: string } | { ok: true }> {
  if (!uuid(input.memberId)) return { error: "Corretor inválido." };
  if (!input.scheduledAt || Number.isNaN(Date.parse(input.scheduledAt))) return { error: "Data ou horário inválidos." };
  if (input.propertyId && !uuid(input.propertyId)) return { error: "Imóvel inválido." };

  const supabase = await createClient();
  let clientId = input.clientId;
  let name = input.clientName.trim().slice(0, 120);
  let phone = input.clientPhone?.trim() || null;

  // Imóvel escolhido vira o imóvel de interesse do cliente (o RLS garante que é da mesma empresa).
  let propertyLink: { property_id: string; interest: string } | null = null;
  if (input.propertyId) {
    const { data: p } = await supabase.from("properties").select("id, title, code, neighborhood").eq("id", input.propertyId).maybeSingle();
    if (!p) return { error: "Imóvel não encontrado." };
    propertyLink = { property_id: p.id as string, interest: propertyLabel(p as Pick<Property, "title" | "code" | "neighborhood">) };
  }

  if (clientId) {
    if (!uuid(clientId)) return { error: "Cliente inválido." };
    const { data: c } = await supabase.from("clients").select("id, name, phone, stage").eq("id", clientId).maybeSingle();
    if (!c) return { error: "Cliente não encontrado." };
    name = c.name as string;
    phone = (c.phone as string | null) ?? null;
    // Só avança: lead/conversa entram para "Visita agendada"; adiante disso fica como está.
    const advance = c.stage === "lead" || c.stage === "talking" ? { stage: "scheduled" as const } : {};
    if (propertyLink || "stage" in advance) {
      await supabase.from("clients").update({ ...advance, ...propertyLink }).eq("id", clientId);
    }
  } else {
    if (!name) return { error: "Informe o nome do cliente." };
    // Cliente novo já nasce em "Visita agendada" e some a duplicidade.
    const { data: created, error } = await supabase
      .from("clients")
      .insert({ member_id: input.memberId, name, phone, stage: "scheduled", ...propertyLink })
      .select("id")
      .single();
    if (error || !created) {
      logger.error("agenda.create_client", { message: describeError(error) });
      return { error: "Não foi possível criar o cliente. Tente de novo." };
    }
    clientId = created.id as string;
  }

  const { error: apptErr } = await supabase
    .from("appointments")
    .insert({ member_id: input.memberId, client_id: clientId, client_name: name, client_phone: phone, scheduled_at: input.scheduledAt });
  if (apptErr) {
    logger.error("agenda.create_appointment", { message: describeError(apptErr) });
    return { error: apptErr.code === "23514" ? "Confira o telefone informado." : "Não foi possível agendar. Tente de novo." };
  }
  revalidatePath("/agenda");
  return { ok: true };
}

/** Muda a situação da visita. Ao marcar "Realizada", o cliente avança para "Visitou" (só para frente). */
export async function setVisitStatus(id: string, status: "scheduled" | "done" | "no_show" | "canceled"): Promise<{ error: string } | { ok: true }> {
  if (!uuid(id)) return { error: "Visita inválida." };
  const supabase = await createClient();
  const { data: appt, error } = await supabase.from("appointments").update({ status }).eq("id", id).select("client_id").maybeSingle();
  if (error) return { error: "Não foi possível atualizar." };

  if (status === "done" && appt?.client_id) {
    const { data: c } = await supabase.from("clients").select("stage").eq("id", appt.client_id).maybeSingle();
    const stage = c?.stage as Stage | undefined;
    if (stage === "lead" || stage === "talking" || stage === "scheduled") {
      await supabase.from("clients").update({ stage: "visited" }).eq("id", appt.client_id);
    }
  }
  revalidatePath("/agenda");
  return { ok: true };
}
