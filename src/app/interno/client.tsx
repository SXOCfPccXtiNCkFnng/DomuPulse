"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import type { FormState } from "@/lib/validation";
import { createCoupon } from "./actions";

// Ações que mexem no acesso de um cliente pedem um segundo clique.
export function ConfirmButton({ label, confirmLabel, danger = false }: { label: string; confirmLabel: string; danger?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button size="sm" variant={danger ? "ghost" : "secondary"} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Button size="sm" type="submit" variant={danger ? "danger" : "primary"}>
        {confirmLabel}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>
        Cancelar
      </Button>
    </span>
  );
}

export function CouponForm() {
  const [state, action, pending] = useActionState(createCoupon, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Código" error={state.fieldErrors?.code}>
          <Input name="code" placeholder="PILOTO20" className="uppercase" required />
        </Field>
        <Field label="Desconto (%)" error={state.fieldErrors?.percentOff}>
          <Input name="percentOff" type="number" min={1} max={100} required />
        </Field>
        <Field label="Limite de usos" hint="Vazio = sem limite" error={state.fieldErrors?.maxRedemptions}>
          <Input name="maxRedemptions" type="number" min={1} />
        </Field>
        <Field label="Válido até" hint="Vazio = sem prazo" error={state.fieldErrors?.expiresAt}>
          <Input name="expiresAt" type="date" />
        </Field>
      </div>
      <Field label="Descrição" hint="Só aparece aqui no painel" error={state.fieldErrors?.description}>
        <Input name="description" maxLength={200} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Criando..." : "Criar cupom"}
      </Button>
    </form>
  );
}
