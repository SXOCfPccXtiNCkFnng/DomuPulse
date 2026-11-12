import type { Metadata } from "next";
import { requireActivatedMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MontarPdfBoard } from "./board";

export const metadata: Metadata = { title: "Montar PDF" };

export default async function MontarPdfPage() {
  await requireActivatedMember();
  // Nomes dos clientes do escopo da pessoa (o RLS decide), para a busca do kit.
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, name").order("name").limit(1000);
  const clients = ((data ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name }));
  return <MontarPdfBoard clients={clients} />;
}
