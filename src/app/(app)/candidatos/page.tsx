import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActivatedMember } from "@/lib/auth";
import { DEFAULT_DOC_CHECKLIST } from "@/lib/recruitment";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dateIn } from "@/lib/time";
import { CandidatosBoard, type Row, type VagaOption } from "./candidatos-board";

export const metadata: Metadata = { title: "Candidatos" };

export default async function CandidatosPage() {
  const member = await requireActivatedMember();
  if (member.org.segment !== "hr") redirect("/painel");

  const supabase = await createClient();
  const [{ data: apps }, { data: cands }, { data: vagas }, { data: settings }] = await Promise.all([
    supabase.from("candidaturas").select("id, status, score, candidato_id, vaga_id, created_at, checklist_sent_at"),
    supabase.from("candidatos").select("id, name, city, phone, email, resume_path, source"),
    supabase.from("vagas").select("id, title, status").order("created_at", { ascending: false }),
    createAdminClient().from("rh_settings").select("doc_checklist").eq("org_id", member.org.id).maybeSingle(),
  ]);
  const saved = (settings?.doc_checklist as string[] | null) ?? [];
  const checklist = saved.length ? saved : DEFAULT_DOC_CHECKLIST;

  const candById = new Map((cands ?? []).map((c) => [c.id as string, c]));
  const vagaById = new Map((vagas ?? []).map((v) => [v.id as string, v]));

  const rows: Row[] = (apps ?? [])
    .map((a) => {
      const c = candById.get(a.candidato_id as string);
      const v = vagaById.get(a.vaga_id as string);
      return {
        id: a.id as string,
        candidatoId: a.candidato_id as string,
        name: (c?.name as string) ?? "Candidato",
        city: (c?.city as string | null) ?? null,
        phone: (c?.phone as string | null) ?? null,
        email: (c?.email as string | null) ?? null,
        source: (c?.source as Row["source"]) ?? "manual",
        hasResume: Boolean(c?.resume_path),
        vagaId: a.vaga_id as string,
        vagaTitle: (v?.title as string) ?? "-",
        score: (a.score as number | null) ?? null,
        status: a.status as Row["status"],
        createdAt: a.created_at as string,
        appliedOn: dateIn(a.created_at as string, member.org.timezone),
        checklistSentOn: a.checklist_sent_at ? dateIn(a.checklist_sent_at as string, member.org.timezone) : null,
      };
    })
    // Maior nota primeiro; sem nota vai para o fim; depois, mais recente.
    .sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || y.createdAt.localeCompare(x.createdAt));

  const vagaOptions: VagaOption[] = (vagas ?? []).map((v) => ({ id: v.id as string, title: v.title as string, open: v.status === "open" }));

  return (
    <CandidatosBoard rows={rows} vagas={vagaOptions} checklist={checklist} canDelete={member.role !== "broker"} timezone={member.org.timezone} />
  );
}
