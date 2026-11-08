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
  /** Opções de quartos/planta. Ausente enquanto a atualização do banco não rodou. */
  layouts?: PropertyLayout[];
  guaranteed_cents?: number | null;
  post_keys_pct?: number | null;
};

export type PropertyLayout = { bedrooms: number | null; area_m2: number | null };

export const PROPERTY_COLUMNS = "id, title, code, kind, deal, neighborhood, city, price_cents, bedrooms, area_m2, status, notes";
export const PROPERTY_DETAIL_COLUMNS = `${PROPERTY_COLUMNS}, layouts, guaranteed_cents, post_keys_pct`;

/** Opções de quartos do imóvel; imóveis antigos viram uma opção com os quartos e a área deles. */
export function propertyLayouts(p: Pick<Property, "bedrooms" | "area_m2" | "layouts">): PropertyLayout[] {
  if (p.layouts?.length) return p.layouts;
  return p.bedrooms != null || p.area_m2 != null ? [{ bedrooms: p.bedrooms, area_m2: p.area_m2 }] : [];
}

/** "2 e 3 quartos" a partir das opções. */
export function bedroomsLabel(layouts: PropertyLayout[]) {
  const counts = [...new Set(layouts.map((l) => l.bedrooms).filter((n): n is number => n != null))].sort((a, b) => a - b);
  if (counts.length === 0) return null;
  const list = counts.length === 1 ? String(counts[0]) : `${counts.slice(0, -1).join(", ")} e ${counts.at(-1)}`;
  return `${list} ${counts.length === 1 && counts[0] === 1 ? "quarto" : "quartos"}`;
}

/** "45 m²" ou "45 a 62 m²" a partir das opções. */
export function areaLabel(layouts: PropertyLayout[]) {
  const areas = layouts.map((l) => l.area_m2).filter((n): n is number => n != null);
  if (areas.length === 0) return null;
  const min = Math.min(...areas);
  const max = Math.max(...areas);
  return min === max ? `${min} m²` : `${min} a ${max} m²`;
}

/** 30 -> "30%", 12.5 -> "12,5%". */
export const formatPct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

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
