"use client";

import clsx from "clsx";
import { BellRing, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { announceReport, pushGoalNotices } from "@/app/(app)/painel/actions";
import { type QuickEntry, QuickReport } from "@/components/live/quick-report";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { Funnel, SlotChip, type SlotStatus } from "@/components/live/viz";
import { REPORT_SELECT, useLiveDay } from "@/lib/live/use-live-day";
import { emptyTotals, METRICS, sumReports, type MetricKey, type Report, type Totals } from "@/lib/metrics";
import type { getBrowserClient } from "@/lib/supabase/client";
import { addDays, formatDate, formatLongDate, normalizeSlot, slotLabel, slotPeriodLabel, slotState, startOfMonth, startOfWeek } from "@/lib/time";
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

  const goals = usePeriodGoals(supabase, member.id, clock.today);
  const slotGoals = Object.fromEntries(
    goals.filter((g) => g.period === "slot" && g.slot && normalizeSlot(g.slot) === normalizeSlot(slot)).map((g) => [g.metric, g.target]),
  ) as Partial<Totals>;
  const slotIndex = [...slots].map(normalizeSlot).sort().indexOf(normalizeSlot(slot));

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

  const firstName = member.displayName.split(" ")[0];
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

      <NotificationNudge />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* No celular o relatório (com o relatório rápido) vem primeiro; os horários descem. */}
          <section aria-label="Horários de hoje" className="grid grid-cols-2 gap-3 max-sm:order-last sm:grid-cols-4">
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
            memberId={member.id}
            today={clock.today}
            supabase={supabase}
            existing={live.reportFor(member.id, slot)}
            goals={slotGoals}
            periodLabel={slotIndex >= 0 ? slotPeriodLabel([...slots].map(normalizeSlot).sort(), slotIndex) : null}
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
              void pushGoalNotices().catch(() => {});
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
          <DailyGoals memberId={member.id} today={clock.today} totals={totals} goals={goals.filter((g) => g.period !== "slot")} supabase={supabase} />
        </div>
      </div>
    </div>
  );
}

type PeriodGoal = { metric: MetricKey; target: number; period: "week" | "day" | "slot"; slot: string | null };

/** Metas por semana, por dia e por horário do corretor no mês de hoje. */
function usePeriodGoals(supabase: ReturnType<typeof getBrowserClient>, memberId: string, today: string) {
  const [goals, setGoals] = useState<PeriodGoal[]>([]);
  const month = startOfMonth(today);
  useEffect(() => {
    let alive = true;
    void supabase
      .from("goals")
      .select("metric, target, period, slot")
      .eq("member_id", memberId)
      .eq("month", month)
      .in("period", ["week", "day", "slot"])
      .then(({ data }) => {
        if (alive) setGoals((data ?? []) as PeriodGoal[]);
      });
    return () => {
      alive = false;
    };
  }, [supabase, memberId, month]);
  return goals;
}

/**
 * Metas por semana e por dia definidas pela liderança. O dia usa os relatórios
 * de hoje (ao vivo); a semana soma os dias anteriores desde segunda com hoje.
 */
function DailyGoals({
  memberId,
  today,
  totals,
  goals,
  supabase,
}: {
  memberId: string;
  today: string;
  totals: Totals;
  goals: PeriodGoal[];
  supabase: ReturnType<typeof getBrowserClient>;
}) {
  // Guardado com a semana a que pertence: na virada para segunda, o da semana passada some.
  const [earlier, setEarlier] = useState<{ week: string; totals: Totals } | null>(null);
  const weekStart = startOfWeek(today);
  const earlierInWeek = earlier?.week === weekStart ? earlier.totals : emptyTotals();
  const hasWeekly = goals.some((g) => g.period === "week");

  useEffect(() => {
    let alive = true;
    if (hasWeekly && weekStart < today) {
      void supabase.rpc("report_totals_by_member", { p_from: weekStart, p_to: addDays(today, -1) }).then(({ data }) => {
        const row = ((data ?? []) as Record<string, unknown>[]).find((r) => r.member_id === memberId);
        if (alive) setEarlier({ week: weekStart, totals: Object.fromEntries(METRICS.map((m) => [m.key, Number(row?.[m.key] ?? 0)])) as Totals });
      });
    }
    return () => {
      alive = false;
    };
  }, [supabase, memberId, weekStart, today, hasWeekly]);

  if (goals.length === 0) return null;
  return (
    <>
      {(["week", "day"] as const).map((period) => {
        const list = goals.filter((g) => g.period === period);
        if (list.length === 0) return null;
        const actualOf = (key: MetricKey) => totals[key] + (period === "week" ? earlierInWeek[key] : 0);
        return (
          <GoalCard
            key={period}
            title={period === "week" ? "Meta da semana" : "Meta do dia"}
            subtitle={period === "week" ? `${formatDate(weekStart)} a ${formatDate(addDays(weekStart, 6))}` : null}
            goals={list}
            actualOf={actualOf}
          />
        );
      })}
    </>
  );
}

