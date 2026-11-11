import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActivatedMember } from "@/lib/auth";
import { getFinancingConfig } from "@/lib/interno";
import { createClient } from "@/lib/supabase/server";
import { type PropOption, SimuladorBoard } from "./board";

export const metadata: Metadata = { title: "Simulador" };

export default async function SimuladorPage() {
  const member = await requireActivatedMember();
  if (member.org.segment !== "brokers") redirect("/painel");

  const supabase = await createClient();
  const [{ data }, config] = await Promise.all([
    supabase
      .from("properties")
      .select("id, title, kind, neighborhood, city, price_cents, bedrooms")
      .eq("deal", "venda")
      .in("status", ["available", "reserved"])
      .not("price_cents", "is", null)
      .order("price_cents", { ascending: true }),
    getFinancingConfig(),
  ]);

  return <SimuladorBoard properties={(data ?? []) as PropOption[]} config={config} />;
}
