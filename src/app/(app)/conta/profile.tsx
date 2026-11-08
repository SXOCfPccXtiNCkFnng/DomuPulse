"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import type { FormState } from "@/lib/validation";
import { updateMyName } from "./actions";

/** A própria pessoa corrige o nome e o nome de corretor. */
export function ProfileForm({
  name,
  brokerName,
  showBrokerName,
  nameOptional,
  email,
}: {
  name: string;
  brokerName: string;
  showBrokerName: boolean;
  /** Corretor: o nome de corretor basta, o nome completo é opcional. */
  nameOptional: boolean;
  email: string;
}) {
  const [state, action, pending] = useActionState(updateMyName, {} as FormState);
  const currentName = state.values?.fullName ?? (nameOptional && name === brokerName ? "" : name);
  const currentBroker = state.values?.brokerName ?? brokerName;

  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      {showBrokerName ? (
        <Field
          label="Nome de corretor"
          hint="É como você aparece para a liderança, nos relatórios, filtros e no ranking."
          error={state.fieldErrors?.brokerName}
        >
          <Input name="brokerName" defaultValue={currentBroker} key={`b${currentBroker}`} maxLength={80} required={nameOptional} />
        </Field>
      ) : null}
      <Field
        label={nameOptional ? "Nome completo" : "Nome e sobrenome"}
        hint={nameOptional ? "Opcional" : showBrokerName ? "Usado quando não há nome de corretor." : "É como você aparece para a liderança, nos relatórios e no ranking."}
        error={state.fieldErrors?.fullName}
      >
        <Input name="fullName" autoComplete="name" defaultValue={currentName} key={`n${currentName}`} maxLength={120} required={!nameOptional} />
      </Field>
      <Field label="E-mail de login" hint="Para trocar o e-mail, fale com o suporte.">
        <Input value={email} readOnly disabled />
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
