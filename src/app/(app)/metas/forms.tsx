"use client";

import clsx from "clsx";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { GOAL_METRICS, goalField, slotGoalField, type GoalMetric, type GoalPeriod } from "@/lib/goals";
import { METRICS } from "@/lib/metrics";
import { slotPeriodLabel } from "@/lib/time";
import type { FormState } from "@/lib/validation";
import { addCommission, saveGoals } from "./actions";

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

export function BulkGoalsForm({ month, memberIds, slots }: { month: string; memberIds: string[]; slots: string[] }) {
  const router = useRouter();
  const [period, setPeriod] = useState<Tab>("month");
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
  values,
  slots,
  slotValues,
}: {
  month: string;
  memberId: string;
  values: Record<GoalPeriod, Record<GoalMetric, number>>;
  slots: string[];
  slotValues: SlotGoalValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const result = await saveGoals(prev, data);
    if (result.success) {
      setOpen(false);
      router.refresh();
    }
    return result;
  }, {} as FormState);

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="self-start lg:self-center">
        <Pencil className="size-3.5" />
        Editar metas
      </Button>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-3 rounded-xl bg-surface-2 p-3 lg:w-[34rem]" noValidate>
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="memberId" value={memberId} />
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Meta do mês</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <GoalInputs period="month" values={values.month} errors={state.fieldErrors} />
      </div>
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Meta por semana</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <GoalInputs period="week" values={values.week} errors={state.fieldErrors} />
      </div>
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Meta por dia</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <GoalInputs period="day" values={values.day} errors={state.fieldErrors} />
      </div>
      {slots.length > 0 ? (
        <>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Meta por horário de relatório</p>
          <SlotGoalGrid slots={slots} values={slotValues} errors={state.fieldErrors} />
        </>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
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
