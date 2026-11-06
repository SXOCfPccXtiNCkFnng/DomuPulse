"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember, isLeader, orgCanWrite } from "@/lib/auth";
import { describeError, logger } from "@/lib/logger";
import { parseMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation";

/** Só a liderança (administrador, superintendente e gerente) mexe nos imóveis. */
async function requireLeader() {
  const me = await getCurrentMember();
  if (me.org.segment !== "brokers") return { error: "Disponível só para imobiliárias." };
  if (!isLeader(me.role)) return { error: "Só administrador, superintendente ou gerente cadastram imóveis." };
  if (!orgCanWrite(me.org)) return { error: "A assinatura está inativa. Fale com o administrador." };
  return me;
}

const optionalText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());
const optionalInt = (max: number, msg: string) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.number().int(msg).min(0, msg).max(max, msg).optional());

const propertySchema = z.object({
  title: z.string().trim().min(2, "Dê um nome ao imóvel.").max(120),
  code: optionalText(30),
  kind: optionalText(40),
  deal: z.enum(["venda", "locacao"]),
  neighborhood: optionalText(120),
  city: optionalText(80),
  price: optionalText(30),
  bedrooms: optionalInt(50, "Informe um número de quartos válido."),
  area: optionalInt(1_000_000, "Informe a área em m², só números."),
  status: z.enum(["available", "reserved", "sold", "inactive"]),
  notes: optionalText(2000),
});

function toRow(v: z.infer<typeof propertySchema>) {
  return {
    title: v.title,
    code: v.code ?? null,
    kind: v.kind ?? null,
    deal: v.deal,
    neighborhood: v.neighborhood ?? null,
    city: v.city ?? null,
    price_cents: v.price ? parseMoney(v.price) : null,
    bedrooms: v.bedrooms ?? null,
    area_m2: v.area ?? null,
    status: v.status,
    notes: v.notes ?? null,
  };
}

export async function createProperty(_: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireLeader();
  if ("error" in gate) return gate;
  const parsed = propertySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("properties").insert({ org_id: gate.org.id, ...toRow(parsed.data) });
  if (error) {
    logger.error("property.create", { message: describeError(error), orgId: gate.org.id });
    return { error: error.code === "42P01" ? "Falta rodar a atualização do banco (imóveis). Fale com o suporte." : "Não foi possível cadastrar o imóvel. Tente de novo." };
  }
  revalidatePath("/imoveis");
  return { success: "Imóvel cadastrado." };
}

export async function updateProperty(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireLeader();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(id).success) return { error: "Imóvel inválido." };
  const parsed = propertySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("properties").update(toRow(parsed.data)).eq("id", id);
  if (error) return { error: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/imoveis");
  return { success: "Imóvel atualizado." };
}

/** Apaga o imóvel. Os clientes ligados a ele continuam, só perdem o vínculo. */
export async function deleteProperty(id: string) {
  const gate = await requireLeader();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(id).success) return { error: "Imóvel inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("properties").delete().eq("id", id);
  if (error) return { error: "Não foi possível apagar." };
  revalidatePath("/imoveis");
  return { ok: true };
}
