import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActivatedMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VagasBoard, type Vaga } from "./vagas-board";

export const metadata: Metadata = { title: "Vagas" };

export default async function VagasPage() {
  const member = await requireActivatedMember();
  if (member.org.segment !== "hr") redirect("/painel");

  const supabase = await createClient();
  const [{ data: vagas }, { data: apps }] = await Promise.all([
    supabase.from("vagas").select("id, title, location, description, criteria, status").order("created_at", { ascending: false }),
    supabase.from("candidaturas").select("vaga_id"),
  ]);

  const counts = new Map<string, number>();
  for (const a of apps ?? []) counts.set(a.vaga_id as string, (counts.get(a.vaga_id as string) ?? 0) + 1);

  const list: Vaga[] = (vagas ?? []).map((v) => ({
    id: v.id as string,
    title: v.title as string,
    location: (v.location as string | null) ?? null,
    description: (v.description as string | null) ?? null,
    criteria: (v.criteria as string | null) ?? null,
    status: v.status as "open" | "closed",
    candidateCount: counts.get(v.id as string) ?? 0,
  }));

  return <VagasBoard vagas={list} />;
}
