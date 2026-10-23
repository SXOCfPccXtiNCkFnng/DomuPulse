"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, MessageCircle, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { useOrgClock } from "@/lib/live/use-live-day";
import { addDays, dateIn, formatTimeIn, minutesNowIn } from "@/lib/time";
import type { FormState } from "@/lib/validation";
import { createEntrevista, deleteEntrevista, updateEntrevista } from "./actions";

export type Evento = {
  id: string;
  at: string;
  duration: number;
  notes: string | null;
  location: string | null;
  remindBefore: number | null;
  remindAt: string | null;
  remindedAt: string | null;
  confirmedAt: string | null;
  name: string;
  phone: string | null;
  vagaTitle: string;
};
export type CandidaturaOption = { id: string; label: string };

// Faixa de horas visível. Estica sozinha se houver entrevista fora dela.
const DAY_START = 7;
const DAY_END = 21;
const HOUR_PX = 56;
const SLOT_MIN = 30;
const DURATIONS = [15, 30, 45, 60, 90, 120];
const REMINDERS = [
  { value: 0, label: "Não enviar lembrete" },
  { value: 60, label: "1 hora antes" },
  { value: 120, label: "2 horas antes" },
  { value: 1440, label: "1 dia antes" },
];
const DEFAULT_REMINDER = 1440;

const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const utcNoon = (date: string) => new Date(`${date}T12:00:00Z`);

