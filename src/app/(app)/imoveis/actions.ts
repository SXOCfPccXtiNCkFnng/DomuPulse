"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember, isLeader, orgCanWrite } from "@/lib/auth";
import { describeError, logger } from "@/lib/logger";
import { parseMoney } from "@/lib/money";
import { MAX_PRICING, PHOTO_BUCKET, PHOTO_FILE_TYPES, PHOTO_MAX, PHOTO_MAX_BYTES, type PricingCondition, type PropertyLayout } from "@/lib/properties";
import { createAdminClient } from "@/lib/supabase/admin";
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
  guaranteed: optionalText(30),
  postKeys: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.replace("%", "").replace(",", ".").trim()) : v),
    z.coerce.number("Informe a porcentagem, como 30 ou 12,5.").min(0, "Use de 0 a 100%.").max(100, "Use de 0 a 100%.").optional(),
  ),
  status: z.enum(["available", "reserved", "sold", "inactive"]),
  notes: optionalText(2000),
});

const layoutBedrooms = optionalInt(50, "Informe um número de quartos válido.");
const layoutArea = optionalInt(1_000_000, "Informe a área em m², só números.");

/** Opções de quartos: pares "quartos" + "área" do formulário; linhas vazias são ignoradas. */
function parseLayouts(formData: FormData): { layouts: PropertyLayout[] } | { fieldErrors: Record<string, string> } {
  const beds = formData.getAll("layoutBedrooms");
  const areas = formData.getAll("layoutArea");
  const layouts: PropertyLayout[] = [];
  for (let i = 0; i < Math.min(beds.length, 10); i++) {
    const b = layoutBedrooms.safeParse(beds[i]);
    if (!b.success) return { fieldErrors: { layouts: b.error.issues[0].message } };
    const a = layoutArea.safeParse(areas[i]);
    if (!a.success) return { fieldErrors: { layouts: a.error.issues[0].message } };
    if (b.data == null && a.data == null) continue;
    layouts.push({ bedrooms: b.data ?? null, area_m2: a.data ?? null });
  }
  return { layouts };
}

const cents = z.number().int().min(0).max(100_000_000_000).nullable();
const floor = z.number().int().min(-5).max(200).nullable();
const pricingSchema = z
  .array(
    z.object({
      typology: z.string().trim().min(1, "Informe a tipologia de cada condição da alçada.").max(60),
      income_from_cents: cents,
      income_below_cents: cents,
      floor_from: floor,
      floor_to: floor,
      guaranteed_cents: cents,
      final_cents: cents,
      floor_addons: z
        .array(z.object({ from: floor, to: floor, add_cents: z.number().int().min(0).max(100_000_000_000) }))
        .max(10),
      note: z.string().trim().max(300).nullable(),
    }),
  )
  .max(MAX_PRICING, `Use no máximo ${MAX_PRICING} condições na alçada.`);

/** Alçada comercial: vem do formulário como JSON. Ausente quando o banco ainda não tem a coluna. */
function parsePricing(formData: FormData): { pricing?: { pricing: PricingCondition[]; pricing_date: string | null } } | { fieldErrors: Record<string, string> } {
  const raw = formData.get("pricing");
  if (typeof raw !== "string") return {};
  let json: unknown;
  try {
    json = JSON.parse(raw || "[]");
  } catch {
    return { fieldErrors: { pricing: "Não foi possível ler a alçada. Recarregue a página." } };
  }
  const parsed = pricingSchema.safeParse(json);
  if (!parsed.success) return { fieldErrors: { pricing: parsed.error.issues[0].message } };
  const date = String(formData.get("pricingDate") ?? "").trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { fieldErrors: { pricingDate: "Data inválida." } };
  return { pricing: { pricing: parsed.data, pricing_date: date || null } };
}

function toRow(v: z.infer<typeof propertySchema>, layouts: PropertyLayout[]) {
  const beds = layouts.map((l) => l.bedrooms).filter((n): n is number => n != null);
  const areas = layouts.map((l) => l.area_m2).filter((n): n is number => n != null);
  return {
    title: v.title,
    code: v.code ?? null,
    kind: v.kind ?? null,
    deal: v.deal,
    neighborhood: v.neighborhood ?? null,
    city: v.city ?? null,
    price_cents: v.price ? parseMoney(v.price) : null,
    guaranteed_cents: v.guaranteed ? parseMoney(v.guaranteed) : null,
    post_keys_pct: v.postKeys ?? null,
    layouts,
    bedrooms: beds.length ? Math.min(...beds) : null,
    area_m2: areas.length ? Math.min(...areas) : null,
    status: v.status,
    notes: v.notes ?? null,
  };
}

function parseProperty(formData: FormData) {
  const parsed = propertySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const layouts = parseLayouts(formData);
  if ("fieldErrors" in layouts) return layouts;
  const pricing = parsePricing(formData);
  if ("fieldErrors" in pricing) return pricing;
  return { row: { ...toRow(parsed.data, layouts.layouts), ...pricing.pricing } };
}

const MISSING_DETAILS = "Falta rodar a atualização do banco de imóveis (quartos, garantido, pós-chaves e alçada). Fale com o suporte.";

