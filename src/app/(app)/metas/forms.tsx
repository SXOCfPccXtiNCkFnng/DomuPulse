"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { GOAL_METRICS, type GoalMetric } from "@/lib/goals";
import { METRICS } from "@/lib/metrics";
import type { FormState } from "@/lib/validation";
import { addCommission, saveGoals } from "./actions";

const LABEL = Object.fromEntries(METRICS.map((m) => [m.key, m.label])) as Record<GoalMetric, string>;

function GoalInputs({ values, errors }: { values?: Partial<Record<GoalMetric, number>>; errors?: Record<string, string> }) {
  return (
    <>
      {GOAL_METRICS.map((metric) => (
        <Field key={metric} label={LABEL[metric]} error={errors?.[metric]}>
          <Input name={metric} type="number" min={0} max={100000} inputMode="numeric" defaultValue={values?.[metric] || ""} placeholder="0" />
        </Field>
      ))}
    </>
  );
}

export function BulkGoalsForm({ month, memberIds }: { month: string; memberIds: string[] }) {
  const [state, action, pending] = useActionState(saveGoals, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      <input type="hidden" name="month" value={month} />
      {memberIds.map((id) => (
        <input key={id} type="hidden" name="memberId" value={id} />
      ))}
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GoalInputs errors={state.fieldErrors} />
      </div>
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Aplicando..." : "Aplicar a todos"}
      </Button>
    </form>
  );
}

export function GoalRowForm({ month, memberId, values }: { month: string; memberId: string; values: Record<GoalMetric, number> }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const result = await saveGoals(prev, data);
    if (result.success) setOpen(false);
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <GoalInputs values={values} errors={state.fieldErrors} />
      </div>
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
