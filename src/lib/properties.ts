// Compartilhado entre servidor e cliente.

export type PropertyStatus = "available" | "reserved" | "sold" | "inactive";
export type PropertyDeal = "venda" | "locacao";

export type Property = {
  id: string;
  title: string;
  code: string | null;
  kind: string | null;
  deal: PropertyDeal;
  neighborhood: string | null;
  city: string | null;
  price_cents: number | null;
  bedrooms: number | null;
  area_m2: number | null;
  status: PropertyStatus;
  notes: string | null;
};

export const PROPERTY_COLUMNS = "id, title, code, kind, deal, neighborhood, city, price_cents, bedrooms, area_m2, status, notes";

export const PROPERTY_KINDS = ["Apartamento", "Casa", "Casa em condomínio", "Terreno", "Sala comercial", "Loja", "Galpão", "Chácara", "Outro"];

export const PROPERTY_STATUS: Record<PropertyStatus, { label: string; tone: "neutral" | "brand" | "warn" | "danger" }> = {
  available: { label: "Disponível", tone: "brand" },
  reserved: { label: "Reservado", tone: "warn" },
  sold: { label: "Vendido/alugado", tone: "neutral" },
  inactive: { label: "Inativo", tone: "neutral" },
};

export const DEAL_LABEL: Record<PropertyDeal, string> = { venda: "Venda", locacao: "Locação" };

/** Texto que vai no "interesse" do cliente: "Apto Jardins (REF 102) · Centro". */
export function propertyLabel(p: Pick<Property, "title" | "code" | "neighborhood">) {
  const ref = p.code ? ` (${p.code})` : "";
  const place = p.neighborhood ? ` · ${p.neighborhood}` : "";
  return `${p.title}${ref}${place}`.slice(0, 200);
}
