"use client";

import clsx from "clsx";
import { ChevronRight, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { GOAL_METRICS, goalField, slotGoalField, type GoalMetric, type GoalPeriod } from "@/lib/goals";
import { formatNumber, METRICS } from "@/lib/metrics";
import { slotPeriodLabel } from "@/lib/time";
import type { FormState } from "@/lib/validation";
import { addCommission, saveGoals } from "./actions";

const DIALOG_CLASS =
  "mx-auto mt-auto mb-0 w-full max-w-none max-h-[92dvh] overflow-y-auto rounded-t-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50 sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-card";

const LABEL = Object.fromEntries(METRICS.map((m) => [m.key, m.label])) as Record<GoalMetric, string>;

function GoalInputs({
  period,
  values,
  errors,
}: {
  period: GoalPeriod;
  values?: Partial<Record<GoalMetric, number>>;
  errors?: Record<string, string>;
}) {
  return (
    <>
      {GOAL_METRICS.map((metric) => {
        const name = goalField(period, metric);
        return (
          <Field key={name} label={LABEL[metric]} error={errors?.[name]}>
            <Input name={name} type="number" min={0} max={100000} inputMode="numeric" defaultValue={values?.[metric] || ""} placeholder="0" />
          </Field>
        );
      })}
    </>
  );
}

export type SlotGoalValues = Record<string, Record<GoalMetric, number>>;

/** Tabela de metas por horário de relatório: uma linha por tarefa, uma coluna por horário. */
function SlotGoalGrid({ slots, values, errors }: { slots: string[]; values?: SlotGoalValues; errors?: Record<string, string> }) {
  const errorList = slots.flatMap((s) => GOAL_METRICS.map((m) => errors?.[slotGoalField(s, m)])).filter(Boolean);
  return (
    <div className="overflow-x-auto">
      {slots.map((s) => (
        <input key={s} type="hidden" name="slot" value={s} />
      ))}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="py-1.5 pr-2 text-left font-medium">Tarefa</th>
            {slots.map((s, i) => (
              <th key={s} className="px-1 py-1.5 text-center font-medium whitespace-nowrap">
                {slotPeriodLabel(slots, i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GOAL_METRICS.map((m) => (
            <tr key={m}>
              <td className="py-1 pr-2 whitespace-nowrap text-ink-2">{LABEL[m]}</td>
              {slots.map((s, i) => (
                <td key={s} className="px-1 py-1">
                  <Input
                    name={slotGoalField(s, m)}
                    aria-label={`${LABEL[m]}, ${slotPeriodLabel(slots, i)}`}
                    type="number"
                    min={0}
                    max={100000}
                    inputMode="numeric"
                    defaultValue={values?.[s]?.[m] || ""}
                    placeholder="0"
                    className="h-9 min-w-16 text-center"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {errorList.length ? <p className="mt-1 text-xs text-danger">{errorList[0]}</p> : null}
      <p className="mt-2 text-xs text-muted">Cada coluna é o que o corretor deve fazer naquele período, conferido no relatório daquele horário.</p>
    </div>
  );
}

type Tab = GoalPeriod | "slot";

export function BulkGoalsForm({ month, memberIds, slots, initialPeriod }: { month: string; memberIds: string[]; slots: string[]; initialPeriod?: Tab }) {
  const router = useRouter();
  const [period, setPeriod] = useState<Tab>(initialPeriod ?? "month");
  const [state, action, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const result = await saveGoals(prev, data);
    if (result.success) router.refresh();
    return result;
  }, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="period" value={period} />
      {memberIds.map((id) => (
        <input key={id} type="hidden" name="memberId" value={id} />
      ))}
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <PeriodTabs value={period} onChange={setPeriod} withSlots={slots.length > 0} />
      {period === "slot" ? (
        <SlotGoalGrid slots={slots} errors={state.fieldErrors} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <GoalInputs key={period} period={period} errors={state.fieldErrors} />
        </div>
      )}
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Aplicando..." : "Aplicar a todos"}
      </Button>
    </form>
  );
}

function PeriodTabs({ value, onChange, withSlots }: { value: Tab; onChange: (p: Tab) => void; withSlots: boolean }) {
  const tabs: [Tab, string][] = [
    ["month", "Meta do mês"],
    ["week", "Por semana"],
    ["day", "Por dia"],
    ...(withSlots ? ([["slot", "Por horário"]] as [Tab, string][]) : []),
  ];
  return (
    <div role="tablist" aria-label="Tipo de meta" className="flex max-w-full gap-1 self-start overflow-x-auto rounded-xl bg-surface-2 p-1">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={clsx(
            "h-8 shrink-0 rounded-lg px-3 text-[13px] font-medium transition-colors",
            value === key ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function GoalRowForm({
  month,
  memberId,
  memberName,
  values,
  slots,
  slotValues,
}: {
  month: string;
  memberId: string;
  memberName: string;
  values: Record<GoalPeriod, Record<GoalMetric, number>>;
  slots: string[];
  slotValues: SlotGoalValues;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("month");
  const [state, action, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const result = await saveGoals(prev, data);
    if (result.success) {
      dialog.current?.close();
      router.refresh();
    }
    return result;
  }, {} as FormState);

  // Abre o modal nativo quando o usuário clica em "Editar metas".
  useEffect(() => {
    const el = dialog.current;
    if (open && el && !el.open) el.showModal();
  }, [open]);

  const close = () => dialog.current?.close();

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="self-start lg:self-center">
        <Pencil className="size-3.5" />
        Editar metas
      </Button>
    );
  }

  // Todas as abas ficam montadas (só escondo as inativas), então um único
  // "Salvar" grava mês, semana, dia e horário de uma vez, sem apagar o resto.
  return (
    <dialog ref={dialog} onClose={() => setOpen(false)} onClick={(e) => e.target === dialog.current && close()} className={clsx(DIALOG_CLASS, "sm:w-[min(48rem,calc(100vw-2rem))]")}>
      <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="memberId" value={memberId} />
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">Editar metas</p>
            <h2 className="mt-0.5 truncate font-display text-xl font-semibold tracking-tight">{memberName}</h2>
          </div>
          <button type="button" onClick={close} aria-label="Fechar" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 sm:size-8">
            <X className="size-4" />
          </button>
        </header>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
        <PeriodTabs value={tab} onChange={setTab} withSlots={slots.length > 0} />
        <div className={clsx(tab !== "month" && "hidden")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <GoalInputs period="month" values={values.month} errors={state.fieldErrors} />
          </div>
        </div>
        <div className={clsx(tab !== "week" && "hidden")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <GoalInputs period="week" values={values.week} errors={state.fieldErrors} />
          </div>
        </div>
        <div className={clsx(tab !== "day" && "hidden")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <GoalInputs period="day" values={values.day} errors={state.fieldErrors} />
          </div>
        </div>
        {slots.length > 0 ? (
          <div className={clsx(tab !== "slot" && "hidden")}>
            <SlotGoalGrid slots={slots} values={slotValues} errors={state.fieldErrors} />
          </div>
        ) : null}
        <p className="text-xs text-muted">Salvar grava todas as abas. Deixar em zero apaga aquela meta.</p>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={close}>
            Cancelar
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export type GoalParticipant = { name: string; target: number; actual: number };
export type CreatedGoal = {
  key: string;
  title: string;
  subtitle: string;
  target: number | null;
  participants: GoalParticipant[];
  showProgress: boolean;
};

function MiniProgress({ actual, target }: { actual: number; target: number }) {
  const pct = target ? Math.min(100, (actual / target) * 100) : 0;
  return (
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
      <div className={clsx("h-full rounded-full", pct >= 100 ? "bg-brand" : "bg-brand-text")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Lista das metas criadas no período; clicar abre os corretores e o progresso. */
export function CreatedGoals({ goals }: { goals: CreatedGoal[] }) {
  const [active, setActive] = useState<CreatedGoal | null>(null);
  if (!goals.length) {
    return <p className="px-6 py-10 text-center text-sm text-muted">Nenhuma meta criada para este período.</p>;
  }
  return (
    <>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {goals.map((g) => {
          const totalTarget = g.participants.reduce((s, p) => s + p.target, 0);
          const totalActual = g.participants.reduce((s, p) => s + p.actual, 0);
          const pct = totalTarget ? Math.min(100, (totalActual / totalTarget) * 100) : 0;
          const count = g.participants.length;
          return (
            <li key={g.key}>
              <button type="button" onClick={() => setActive(g)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2 sm:px-6">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{g.title}</span>
                  <span className="block text-xs text-muted">
                    {g.subtitle} · {count} {count === 1 ? "corretor" : "corretores"}
                    {g.target !== null ? ` · alvo ${formatNumber(g.target)}` : ""}
                  </span>
                </span>
                {g.showProgress ? (
                  <span className="hidden w-40 shrink-0 sm:block">
                    <span className="flex justify-between text-xs">
                      <span className="text-muted">equipe</span>
                      <span className="tabular-nums">
                        {formatNumber(totalActual)} / {formatNumber(totalTarget)}
                      </span>
                    </span>
                    <span className="mt-1 block h-2 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full bg-brand-text" style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                ) : null}
                <ChevronRight className="size-4 shrink-0 text-muted" />
              </button>
            </li>
          );
        })}
      </ul>
      {active ? <CreatedGoalModal goal={active} onClose={() => setActive(null)} /> : null}
    </>
  );
}

function CreatedGoalModal({ goal, onClose }: { goal: CreatedGoal; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => dialog.current?.close();
  const sorted = [...goal.participants].sort((a, b) => (goal.showProgress ? b.actual - a.actual : a.name.localeCompare(b.name)));
  return (
    <dialog ref={dialog} onClose={onClose} onClick={(e) => e.target === dialog.current && close()} className={clsx(DIALOG_CLASS, "sm:w-[min(32rem,calc(100vw-2rem))]")}>
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">{goal.subtitle}</p>
            <h2 className="mt-0.5 font-display text-xl font-semibold tracking-tight">
              {goal.title}
              {goal.target !== null ? <span className="text-muted"> · alvo {formatNumber(goal.target)}</span> : null}
            </h2>
          </div>
          <button type="button" onClick={close} aria-label="Fechar" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 sm:size-8">
            <X className="size-4" />
          </button>
        </header>
        <ul className="flex flex-col gap-3.5">
          {sorted.map((p) => (
            <li key={p.name}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={p.name} />
                  <span className="truncate font-medium">{p.name}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{formatNumber(p.actual)}</span>
                  <span className="text-muted"> de {formatNumber(p.target)}</span>
                </span>
              </div>
              {goal.showProgress ? <MiniProgress actual={p.actual} target={p.target} /> : null}
            </li>
          ))}
        </ul>
        {!goal.showProgress ? <p className="text-xs text-muted">O progresso aparece no mês em andamento.</p> : null}
      </div>
    </dialog>
  );
}

export function CommissionForm({
  brokers,
  defaultDate,
  min,
  max,
}: {
  brokers: { id: string; name: string }[] | null;
  defaultDate: string;
  min: string;
  max: string;
}) {
  const [state, action, pending] = useActionState(addCommission, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      {brokers ? (
        <Field label="Corretor" error={state.fieldErrors?.memberId}>
          <Select name="memberId" required>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Recebida em" error={state.fieldErrors?.receivedOn}>
          <Input name="receivedOn" type="date" defaultValue={defaultDate} min={min} max={max} required />
        </Field>
        <Field label="Valor (R$)" error={state.fieldErrors?.amount}>
          <Input name="amount" inputMode="decimal" placeholder="1.500,00" required />
        </Field>
      </div>
      <Field label="Descrição" hint="Opcional, como o imóvel ou o cliente">
        <Input name="description" maxLength={200} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Lançando..." : "Lançar comissão"}
      </Button>
    </form>
  );
}