function GoalCard({
  title,
  subtitle,
  goals,
  actualOf,
}: {
  title: string;
  subtitle: string | null;
  goals: PeriodGoal[];
  actualOf: (key: MetricKey) => number;
}) {
  const ordered = METRICS.filter((m) => goals.some((g) => g.metric === m.key));
  const hit = ordered.filter((m) => actualOf(m.key) >= (goals.find((g) => g.metric === m.key)?.target ?? Infinity)).length;

  return (
    <Card>
      <CardHeader
        title={title}
        description={`${subtitle ? `${subtitle} · ` : ""}${hit} de ${ordered.length} ${ordered.length === 1 ? "meta batida" : "metas batidas"}`}
      />
      <ul className="flex flex-col gap-3 p-5 sm:p-6">
        {ordered.map((m) => {
          const target = goals.find((g) => g.metric === m.key)!.target;
          const actual = actualOf(m.key);
          const pct = Math.min(100, (actual / target) * 100);
          return (
            <li key={m.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-ink-2">{m.label}</span>
                <span className="tabular-nums">
                  <span className="font-semibold">{actual}</span>
                  <span className="text-muted"> de {target}</span>
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2"
                role="meter"
                aria-label={`${m.label}: ${actual} de ${target}`}
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={actual}
              >
                <div className={clsx("h-full rounded-full", pct >= 100 ? "bg-brand" : "bg-brand-text")} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function greeting(minutes: number) {
  if (minutes < 12 * 60) return "Bom dia";
  if (minutes < 18 * 60) return "Boa tarde";
  return "Boa noite";
}

const clampMetric = (n: number) => Math.max(0, Math.min(100000, Number.isFinite(n) ? Math.round(n) : 0));

function ReportForm({
  slot,
  memberId,
  today,
  supabase,
  existing,
  goals,
  periodLabel,
  onSave,
}: {
  slot: string;
  memberId: string;
  today: string;
  supabase: ReturnType<typeof getBrowserClient>;
  existing?: Report;
  /** Meta deste horário por tarefa (definida pela liderança). */
  goals: Partial<Totals>;
  periodLabel: string | null;
  onSave: (values: Totals, notes: string) => Promise<string | null>;
}) {
  const goalKeys = METRICS.filter((m) => (goals[m.key] ?? 0) > 0).map((m) => m.key);
  const [values, setValues] = useState<Totals>(() => {
    if (!existing) return emptyTotals();
    return Object.fromEntries(METRICS.map((m) => [m.key, existing[m.key]])) as Totals;
  });
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [entries, setEntries] = useState<QuickEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [draftState, setDraftState] = useState<"none" | "restored" | "saving" | "saved" | "error">("none");
  const [loaded, setLoaded] = useState(false);
  // Só salva rascunho depois que a pessoa mexe em algo.
  const dirty = useRef(false);
  const draftKey = useMemo(() => ({ member_id: memberId, report_date: today, report_slot: slot }), [memberId, today, slot]);

  useEffect(() => {
    let alive = true;
    supabase
      .from("report_drafts")
      .select("totals, notes, entries")
      .match(draftKey)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        if (data && !dirty.current) {
          const totals = (data.totals ?? {}) as Record<string, unknown>;
          setValues(Object.fromEntries(METRICS.map((m) => [m.key, clampMetric(Number(totals[m.key]))])) as Totals);
          setNotes((data.notes as string | null) ?? "");
          setEntries(Array.isArray(data.entries) ? (data.entries as QuickEntry[]) : []);
          setDraftState("restored");
        }
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [supabase, draftKey]);

  useEffect(() => {
    if (!loaded || !dirty.current) return;
    const t = setTimeout(async () => {
      // Enviado enquanto o timer corria: não recria o rascunho.
      if (!dirty.current) return;
      setDraftState("saving");
      const { error } = await supabase
        .from("report_drafts")
        .upsert({ ...draftKey, totals: values, notes: notes.trim() || null, entries: entries.slice(-100) }, { onConflict: "member_id,report_date,report_slot" });
      setDraftState(error ? "error" : "saved");
    }, 800);
    return () => clearTimeout(t);
  }, [supabase, draftKey, values, notes, entries, loaded]);

  const touch = () => {
    dirty.current = true;
    setMessage(null);
  };
  const set = (key: MetricKey, value: number) => {
    touch();
    setValues((v) => ({ ...v, [key]: clampMetric(value) }));
  };
  const apply = (deltas: QuickEntry["deltas"], sign: 1 | -1) =>
    setValues((v) => {
      const next = { ...v };
      for (const [k, n] of Object.entries(deltas)) next[k as MetricKey] = clampMetric(next[k as MetricKey] + sign * (n ?? 0));
      return next;
    });

  return (
    <Card>
      <CardHeader
        title={`Relatório das ${slotLabel(slot)}`}
        description={
          (existing ? "Já entregue. Você pode corrigir os números e reenviar." : "O que você fez desde o último relatório") +
          (goalKeys.length
            ? ` · Meta ${periodLabel ? `(${periodLabel.toLowerCase()})` : "do horário"}: ${goalKeys.filter((k) => values[k] >= goals[k]!).length} de ${goalKeys.length} batidas`
            : "")
        }
        action={
          draftState === "none" ? undefined : (
            <span className={clsx("text-[13px] whitespace-nowrap", draftState === "error" ? "text-danger" : "text-muted")}>
              {draftState === "restored" ? "Rascunho recuperado" : draftState === "saving" ? "Salvando..." : draftState === "saved" ? "Rascunho salvo" : "Rascunho não salvo"}
            </span>
          )
        }
      />
      <div className="pt-4">
        <QuickReport
          current={values}
          entries={entries}
          onEntry={(entry) => {
            touch();
            apply(entry.deltas, 1);
            if (entry.note) setNotes((n) => (n.trim() ? `${n.trim()} · ${entry.note}` : entry.note!).slice(0, NOTES_MAX));
            setEntries([entry]);
          }}
          onUndo={(entry) => {
            touch();
            apply(entry.deltas, -1);
            if (entry.note) setNotes((n) => n.replace(` · ${entry.note}`, "").replace(entry.note!, "").trim());
            setEntries([]);
          }}
          onDismiss={() => {
            touch();
            setEntries([]);
          }}
        />
      </div>
      <form
        className="flex flex-col gap-5 p-5 sm:p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setMessage(null);
          const error = await onSave(values, notes);
          if (!error) {
            // Enviado: o rascunho cumpriu o papel.
            dirty.current = false;
            await supabase.from("report_drafts").delete().match(draftKey);
            setEntries([]);
            setDraftState("none");
          }
          setPending(false);
          setMessage(error ? { tone: "error", text: error } : { tone: "success", text: "Relatório enviado. Sua liderança já está vendo." });
        }}
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {METRICS.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 py-1.5 pr-1.5 pl-4">
              <label htmlFor={`m-${m.key}`} className="flex flex-col text-sm font-medium text-ink-2">
                {m.label}
                {goals[m.key] ? (
                  <span className={clsx("text-xs font-normal", values[m.key] >= goals[m.key]! ? "text-brand-text" : "text-muted")}>
                    {values[m.key] >= goals[m.key]! ? `Meta batida (${goals[m.key]})` : `Meta: ${goals[m.key]} · faltam ${goals[m.key]! - values[m.key]}`}
                  </span>
                ) : null}
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
            onChange={(e) => {
              touch();
              setNotes(e.target.value.slice(0, NOTES_MAX));
            }}
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

type NudgeState = "install" | "denied" | "off";

const NUDGE: Record<NudgeState, { title: string; text: string }> = {
  install: {
    title: "Instale o Pulse no iPhone para receber os lembretes",
    text: "No Safari, toque em Compartilhar e em “Adicionar à Tela de Início”. Depois abra por lá e ative as notificações.",
  },
  denied: {
    title: "As notificações estão bloqueadas neste aparelho",
    text: "Libere nas configurações do navegador para receber o aviso antes de cada relatório.",
  },
  off: {
    title: "Ative os lembretes neste aparelho",
    text: "Receba um aviso 10 minutos antes de cada horário de relatório, mesmo com o Pulse fechado.",
  },
};

/** Mostra o que falta para este aparelho receber os lembretes de relatório. */
function NotificationNudge() {
  const [state, setState] = useState<NudgeState | null>(null);
  useEffect(() => {
    let alive = true;
    (async (): Promise<NudgeState | null> => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      // No iPhone, o push só existe com o app instalado na tela de início.
      if (ios && !window.matchMedia("(display-mode: standalone)").matches) return "install";
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return null;
      if (Notification.permission === "denied") return "denied";
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      return sub ? null : "off";
    })()
      .then((s) => alive && setState(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!state) return null;

  return (
    <Link
      href="/conta?aba=notificacoes"
      className="flex items-center gap-4 rounded-2xl border border-dashed border-line-strong p-4 text-sm transition-colors animate-rise hover:bg-surface"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink">
        <BellRing className="size-5" />
      </span>
      <span>
        <span className="block font-medium">{NUDGE[state].title}</span>
        <span className="text-muted">{NUDGE[state].text}</span>
      </span>
    </Link>
  );
}