function weekLabel(start: string) {
  const end = addDays(start, 6);
  if (start.slice(0, 7) === end.slice(0, 7)) return monthFmt.format(utcNoon(start));
  const year = end.slice(0, 4);
  return `${shortMonthFmt.format(utcNoon(start))} – ${shortMonthFmt.format(utcNoon(end))} de ${year}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

type Placed = Evento & { day: string; start: number; lane: number; lanes: number };

/** Distribui as entrevistas de cada dia em colunas quando os horários se cruzam. */
function place(eventos: Evento[], tz: string): Placed[] {
  const byDay = new Map<string, Placed[]>();
  for (const e of eventos) {
    const day = dateIn(e.at, tz);
    const item = { ...e, day, start: minutesNowIn(tz, new Date(e.at)), lane: 0, lanes: 1 };
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  const out: Placed[] = [];
  for (const items of byDay.values()) {
    items.sort((a, b) => a.start - b.start || b.duration - a.duration);
    let group: Placed[] = [];
    let groupEnd = -1;
    const flush = () => {
      const lanes = Math.max(...group.map((g) => g.lane)) + 1;
      for (const g of group) g.lanes = lanes;
      out.push(...group);
      group = [];
    };
    for (const item of items) {
      if (group.length && item.start >= groupEnd) flush();
      const laneEnds = new Map<number, number>();
      for (const g of group) laneEnds.set(g.lane, Math.max(laneEnds.get(g.lane) ?? 0, g.start + g.duration));
      let lane = 0;
      while ((laneEnds.get(lane) ?? -1) > item.start) lane++;
      item.lane = lane;
      group.push(item);
      groupEnd = Math.max(groupEnd, item.start + item.duration);
    }
    if (group.length) flush();
  }
  return out;
}

type DialogState = { mode: "new"; date: string; time: string } | { mode: "edit"; evento: Evento } | null;

export function EntrevistasCalendar({
  weekStart,
  timezone,
  eventos,
  candidaturas,
}: {
  weekStart: string;
  timezone: string;
  eventos: Evento[];
  candidaturas: CandidaturaOption[];
}) {
  const { today, minutes: nowMin } = useOrgClock(timezone);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const placed = place(eventos, timezone);
  const firstHour = Math.min(DAY_START, ...placed.map((p) => Math.floor(p.start / 60)));
  const lastHour = Math.max(DAY_END, ...placed.map((p) => Math.ceil((p.start + p.duration) / 60)));
  const hours = Array.from({ length: Math.min(lastHour, 24) - firstHour }, (_, i) => firstHour + i);
  const top = (minutes: number) => ((minutes - firstHour * 60) / 60) * HOUR_PX;

  // Abre já mostrando o começo do expediente.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = top(8 * 60) - 8;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const thisWeek = days.includes(today);
  const pickSlot = (day: string, e: React.MouseEvent<HTMLDivElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const minutes = firstHour * 60 + Math.floor((y / HOUR_PX) * (60 / SLOT_MIN)) * SLOT_MIN;
    setDialog({ mode: "new", date: day, time: hhmm(Math.min(minutes, 23 * 60 + 30)) });
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted">Recrutamento</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Entrevistas</h1>
        </div>
        <Button onClick={() => setDialog({ mode: "new", date: thisWeek ? today : weekStart, time: "09:00" })} disabled={candidaturas.length === 0}>
          <Plus className="size-4" />
          Marcar entrevista
        </Button>
      </header>

      {candidaturas.length === 0 ? (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Adicione candidatos a uma vaga para poder marcar entrevistas.</p>
      ) : null}

      {flash ? (
        <div
          role="status"
          className={clsx(
            "flex items-start gap-3 rounded-xl px-4 py-3 text-sm",
            flash.includes("Não deu") ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand-text",
          )}
        >
          <span className="flex-1">{flash}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label="Fechar aviso" className="shrink-0 opacity-70 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/entrevistas?semana=${today}`} className={buttonClass("secondary", "sm")}>
          Hoje
        </Link>
        <Link href={`/entrevistas?semana=${addDays(weekStart, -7)}`} aria-label="Semana anterior" className={buttonClass("ghost", "sm", "w-8 px-0")}>
          <ChevronLeft className="size-4" />
        </Link>
        <Link href={`/entrevistas?semana=${addDays(weekStart, 7)}`} aria-label="Próxima semana" className={buttonClass("ghost", "sm", "w-8 px-0")}>
          <ChevronRight className="size-4" />
        </Link>
        <h2 className="ml-1 font-display text-lg font-semibold tracking-tight first-letter:uppercase">{weekLabel(weekStart)}</h2>
        <span className="ml-auto text-sm text-muted">
          {eventos.length} {eventos.length === 1 ? "entrevista" : "entrevistas"} na semana
        </span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            {/* Cabeçalho dos dias */}
            <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-line">
              <span />
              {days.map((d) => (
                <div key={d} className="flex flex-col items-center gap-1 py-2.5">
                  <span className={clsx("text-[11px] font-semibold uppercase", d === today ? "text-brand-text" : "text-muted")}>
                    {weekdayFmt.format(utcNoon(d)).replace(".", "")}
                  </span>
                  <span
                    className={clsx(
                      "grid size-9 place-items-center rounded-full font-display text-lg font-semibold tabular-nums",
                      d === today ? "bg-brand text-brand-ink" : "text-ink",
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                </div>
              ))}
            </div>

            {/* Grade de horários */}
            <div ref={scroller} className="max-h-[68vh] overflow-y-auto">
              <div className="relative grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" style={{ height: hours.length * HOUR_PX }}>
                <div className="relative">
                  {hours.map((h) => (
                    <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted tabular-nums" style={{ top: top(h * 60) }}>
                      {h === firstHour ? "" : `${h}h`}
                    </span>
                  ))}
                </div>

                {days.map((d) => (
                  <div
                    key={d}
                    onClick={(e) => candidaturas.length && pickSlot(d, e)}
                    className={clsx("relative border-l border-line", candidaturas.length && "cursor-pointer", d === today && "bg-brand-soft/30")}
                    style={{
                      backgroundImage: "linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)",
                      backgroundSize: `100% ${HOUR_PX}px`,
                    }}
                  >
                    {placed
                      .filter((p) => p.day === d)
                      .map((p) => {
                        const height = Math.max((p.duration / 60) * HOUR_PX - 2, 20);
                        const past = p.day < today || (p.day === today && p.start + p.duration <= nowMin);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDialog({ mode: "edit", evento: p });
                            }}
                            title={`${p.name} · ${p.vagaTitle}`}
                            className={clsx(
                              "absolute overflow-hidden rounded-md border-l-[3px] border-brand bg-brand px-1.5 py-0.5 text-left text-[11px] leading-tight text-brand-ink shadow-card transition hover:brightness-110",
                              past && "opacity-55",
                            )}
                            style={{
                              top: top(p.start) + 1,
                              height,
                              left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                              width: `calc(${100 / p.lanes}% - 4px)`,
                            }}
                          >
                            <span className="block truncate font-semibold">{p.name}</span>
                            {height > 30 ? (
                              <span className="block truncate opacity-90">
                                {formatTimeIn(p.at, timezone)} · {p.vagaTitle}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}

                    {d === today && nowMin >= firstHour * 60 && nowMin < (firstHour + hours.length) * 60 ? (
                      <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger" style={{ top: top(nowMin) }}>
                        <span className="absolute -top-[5px] -left-[6px] size-3 rounded-full bg-danger" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {dialog ? (
        <EntrevistaDialog
          key={dialog.mode === "edit" ? dialog.evento.id : `${dialog.date}-${dialog.time}`}
          state={dialog}
          timezone={timezone}
          candidaturas={candidaturas}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setDialog(null);
            setFlash(message);
          }}
        />
      ) : null}
    </div>
  );
}

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
}

function EntrevistaDialog({
  state: open,
  timezone,
  candidaturas,
  onClose,
  onDone,
}: {
  state: NonNullable<DialogState>;
  timezone: string;
  candidaturas: CandidaturaOption[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const evento = open.mode === "edit" ? open.evento : null;
  const action = evento ? updateEntrevista.bind(null, evento.id) : createEntrevista;
  const [state, formAction, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const r = await action(prev, data);
    if (r.success) {
      router.refresh();
      onDone(r.success);
    }
    return r;
  }, {} as FormState);
  const [notifyCancel, setNotifyCancel] = useState(true);
  const [openedAt] = useState(() => Date.now());
  const [removing, startRemove] = useTransition();
  const [confirmDel, setConfirmDel] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const remove = () =>
    startRemove(async () => {
      if (!evento) return;
      const notify = canNotifyCancel && notifyCancel;
      const r = await deleteEntrevista(evento.id, notify);
      if ("error" in r) setDelError(r.error ?? "Não foi possível desmarcar.");
      else {
        router.refresh();
        onDone(notify ? "Entrevista desmarcada. O candidato foi avisado." : "Entrevista desmarcada.");
      }
    });

  const date = evento ? dateIn(evento.at, timezone) : open.mode === "new" ? open.date : "";
  const time = evento ? formatTimeIn(evento.at, timezone) : open.mode === "new" ? open.time : "";
  const duration = evento?.duration ?? 30;
  const busy = pending || removing;
  // Só faz sentido avisar o cancelamento de quem já sabia da entrevista e ela ainda não passou.
  const canNotifyCancel = Boolean(evento?.confirmedAt) && new Date(evento?.at ?? 0).getTime() > openedAt;
  const stamp = (iso: string) => `${dateIn(iso, timezone).split("-").reverse().slice(0, 2).join("/")} às ${formatTimeIn(iso, timezone)}`;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
    >
      <form action={formAction} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold tracking-tight">{evento ? "Entrevista" : "Marcar entrevista"}</h2>
            {evento ? (
              <p className="mt-0.5 truncate text-sm text-muted">
                {evento.name} · {evento.vagaTitle}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </header>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
        {delError ? <FormMessage>{delError}</FormMessage> : null}

        {evento ? null : (
          <Field label="Candidato" error={state.fieldErrors?.candidaturaId}>
            <Select name="candidaturaId" defaultValue={candidaturas[0]?.id ?? ""} required autoFocus>
              {candidaturas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-[1fr_auto_auto] gap-3">
          <Field label="Data" error={state.fieldErrors?.date}>
            <Input name="date" type="date" defaultValue={date} required />
          </Field>
          <Field label="Horário" error={state.fieldErrors?.time}>
            <Input name="time" type="time" defaultValue={time} step={900} required className="w-28" />
          </Field>
          <Field label="Duração" error={state.fieldErrors?.duration}>
            <Select name="duration" defaultValue={String(DURATIONS.includes(duration) ? duration : 30)} className="w-28">
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60}h${m % 60 ? "30" : ""}`}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Local ou link" hint="Opcional. Vai na mensagem para o candidato." error={state.fieldErrors?.location}>
          <Input name="location" defaultValue={evento?.location ?? ""} maxLength={300} placeholder="Ex.: Rua das Flores, 120, sala 3 ou link do Meet" />
        </Field>

        <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3.5">
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="notify" defaultChecked className="mt-0.5 size-4 accent-[var(--color-brand)]" />
            <span>
              {evento ? "Avisar o candidato se mudar data, horário ou local" : "Enviar confirmação ao candidato agora"}
              <span className="block text-xs text-muted">Pelo WhatsApp da empresa e por e-mail, se o candidato tiver.</span>
            </span>
          </label>
          <Field label="Lembrete ao candidato" error={state.fieldErrors?.remindBefore}>
            <Select name="remindBefore" defaultValue={String(evento ? (evento.remindBefore ?? 0) : DEFAULT_REMINDER)}>
              {REMINDERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          {evento && (evento.confirmedAt || evento.remindedAt || evento.remindAt) ? (
            <ul className="flex flex-col gap-0.5 text-xs text-muted">
              {evento.confirmedAt ? <li>Candidato avisado em {stamp(evento.confirmedAt)}.</li> : null}
              {evento.remindedAt ? (
                <li>Lembrete enviado em {stamp(evento.remindedAt)}.</li>
              ) : evento.remindAt ? (
                <li>Lembrete agendado para {stamp(evento.remindAt)}.</li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <Field label="Observações da equipe" hint="Opcional. Só a equipe vê. Ex.: quem entrevista, pontos para avaliar." error={state.fieldErrors?.notes}>
          <textarea
            name="notes"
            defaultValue={evento?.notes ?? ""}
            rows={3}
            maxLength={2000}
            className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] hover:border-line-strong focus:border-ink focus:outline-none"
          />
        </Field>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {evento ? (
            confirmDel ? (
              <>
                {canNotifyCancel ? (
                  <label className="flex w-full items-center gap-2 text-sm">
                    <input type="checkbox" checked={notifyCancel} onChange={(e) => setNotifyCancel(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                    Avisar o candidato que a entrevista foi desmarcada
                  </label>
                ) : null}
                <Button size="sm" variant="danger" onClick={remove} disabled={busy}>
                  {removing ? "Desmarcando..." : "Confirmar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)} disabled={busy}>
                  Voltar
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(true)} disabled={busy}>
                  Desmarcar
                </Button>
                {evento.phone ? (
                  <a href={waLink(evento.phone)} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
                    <MessageCircle className="size-4" />
                    WhatsApp
                  </a>
                ) : null}
              </>
            )
          ) : null}
          <span className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {pending ? "Salvando..." : evento ? "Salvar" : "Marcar"}
            </Button>
          </span>
        </footer>
      </form>
    </dialog>
  );
}
