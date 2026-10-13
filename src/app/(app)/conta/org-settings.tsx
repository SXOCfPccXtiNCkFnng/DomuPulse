"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { BR_TIMEZONES, MAX_SLOTS } from "@/lib/org-settings";
import type { FormState } from "@/lib/validation";
import { updateOrgSettings } from "./org-actions";

export function OrgSettingsForm({ name, timezone, slots }: { name: string; timezone: string; slots: string[] }) {
  const [state, action, pending] = useActionState(updateOrgSettings, {} as FormState);
  // Controlados: continuam como a pessoa deixou se o servidor recusar.
  const [orgName, setOrgName] = useState(name);
  const [tz, setTz] = useState(timezone);
  const [times, setTimes] = useState(slots);

  return (
    <form action={action} className="flex flex-col gap-5 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da imobiliária" error={state.fieldErrors?.name}>
          <Input name="name" value={orgName} onChange={(e) => setOrgName(e.target.value)} required maxLength={120} />
        </Field>
        <Field label="Fuso horário" error={state.fieldErrors?.timezone}>
          <Select name="timezone" value={tz} onChange={(e) => setTz(e.target.value)}>
            {BR_TIMEZONES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-medium text-ink-2">Horários de relatório</legend>
        <p className="text-[13px] text-muted">
          Os corretores enviam os números nesses horários e recebem lembrete 10 minutos antes. Entre 06:00 e 23:00, com pelo
          menos 1 hora de distância.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {times.map((t, i) => (
            <span key={i} className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 py-1 pr-1 pl-2">
              <input
                type="time"
                name="slot"
                value={t}
                step={900}
                onChange={(e) => setTimes((list) => list.map((v, j) => (j === i ? e.target.value : v)))}
                aria-label={`Horário ${i + 1}`}
                className="bg-transparent text-sm tabular-nums outline-none"
              />
              {times.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setTimes((list) => list.filter((_, j) => j !== i))}
                  aria-label={`Remover horário ${t}`}
                  className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </span>
          ))}
          {times.length < MAX_SLOTS ? (
            <Button size="sm" variant="ghost" onClick={() => setTimes((list) => [...list, ""])} className="h-10">
              <Plus className="size-4" />
              Adicionar horário
            </Button>
          ) : null}
        </div>
        {state.fieldErrors?.slots ? <span className="text-[13px] text-danger">{state.fieldErrors.slots}</span> : null}
      </fieldset>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar configurações"}
      </Button>
    </form>
  );
}
