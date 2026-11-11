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
    const { data: p } = await supabase.from("properties").select("id, title, code, kind, neighborhood").eq("id", input.propertyId).maybeSingle();
    if (!p) return { error: "Imóvel não encontrado." };
    propertyLink = { property_id: p.id as string, interest: propertyLabel(p as Pick<Property, "title" | "code" | "kind" | "neighborhood">) };
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

type VisitStatus = "scheduled" | "done" | "no_show" | "canceled";
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Leva a situação da visita para o funil do cliente:
 * - Realizada: lead, conversa ou visita agendada vão para "Visitou".
 * - Agendada (de novo): lead ou conversa vão para "Visita agendada".
 * - Cancelada/faltou: se era "Visita agendada" e não sobrou outra visita marcada, volta para "Em conversa".
 * Etapas mais adiantadas (proposta, pré-venda, venda) nunca são rebaixadas.
 */
async function syncClientStage(supabase: Supabase, clientId: string, status: VisitStatus) {
  const { data: c } = await supabase.from("clients").select("stage").eq("id", clientId).maybeSingle();
  const stage = c?.stage as Stage | undefined;
  if (!stage) return;

  let next: Stage | null = null;
  if (status === "done" && (stage === "lead" || stage === "talking" || stage === "scheduled")) next = "visited";
  else if (status === "scheduled" && (stage === "lead" || stage === "talking")) next = "scheduled";
  else if ((status === "canceled" || status === "no_show") && stage === "scheduled") {
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("status", "scheduled");
    if (!count) next = "talking";
  }
  if (next) await supabase.from("clients").update({ stage: next }).eq("id", clientId);
}

/** Muda a situação da visita (inclusive reabrir) e reflete no funil do cliente. */
export async function setVisitStatus(id: string, status: VisitStatus): Promise<{ error: string } | { ok: true }> {
  if (!uuid(id)) return { error: "Visita inválida." };
  if (!["scheduled", "done", "no_show", "canceled"].includes(status)) return { error: "Situação inválida." };
  const supabase = await createClient();
  const { data: appt, error } = await supabase.from("appointments").update({ status }).eq("id", id).select("client_id").maybeSingle();
  if (error || !appt) return { error: "Não foi possível atualizar. Só o corretor da visita ou a liderança podem alterar." };

  if (appt.client_id) await syncClientStage(supabase, appt.client_id as string, status);
  revalidatePath("/agenda");
  revalidatePath("/clientes");
  return { ok: true };
}

/**
 * Edita a visita. Mudar data ou horário remarca e reabre como "Agendada".
 * O imóvel (ou "" para tirar) vai para o cliente da visita como imóvel de interesse.
 */
export async function updateVisit(
  id: string,
  input: { scheduledAt?: string; propertyId?: string | null },
): Promise<{ error: string } | { ok: true }> {
  if (!uuid(id)) return { error: "Visita inválida." };
  if (input.scheduledAt !== undefined && Number.isNaN(Date.parse(input.scheduledAt))) return { error: "Data ou horário inválidos." };
  if (input.propertyId && !uuid(input.propertyId)) return { error: "Imóvel inválido." };
  const supabase = await createClient();

  let clientId: string | null = null;
  if (input.scheduledAt !== undefined) {
    const { data: appt, error } = await supabase
      .from("appointments")
      .update({ scheduled_at: input.scheduledAt, status: "scheduled" })
      .eq("id", id)
      .select("client_id")
      .maybeSingle();
    if (error || !appt) return { error: "Não foi possível remarcar." };
    clientId = (appt.client_id as string | null) ?? null;
    if (clientId) await syncClientStage(supabase, clientId, "scheduled");
  } else {
    const { data: appt } = await supabase.from("appointments").select("client_id").eq("id", id).maybeSingle();
    if (!appt) return { error: "Visita não encontrada." };
    clientId = (appt.client_id as string | null) ?? null;
  }

  if (input.propertyId !== undefined) {
    if (!clientId) return { error: "Esta visita não está ligada a um cliente, então não dá para vincular o imóvel." };
    let link: { property_id: string | null; interest?: string } = { property_id: null };
    if (input.propertyId) {
      const { data: p } = await supabase.from("properties").select("id, title, code, kind, neighborhood").eq("id", input.propertyId).maybeSingle();
      if (!p) return { error: "Imóvel não encontrado." };
      link = { property_id: p.id as string, interest: propertyLabel(p as Pick<Property, "title" | "code" | "kind" | "neighborhood">) };
    }
    const { error } = await supabase.from("clients").update(link).eq("id", clientId);
    if (error) return { error: "Não foi possível vincular o imóvel." };
  }

  revalidatePath("/agenda");
  revalidatePath("/clientes");
  return { ok: true };
}

/** Exclui a visita. O cliente continua na carteira; se ficou sem visita marcada, volta para "Em conversa". */
export async function deleteVisit(id: string): Promise<{ error: string } | { ok: true }> {
  if (!uuid(id)) return { error: "Visita inválida." };
  const supabase = await createClient();
  const { data: appt, error } = await supabase.from("appointments").delete().eq("id", id).select("client_id").maybeSingle();
  if (error || !appt) return { error: "Não foi possível excluir." };

  if (appt.client_id) await syncClientStage(supabase, appt.client_id as string, "canceled");
  revalidatePath("/agenda");
  revalidatePath("/clientes");
  return { ok: true };
}
