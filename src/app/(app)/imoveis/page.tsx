import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isLeader, requireActivatedMember } from "@/lib/auth";
import { PROPERTY_COLUMNS, PROPERTY_DETAIL_COLUMNS, PROPERTY_PRICING_COLUMNS, type Property } from "@/lib/properties";
import { createClient } from "@/lib/supabase/server";
import { PropertiesBoard } from "./properties-board";

export const metadata: Metadata = { title: "Imóveis" };

export default async function ImoveisPage() {
  const member = await requireActivatedMember();
  if (member.org.segment !== "brokers") redirect("/recrutamento");

  const supabase = await createClient();
  const list = (columns: string) => supabase.from("properties").select(columns).order("created_at", { ascending: false });
  const [withPricing, { data: links }] = await Promise.all([
    list(PROPERTY_PRICING_COLUMNS),
    supabase.from("clients").select("property_id").not("property_id", "is", null),
  ]);
  // Sem as atualizações mais novas do banco: mostra o que já existe.
  const missingPricing = withPricing.error?.code === "42703";
  const detailed = missingPricing ? await list(PROPERTY_DETAIL_COLUMNS) : withPricing;
  const missingDetails = detailed.error?.code === "42703";
  const { data, error } = missingDetails ? await list(PROPERTY_COLUMNS) : detailed;

  const counts: Record<string, number> = {};
  for (const l of (links ?? []) as { property_id: string }[]) counts[l.property_id] = (counts[l.property_id] ?? 0) + 1;

  return (
    <PropertiesBoard
      properties={(data ?? []) as unknown as Property[]}
      clientCounts={counts}
      canManage={isLeader(member.role)}
      missingTable={error?.code === "42P01" || error?.code === "PGRST205"}
      missingDetails={missingDetails}
      missingPricing={missingPricing}
    />
  );
}
