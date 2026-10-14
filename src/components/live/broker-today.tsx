"use client";

import clsx from "clsx";
import { BellRing, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { announceReport } from "@/app/(app)/painel/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { Funnel, SlotChip, type SlotStatus } from "@/components/live/viz";
import { REPORT_SELECT, useLiveDay } from "@/lib/live/use-live-day";
import { emptyTotals, METRICS, sumReports, type MetricKey, type Report, type Totals } from "@/lib/metrics";
import { formatLongDate, slotLabel, slotState } from "@/lib/time";
import type { ClientMember } from "@/components/live/types";

const NOTES_MAX = 500;

export function BrokerToday({ member }: { member: ClientMember }) {
  const live = useLiveDay({ orgId: member.org.id, timezone: member.org.timezone });
  const { clock, statuses, supabase } = live;
  const slots = member.org.reportSlots;
  const online = statuses.get(member.id)?.online ?? null;

  const myReports = useMemo(
    () => slots.map((s) => live.reportFor(member.id, s)).filter((r): r is Report => Boolean(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live.reports, member.id, slots],
  );
  const totals = sumReports(myReports);

  const statusOf = (slot: string): SlotStatus => {
    if (live.reportFor(member.id, slot)) return "delivered";
    if (online === false) return "off";
    return slotState(slot, clock.minutes);
  };

  const suggested =
    slots.find((s) => ["open", "late"].includes(statusOf(s))) ??
    slots.find((s) => statusOf(s) === "upcoming") ??
    slots[slots.length - 1];

  // Segue o horário sugerido até a pessoa escolher outro.
  const [picked, setPicked] = useState<string | null>(null);
  const slot = picked ?? suggested;

  const [statusError, setStatusError] = useState<string | null>(null);
  async function setOnline(value: boolean) {
    setStatusError(null);
    const { data, error } = await supabase
      .from("daily_status")
      .upsert({ member_id: member.id, status_date: clock.today, online: value }, { onConflict: "member_id,status_date" })
      .select("member_id, status_date, online")
      .single();
    if (error) setStatusError("Não foi possível atualizar sua presença. Tente de novo.");
    else live.upsertLocalStatus(data);
  }

  const firstName = member.fullName.split(" ")[0];
  const delivered = slots.filter((s) => statusOf(s) === "delivered").length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted capitalize">{formatLongDate(clock.today)}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {greeting(clock.minutes)}, {firstName}.
          </h1>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <div role="radiogroup" aria-label="Presença de hoje" className="flex rounded-xl bg-surface-2 p-1">
            {[
              { value: true, label: "Trabalhando" },
              { value: false, label: "Folga" },
            ].map((opt) => (
              <button
                key={opt.label}
                role="radio"
                aria-checked={online === opt.value}
                onClick={() => setOnline(opt.value)}
                className={clsx(
                  "h-9 rounded-lg px-4 text-sm font-medium transition-colors",
                  online === opt.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-muted">
            {online === null
              ? "Marque se está trabalhando hoje."
              : online
                ? "Lembrete 10 minutos antes de cada horário."
                : "Folga: sem lembretes e sem pendências hoje."}
          </p>
          {statusError ? <p className="text-[13px] text-danger">{statusError}</p> : null}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-label="Horários de hoje" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {slots.map((s) => {
              const st = statusOf(s);
              const selected = s === slot;
              return (
                <button
                  key={s}
                  onClick={() => setPicked(s)}
                  aria-pressed={selected}
                  className={clsx(
                    "flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all",
                    selected ? "border-ink bg-surface shadow-card" : "border-line bg-surface/60 hover:border-line-strong",
                  )}
                >
                  <span className="font-display text-2xl font-semibold tracking-tight">{slotLabel(s)}</span>
                  <SlotChip status={st} />
                </button>
              );
            })}
          </section>

          <ReportForm
            key={slot}
            slot={slot}
            existing={live.reportFor(member.id, slot)}
            onSave={async (values, notes) => {
              const isNew = !live.reportFor(member.id, slot);
              const { data, error } = await supabase
                .from("reports")
                .upsert(
                  { member_id: member.id, report_date: clock.today, report_slot: slot, ...values, notes: notes.trim() || null },
                  { onConflict: "member_id,report_date,report_slot" },
                )
                .select(REPORT_SELECT)
                .single<Report>();
              // P0001 são as regras de negócio do banco, com mensagem pronta para o usuário.
              if (error) return error.code === "P0001" ? error.message : "Não foi possível enviar. Tente de novo.";
              live.upsertLocalReport(data);
              // Avisa a liderança só na primeira entrega do horário. Não espera:
              // o relatório já está salvo, o aviso é extra.
              if (isNew) void announceReport(data.id).catch(() => {});
              return null;
            }}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader
              title="Seu funil hoje"
              description={`${delivered} de ${slots.length} ${slots.length === 1 ? "relatório entregue" : "relatórios entregues"}`}
            />
            <div className="p-5 sm:p-6">
              <Funnel totals={totals} />
            </div>
          </Card>
          <NotificationNudge />
        </div>
      </div>
    </div>
  );
}

function greeting(minutes: number) {
  if (minutes < 12 * 60) return "Bom dia";
  if (minutes < 18 * 60) return "Boa tarde";
  return "Boa noite";
}

function ReportForm({
  slot,
  existing,
  onSave,
}: {
  slot: string;
  existing?: Report;
  onSave: (values: Totals, notes: string) => Promise<string | null>;
}) {
  const [values, setValues] = useState<Totals>(() => {
    if (!existing) return emptyTotals();
    return Object.fromEntries(METRICS.map((m) => [m.key, existing[m.key]])) as Totals;
  });
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const set = (key: MetricKey, value: number) =>
    setValues((v) => ({ ...v, [key]: Math.max(0, Math.min(100000, Number.isFinite(value) ? value : 0)) }));

  return (
    <Card>
      <CardHeader
        title={`Relatório das ${slotLabel(slot)}`}
        description={existing ? "Já entregue. Você pode corrigir os números e reenviar." : "O que você fez desde o último relatório"}
      />
      <form
        className="flex flex-col gap-5 p-5 sm:p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setMessage(null);
          const error = await onSave(values, notes);
          setPending(false);
          setMessage(error ? { tone: "error", text: error } : { tone: "success", text: "Relatório enviado. Sua liderança já está vendo." });
        }}
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {METRICS.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 py-1.5 pr-1.5 pl-4">
              <label htmlFor={`m-${m.key}`} className="text-sm font-medium text-ink-2">
                {m.label}
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Diminuir ${m.label}`}
                  onClick={() => set(m.key, values[m.key] - 1)}
                  className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"
                >
                  <Minus className="size-4" />
                </button>
                <input
                  id={`m-${m.key}`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={values[m.key]}
                  onChange={(e) => set(m.key, Number(e.target.value.replace(/\D/g, "")))}
                  onFocus={(e) => e.target.select()}
                  className="h-9 w-12 rounded-lg bg-surface text-center font-display text-lg font-semibold tabular-nums outline-none focus:ring-2 focus:ring-brand-text"
                />
                <button
                  type="button"
                  aria-label={`Aumentar ${m.label}`}
                  onClick={() => set(m.key, values[m.key] + 1)}
                  className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-3 text-[13px] font-medium text-ink-2">
            Observação <span className="font-normal text-muted">opcional</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
            rows={2}
            placeholder="Algo que a liderança precise saber sobre este horário"
            className="min-h-16 w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] placeholder:text-muted/70 hover:border-line-strong focus:border-ink focus:outline-none"
          />
          {notes.length > NOTES_MAX - 50 ? (
            <span className="text-right text-xs text-muted tabular-nums">
              {notes.length} de {NOTES_MAX}
            </span>
          ) : null}
        </label>
        {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Enviando..." : existing ? "Atualizar relatório" : "Enviar relatório"}
        </Button>
      </form>
    </Card>
  );
}

function NotificationNudge() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // Leitura de API do navegador: só existe depois de montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow("Notification" in window && Notification.permission !== "granted");
  }, []);
  if (!show) return null;

  return (
    <Link
      href="/conta?aba=notificacoes"
      className="flex items-center gap-4 rounded-2xl border border-dashed border-line-strong p-4 text-sm transition-colors hover:bg-surface"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink">
        <BellRing className="size-5" />
      </span>
      <span>
        <span className="block font-medium">Ative os lembretes no celular</span>
        <span className="text-muted">Receba um aviso antes de cada horário de relatório.</span>
      </span>
    </Link>
  );
}
