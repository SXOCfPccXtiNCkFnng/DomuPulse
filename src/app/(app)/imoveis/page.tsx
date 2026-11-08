import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isLeader, requireActivatedMember } from "@/lib/auth";
import { PROPERTY_COLUMNS, PROPERTY_DETAIL_COLUMNS, type Property } from "@/lib/properties";
import { createClient } from "@/lib/supabase/server";
import { PropertiesBoard } from "./properties-board";

export const metadata: Metadata = { title: "Imóveis" };

export default async function ImoveisPage() {
  const member = await requireActivatedMember();
  if (member.org.segment !== "brokers") redirect("/recrutamento");

  const supabase = await createClient();
  const [detailed, { data: links }] = await Promise.all([
    supabase.from("properties").select(PROPERTY_DETAIL_COLUMNS).order("created_at", { ascending: false }),
    supabase.from("clients").select("property_id").not("property_id", "is", null),
  ]);
  // Sem a atualização de quartos/garantido/pós-chaves: mostra o que já existe.
  const missingDetails = detailed.error?.code === "42703";
  const { data, error } = missingDetails
    ? await supabase.from("properties").select(PROPERTY_COLUMNS).order("created_at", { ascending: false })
    : detailed;

  const counts: Record<string, number> = {};
  for (const l of (links ?? []) as { property_id: string }[]) counts[l.property_id] = (counts[l.property_id] ?? 0) + 1;

  return (
    <PropertiesBoard
      properties={(data ?? []) as Property[]}
      clientCounts={counts}
      canManage={isLeader(member.role)}
      missingTable={error?.code === "42P01" || error?.code === "PGRST205"}
      missingDetails={missingDetails}
    />
  );
}
