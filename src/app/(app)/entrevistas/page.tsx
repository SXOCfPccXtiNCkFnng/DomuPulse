import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActivatedMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, startOfWeek, todayIn, zonedToIso } from "@/lib/time";
import { EntrevistasCalendar, type CandidaturaOption, type Evento } from "./entrevistas-calendar";

export const metadata: Metadata = { title: "Entrevistas" };

// Quem já saiu do processo não aparece para marcar entrevista.
const CLOSED = ["reprovado", "contratado"];

export default async function EntrevistasPage({ searchParams }: { searchParams: Promise<{ semana?: string | string[] }> }) {
  const member = await requireActivatedMember();
  if (member.org.segment !== "hr") redirect("/painel");
  const tz = member.org.timezone;

  const raw = (await searchParams).semana;
  const picked = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : todayIn(tz);
  const weekStart = startOfWeek(picked);

  const supabase = await createClient();
  const [{ data: entrevistas }, { data: apps }, { data: cands }, { data: vagas }] = await Promise.all([
    supabase
      .from("entrevistas")
      .select("id, candidatura_id, scheduled_at, duration_min, notes, location, remind_before_min, remind_at, reminded_at, confirmed_at")
      .gte("scheduled_at", zonedToIso(weekStart, "00:00", tz))
      .lt("scheduled_at", zonedToIso(addDays(weekStart, 7), "00:00", tz))
      .order("scheduled_at"),
    supabase.from("candidaturas").select("id, status, candidato_id, vaga_id"),
    supabase.from("candidatos").select("id, name, phone"),
    supabase.from("vagas").select("id, title"),
  ]);

  const candById = new Map((cands ?? []).map((c) => [c.id as string, c]));
  const vagaById = new Map((vagas ?? []).map((v) => [v.id as string, v]));
  const appById = new Map(
    (apps ?? []).map((a) => {
      const c = candById.get(a.candidato_id as string);
      return [
        a.id as string,
        {
          id: a.id as string,
          status: a.status as string,
          name: (c?.name as string) ?? "Candidato",
          phone: (c?.phone as string | null) ?? null,
          vagaTitle: (vagaById.get(a.vaga_id as string)?.title as string) ?? "-",
        },
      ];
    }),
  );

  const eventos: Evento[] = (entrevistas ?? []).map((e) => {
    const app = appById.get(e.candidatura_id as string);
    return {
      id: e.id as string,
      at: e.scheduled_at as string,
      duration: e.duration_min as number,
      notes: (e.notes as string | null) ?? null,
      location: (e.location as string | null) ?? null,
      remindBefore: (e.remind_before_min as number | null) ?? null,
      remindAt: (e.remind_at as string | null) ?? null,
      remindedAt: (e.reminded_at as string | null) ?? null,
      confirmedAt: (e.confirmed_at as string | null) ?? null,
      name: app?.name ?? "Candidato",
      phone: app?.phone ?? null,
      vagaTitle: app?.vagaTitle ?? "-",
    };
  });

  const options: CandidaturaOption[] = [...appById.values()]
    .filter((a) => !CLOSED.includes(a.status))
    .map((a) => ({ id: a.id, label: `${a.name} · ${a.vagaTitle}` }))
    .sort((x, y) => x.label.localeCompare(y.label, "pt-BR"));

  return <EntrevistasCalendar weekStart={weekStart} timezone={tz} eventos={eventos} candidaturas={options} />;
}
