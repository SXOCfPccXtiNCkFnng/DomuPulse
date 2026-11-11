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
  /** Alçada comercial. Ausente enquanto a atualização do banco não rodou. */
  pricing?: PricingCondition[];
  /** Data base da alçada, "AAAA-MM-DD". */
  pricing_date?: string | null;
};

export type PropertyLayout = { bedrooms: number | null; area_m2: number | null };

/** Adicional no valor final conforme o andar da unidade. */
export type FloorAddon = { from: number | null; to: number | null; add_cents: number };

/** Uma linha da alçada comercial: tipologia + renda real + andar -> garantido e valor final. */
export type PricingCondition = {
  typology: string;
  income_from_cents: number | null;
  income_below_cents: number | null;
  floor_from: number | null;
  floor_to: number | null;
  guaranteed_cents: number | null;
  final_cents: number | null;
  floor_addons: FloorAddon[];
  note: string | null;
};

export const PRICING_TYPOLOGIES = ["Studio", "1 dormitório", "1 dormitório + office", "2 dormitórios", "3 dormitórios"];
export const MAX_PRICING = 40;

export const PROPERTY_COLUMNS = "id, title, code, kind, deal, neighborhood, city, price_cents, bedrooms, area_m2, status, notes";
export const PROPERTY_DETAIL_COLUMNS = `${PROPERTY_COLUMNS}, layouts, guaranteed_cents, post_keys_pct`;
export const PROPERTY_PRICING_COLUMNS = `${PROPERTY_DETAIL_COLUMNS}, pricing, pricing_date`;

/** "Até o 5º", "6º ao 10º", "A partir do 11º". */
export function floorRangeLabel(from: number | null, to: number | null) {
  if (from == null && to == null) return null;
  if (from == null || from <= 1) return to != null ? `Até o ${to}º andar` : null;
  if (to == null) return `A partir do ${from}º andar`;
  return from === to ? `${from}º andar` : `${from}º ao ${to}º andar`;
}

/** "Renda real abaixo de R$ 2.800", "Renda real a partir de R$ 3.201". */
export function incomeLabel(c: Pick<PricingCondition, "income_from_cents" | "income_below_cents">, money: (cents: number) => string) {
  const { income_from_cents: from, income_below_cents: below } = c;
  if (from != null && below != null) return `Renda real de ${money(from)} a abaixo de ${money(below)}`;
  if (from != null) return `Renda real a partir de ${money(from)}`;
  if (below != null) return `Renda real abaixo de ${money(below)}`;
  return null;
}

/** Condições agrupadas por tipologia, na ordem em que aparecem. */
export function pricingByTypology(pricing: PricingCondition[]) {
  const groups = new Map<string, PricingCondition[]>();
  for (const c of pricing) groups.set(c.typology, [...(groups.get(c.typology) ?? []), c]);
  return [...groups];
}

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

export const PROPERTY_KINDS = ["Apartamento", "Studio", "Studio 24 m²", "1 dormitório", "1 dormitório + office", "2 dormitórios", "3 dormitórios", "Casa", "Casa em condomínio", "Terreno", "Sala comercial", "Loja", "Galpão", "Chácara", "Outro"];

export const PROPERTY_STATUS: Record<PropertyStatus, { label: string; tone: "neutral" | "brand" | "warn" | "danger" }> = {
  available: { label: "Disponível", tone: "brand" },
  reserved: { label: "Reservado", tone: "warn" },
  sold: { label: "Vendido/alugado", tone: "neutral" },
  inactive: { label: "Inativo", tone: "neutral" },
};

export const DEAL_LABEL: Record<PropertyDeal, string> = { venda: "Venda", locacao: "Locação" };

/** Texto que vai no "interesse" do cliente: "Residencial Jardins – 2 dormitórios (REF 102) · Centro". */
export function propertyLabel(p: Pick<Property, "title" | "code" | "neighborhood"> & { kind?: string | null }) {
  const kind = p.kind ? ` – ${p.kind}` : "";
  const ref = p.code ? ` (${p.code})` : "";
  const place = p.neighborhood ? ` · ${p.neighborhood}` : "";
  return `${p.title}${kind}${ref}${place}`.slice(0, 200);
}