export async function createProperty(_: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireLeader();
  if ("error" in gate) return gate;
  const parsed = parseProperty(formData);
  if ("fieldErrors" in parsed) return { fieldErrors: parsed.fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from("properties").insert({ org_id: gate.org.id, ...parsed.row });
  if (error) {
    logger.error("property.create", { message: describeError(error), orgId: gate.org.id });
    if (error.code === "42703" || error.code === "PGRST204") return { error: MISSING_DETAILS };
    return { error: error.code === "42P01" ? "Falta rodar a atualização do banco (imóveis). Fale com o suporte." : "Não foi possível cadastrar o imóvel. Tente de novo." };
  }
  revalidatePath("/imoveis");
  return { success: "Imóvel cadastrado." };
}

export async function updateProperty(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireLeader();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(id).success) return { error: "Imóvel inválido." };
  const parsed = parseProperty(formData);
  if ("fieldErrors" in parsed) return { fieldErrors: parsed.fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from("properties").update(parsed.row).eq("id", id);
  if (error) return { error: error.code === "42703" || error.code === "PGRST204" ? MISSING_DETAILS : "Não foi possível salvar. Tente de novo." };
  revalidatePath("/imoveis");
  return { success: "Imóvel atualizado." };
}

// Fotos do imóvel -------------------------------------------------------------

const MISSING_PHOTOS = "Falta rodar a atualização do banco (fotos dos imóveis). Fale com o suporte.";
const missingPhotoTable = (code?: string) => code === "42P01" || code === "PGRST205" || code === "PGRST204";

/** Passo 1 do envio: confere o imóvel e devolve uma URL de upload de uso único. */
export async function preparePropertyPhotoUpload(propertyId: string, file: { name: string; size: number; type: string }) {
  const gate = await requireLeader();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(propertyId).success) return { error: "Imóvel inválido." };
  const ext = PHOTO_FILE_TYPES[file.type];
  if (!ext) return { error: "Envie a foto em JPG, PNG ou WEBP." };
  if (!(file.size > 0 && file.size <= PHOTO_MAX_BYTES)) return { error: "A foto precisa ter até 10 MB." };

  const supabase = await createClient();
  const { data: property } = await supabase.from("properties").select("id").eq("id", propertyId).maybeSingle();
  if (!property) return { error: "Imóvel não encontrado." };
  const { count } = await supabase.from("property_photos").select("id", { count: "exact", head: true }).eq("property_id", propertyId);
  if ((count ?? 0) >= PHOTO_MAX) return { error: `Cada imóvel aceita até ${PHOTO_MAX} fotos.` };

  const path = `${gate.org.id}/${propertyId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    logger.error("property_photo.upload_url", { message: describeError(error), orgId: gate.org.id });
    return { error: "Não foi possível preparar o envio. Tente de novo." };
  }
  return { path: data.path, token: data.token };
}

/** Passo 2: registra a foto já enviada, no fim da ordem. */
export async function addPropertyPhoto(propertyId: string, path: string) {
  const gate = await requireLeader();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(propertyId).success) return { error: "Imóvel inválido." };
  if (!path.startsWith(`${gate.org.id}/${propertyId}/`)) return { error: "Arquivo inválido. Envie de novo." };

  const supabase = await createClient();
  const { data: last } = await supabase.from("property_photos").select("sort").eq("property_id", propertyId).order("sort", { ascending: false }).limit(1).maybeSingle();
  const sort = Math.min(PHOTO_MAX * 2, ((last?.sort as number | undefined) ?? -1) + 1);
  const { data, error } = await supabase.from("property_photos").insert({ org_id: gate.org.id, property_id: propertyId, path, sort }).select("id").single();
  if (error || !data) {
    if (!missingPhotoTable(error?.code)) logger.error("property_photo.add", { message: describeError(error), orgId: gate.org.id });
    return { error: missingPhotoTable(error?.code) ? MISSING_PHOTOS : "Não foi possível salvar a foto." };
  }
  revalidatePath("/imoveis");
  return { ok: true, id: data.id as string };
}

/** Apaga uma foto do imóvel (registro e arquivo). */
export async function deletePropertyPhoto(photoId: string) {
  const gate = await requireLeader();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(photoId).success) return { error: "Foto inválida." };

  const supabase = await createClient();
  const { data: photo } = await supabase.from("property_photos").select("id, path").eq("id", photoId).maybeSingle();
  if (!photo) return { error: "Foto não encontrada." };
  const { error } = await supabase.from("property_photos").delete().eq("id", photoId);
  if (error) return { error: "Não foi possível apagar a foto." };
  const { error: storageError } = await createAdminClient().storage.from(PHOTO_BUCKET).remove([photo.path as string]);
  if (storageError) logger.error("property_photo.remove", { message: describeError(storageError), orgId: gate.org.id });
  revalidatePath("/imoveis");
  return { ok: true };
}

/** Reordena as fotos (a primeira vira a capa). Recebe os ids na nova ordem. */
export async function reorderPropertyPhotos(propertyId: string, orderedIds: string[]) {
  const gate = await requireLeader();
  if ("error" in gate) return gate;
  if (!z.uuid().safeParse(propertyId).success) return { error: "Imóvel inválido." };
  const ids = z.array(z.uuid()).max(PHOTO_MAX).safeParse(orderedIds);
  if (!ids.success) return { error: "Ordem inválida." };

  const supabase = await createClient();
  for (let i = 0; i < ids.data.length; i++) {
    await supabase.from("property_photos").update({ sort: i }).eq("id", ids.data[i]).eq("property_id", propertyId);
  }
  revalidatePath("/imoveis");
  return { ok: true };
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
