"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import type { FormState } from "@/lib/validation";
import { updateMyName } from "./actions";

/** A própria pessoa corrige o nome. A liderança não edita o nome de ninguém. */
export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(updateMyName, {} as FormState);
  const current = state.values?.fullName ?? name;

  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <Field label="Nome e sobrenome" hint="É como você aparece para a liderança, nos relatórios e no ranking." error={state.fieldErrors?.fullName}>
        <Input name="fullName" autoComplete="name" defaultValue={current} key={current} maxLength={120} required />
      </Field>
      <Field label="E-mail de login" hint="Para trocar o e-mail, fale com o suporte.">
        <Input value={email} readOnly disabled />
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar nome"}
      </Button>
    </form>
  );
}
