import clsx from "clsx";
import { ArrowRight, Briefcase, CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StatTile } from "@/components/live/viz";
import { Card, CardHeader } from "@/components/ui/card";
import { requireActivatedMember } from "@/lib/auth";
import { STATUS_LABEL, type CandidaturaStatus } from "@/lib/recruitment";
import { createClient } from "@/lib/supabase/server";
import { addDays, dateIn, formatDate, formatLongDate, formatTimeIn, todayIn, zonedToIso } from "@/lib/time";

export const metadata: Metadata = { title: "Recrutamento" };

const WINDOW_DAYS = 30;
const FUNNEL: CandidaturaStatus[] = ["novo", "triagem", "entrevista", "aprovado", "contratado"];
const DAY_MS = 24 * 60 * 60 * 1000;

type App = {
  id: string;
  status: CandidaturaStatus;
  score: number | null;
  candidato_id: string;
  vaga_id: string;
  created_at: string;
  status_changed_at: string;
};

const avg = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

function Trend({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return null;
  const pct = before === 0 ? 100 : Math.round(((now - before) / before) * 100);
  return (
    <span className={clsx("rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", pct >= 0 ? "bg-brand-soft text-brand-text" : "bg-danger-soft text-danger")}>
      {pct >= 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

export default async function RecrutamentoPage() {
  const member = await requireActivatedMember();
  if (member.org.segment !== "hr") redirect("/painel");
  const tz = member.org.timezone;
  const today = todayIn(tz);
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const prevFrom = addDays(from, -WINDOW_DAYS);

  const supabase = await createClient();
  const [{ data: vagasRaw }, { data: appsRaw }, { data: candsRaw }, { data: entrevistasRaw }] = await Promise.all([
    supabase.from("vagas").select("id, title, status"),
    supabase.from("candidaturas").select("id, status, score, candidato_id, vaga_id, created_at, status_changed_at"),
    supabase.from("candidatos").select("id, name, source"),
    supabase
      .from("entrevistas")
      .select("id, candidatura_id, scheduled_at")
      .gte("scheduled_at", new Date().toISOString())
      .lt("scheduled_at", zonedToIso(addDays(today, 7), "00:00", tz))
      .order("scheduled_at"),
  ]);

  const vagas = (vagasRaw ?? []) as { id: string; title: string; status: "open" | "closed" }[];
  const apps = (appsRaw ?? []) as App[];
  const cands = new Map(((candsRaw ?? []) as { id: string; name: string; source: string }[]).map((c) => [c.id, c]));
  const entrevistas = (entrevistasRaw ?? []) as { id: string; candidatura_id: string; scheduled_at: string }[];
  const appById = new Map(apps.map((a) => [a.id, a]));
  const vagaById = new Map(vagas.map((v) => [v.id, v]));

  // Janela atual (últimos 30 dias) e a anterior, para comparar.
  const day = (iso: string) => dateIn(iso, tz);
  const recent = apps.filter((a) => day(a.created_at) >= from);
  const previous = apps.filter((a) => day(a.created_at) >= prevFrom && day(a.created_at) < from);
  const toReview = apps.filter((a) => a.status === "novo" || a.status === "triagem").length;
  const hired = apps.filter((a) => a.status === "contratado" && day(a.status_changed_at) >= from);
  const daysToHire = avg(hired.map((a) => (new Date(a.status_changed_at).getTime() - new Date(a.created_at).getTime()) / DAY_MS));
  const scored = recent.filter((a) => a.score != null).map((a) => a.score as number);
  const avgScore = avg(scored);
  const interviewsToday = entrevistas.filter((e) => day(e.scheduled_at) === today).length;
  const openVagas = vagas.filter((v) => v.status === "open");

  // Candidaturas por dia.
  const perDay = new Map<string, number>();
  for (const a of recent) perDay.set(day(a.created_at), (perDay.get(day(a.created_at)) ?? 0) + 1);
  const series = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const d = addDays(from, i);
    return { date: d, value: perDay.get(d) ?? 0 };
  });
  const seriesMax = Math.max(1, ...series.map((s) => s.value));

  // Funil: situação atual de todas as candidaturas.
  const byStatus = new Map<CandidaturaStatus, number>();
  for (const a of apps) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);
  const funnelMax = Math.max(1, ...FUNNEL.map((s) => byStatus.get(s) ?? 0));

  // Origem dos candidatos que chegaram no período.
  const viaWhatsapp = recent.filter((a) => cands.get(a.candidato_id)?.source === "whatsapp").length;
  const whatsappPct = recent.length ? Math.round((viaWhatsapp / recent.length) * 100) : 0;

  // Desempenho de cada vaga aberta.
  const perVaga = openVagas
    .map((v) => {
      const list = apps.filter((a) => a.vaga_id === v.id);
      return {
        id: v.id,
        title: v.title,
        total: list.length,
        review: list.filter((a) => a.status === "novo" || a.status === "triagem").length,
        interview: list.filter((a) => a.status === "entrevista").length,
        hired: list.filter((a) => a.status === "contratado").length,
        score: avg(list.filter((a) => a.score != null).map((a) => a.score as number)),
      };
    })
    .sort((x, y) => y.total - x.total);

  const upcoming = entrevistas.slice(0, 5).map((e) => {
    const app = appById.get(e.candidatura_id);
    return {
      id: e.id,
      at: e.scheduled_at,
      name: (app && cands.get(app.candidato_id)?.name) || "Candidato",
      vaga: (app && vagaById.get(app.vaga_id)?.title) || "-",
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="animate-rise">
        <p className="text-sm text-muted">{member.org.name}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Recrutamento</h1>
        <p className="mt-1 text-sm text-muted">
          Últimos {WINDOW_DAYS} dias, de {formatDate(from)} a {formatDate(today)}
        </p>
      </header>

      {vagas.length === 0 ? (
        <Link href="/vagas" className="group">
          <Card className="flex items-center gap-4 p-5 transition-colors hover:border-line-strong">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
              <Briefcase className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-semibold group-hover:underline">Comece pela primeira vaga</span>
              <span className="block text-sm text-muted">Cadastre a vaga e os critérios. É por ela que os candidatos entram e são pontuados.</span>
            </span>
            <ArrowRight className="size-5 text-muted" />
          </Card>
        </Link>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Vagas abertas" value={openVagas.length} detail={`${vagas.length - openVagas.length} fechadas`} />
        <StatTile
          label="Candidaturas"
          value={recent.length}
          detail={`${previous.length} nos ${WINDOW_DAYS} dias anteriores`}
          trend={<Trend now={recent.length} before={previous.length} />}
        />
        <StatTile label="A revisar" value={toReview} detail="novos e em triagem" emphasis />
        <StatTile label="Entrevistas" value={entrevistas.length} detail={`próximos 7 dias · ${interviewsToday} hoje`} />
        <StatTile
          label="Contratados"
          value={hired.length}
          detail={daysToHire != null ? `média de ${Math.max(1, Math.round(daysToHire))} dias até contratar` : "no período"}
        />
        <StatTile
          label="Nota média da IA"
          value={avgScore != null ? Math.round(avgScore) : 0}
          detail={scored.length ? `em ${scored.length} ${scored.length === 1 ? "currículo" : "currículos"}, de 0 a 100` : "nenhum currículo pontuado"}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Candidaturas por dia" description={`${recent.length} no período · ${whatsappPct}% pelo WhatsApp`} />
          <div className="p-5 sm:p-6">
            <div className="flex h-44 items-end gap-[3px]" role="img" aria-label="Candidaturas por dia nos últimos 30 dias">
              {series.map((s) => (
                <div key={s.date} className="group relative flex h-full flex-1 items-end" title={`${formatDate(s.date)}: ${s.value}`}>
                  <div
                    className={clsx("w-full rounded-t-[4px] transition-opacity group-hover:opacity-80", s.value ? "bg-brand-text" : "bg-line")}
                    style={{ height: s.value ? `${(s.value / seriesMax) * 100}%` : "2px" }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted tabular-nums">
              <span>{formatDate(from).slice(0, 5)}</span>
              <span>{formatDate(addDays(from, 10)).slice(0, 5)}</span>
              <span>{formatDate(addDays(from, 20)).slice(0, 5)}</span>
              <span>Hoje</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Funil do processo" description="Onde cada candidatura está agora" />
          <ul className="flex flex-col gap-3 p-5 sm:p-6">
            {FUNNEL.map((s, i) => {
              const n = byStatus.get(s) ?? 0;
              const prev = i > 0 ? (byStatus.get(FUNNEL[i - 1]) ?? 0) : null;
              return (
                <li key={s}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{STATUS_LABEL[s].label}</span>
                    <span className="font-semibold tabular-nums">{n}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand-text" style={{ width: `${(n / funnelMax) * 100}%` }} />
                  </div>
                  {prev ? <p className="mt-0.5 text-[11px] text-muted">{Math.round((n / prev) * 100)}% da etapa anterior</p> : null}
                </li>
              );
            })}
            <li className="border-t border-line pt-3 text-sm text-muted">
              Recusados: <span className="font-semibold text-ink tabular-nums">{byStatus.get("reprovado") ?? 0}</span>
            </li>
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader
            title="Vagas abertas"
            description="Como cada vaga está andando"
            action={
              <Link href="/vagas" className="text-sm font-medium text-muted hover:text-ink">
                Ver vagas
              </Link>
            }
          />
          {perVaga.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted sm:px-6">Nenhuma vaga aberta.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-5 py-2 font-medium sm:px-6">Vaga</th>
                    <th className="px-3 py-2 text-right font-medium">Candidatos</th>
                    <th className="px-3 py-2 text-right font-medium">A revisar</th>
                    <th className="px-3 py-2 text-right font-medium">Entrevista</th>
                    <th className="px-3 py-2 text-right font-medium">Contratados</th>
                    <th className="px-5 py-2 text-right font-medium sm:px-6">Nota média</th>
                  </tr>
                </thead>
                <tbody>
                  {perVaga.map((v) => (
                    <tr key={v.id} className="border-t border-line">
                      <td className="max-w-[16rem] truncate px-5 py-3 font-medium sm:px-6">{v.title}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{v.total}</td>
                      <td className={clsx("px-3 py-3 text-right tabular-nums", v.review > 0 && "font-semibold text-warn")}>{v.review}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{v.interview}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{v.hired}</td>
                      <td className="px-5 py-3 text-right tabular-nums sm:px-6">{v.score != null ? Math.round(v.score) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="self-start">
          <CardHeader
            title="Próximas entrevistas"
            action={
              <Link href="/entrevistas" className="text-sm font-medium text-muted hover:text-ink">
                Ver agenda
              </Link>
            }
          />
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center sm:px-6">
              <CalendarDays className="size-7 text-muted" />
              <p className="text-sm text-muted">Nenhuma entrevista nos próximos 7 dias.</p>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {upcoming.map((e) => {
                const d = day(e.at);
                return (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <span className="w-16 shrink-0 text-xs text-muted">
                      <span className="block font-display text-base font-semibold text-ink tabular-nums">{formatTimeIn(e.at, tz)}</span>
                      {d === today ? "Hoje" : d === addDays(today, 1) ? "Amanhã" : formatLongDate(d).split(",")[0]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{e.name}</span>
                      <span className="block truncate text-xs text-muted">{e.vaga}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
