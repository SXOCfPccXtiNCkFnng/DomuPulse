"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import type { FormState } from "@/lib/validation";
import { addSignupAlertEmail, createCoupon, removeSignupAlertEmail, setMonthlyPrice } from "./actions";

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
  const [kind, setKind] = useState<"percent" | "days">("days");
  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Código" error={state.fieldErrors?.code}>
          <Input name="code" placeholder="AMIGO30" className="uppercase" required />
        </Field>
        <Field label="Tipo">
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as "percent" | "days")}>
            <option value="days">Dias grátis</option>
            <option value="percent">Desconto (%)</option>
          </Select>
        </Field>
        <Field label={kind === "days" ? "Quantos dias" : "Desconto (%)"} error={state.fieldErrors?.amount}>
          <Input name="amount" type="number" min={1} max={kind === "days" ? 365 : 100} required />
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

export function PriceForm({ currentCents }: { currentCents: number }) {
  const [state, action, pending] = useActionState(setMonthlyPrice, {} as FormState);
  const current = (currentCents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
  return (
    <form action={action} className="flex flex-col gap-3 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <div className="flex items-start gap-2">
        <Field label="Valor em reais" error={state.fieldErrors?.price} className="flex-1">
          <Input name="price" inputMode="decimal" defaultValue={current} key={current} required />
        </Field>
        <Button type="submit" disabled={pending} className="mt-6 h-11">
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}

export function SignupAlertEmailsCard({ initialEmails }: { initialEmails: string[] }) {
  const [state, action, pending] = useActionState(addSignupAlertEmail, {} as FormState);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isPendingRemove, startTransition] = useTransition();

  const handleRemove = (email: string) => {
    setRemoveError(null);
    setRemovingEmail(email);
    startTransition(async () => {
      const res = await removeSignupAlertEmail(email);
      if (res?.error) {
        setRemoveError(res.error);
      }
      setRemovingEmail(null);
    });
  };

  return (
    <div className="flex flex-col gap-4 p-5 sm:p-6">
      <p className="text-xs text-muted">
        Estes e-mails recebem um alerta instantâneo com os dados (nome, WhatsApp, imobiliária e e-mail) sempre que um novo cliente pagante se cadastrar.
      </p>

      {removeError ? <FormMessage>{removeError}</FormMessage> : null}

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted">E-mails configurados</label>
        {initialEmails.length === 0 ? (
          <p className="text-sm text-muted">Nenhum e-mail configurado.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {initialEmails.map((email) => (
              <li
                key={email}
                className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm"
              >
                <span className="truncate font-medium">{email}</span>
                {initialEmails.length > 1 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPendingRemove && removingEmail === email}
                    onClick={() => handleRemove(email)}
                    className="h-7 px-2 text-xs text-danger hover:bg-danger/10"
                    title="Remover e-mail"
                  >
                    {isPendingRemove && removingEmail === email ? "Removendo..." : "Remover"}
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted">Padrão</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form action={action} className="mt-2 flex flex-col gap-3" noValidate>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
        {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
        <div className="flex items-start gap-2">
          <Field label="Adicionar outro e-mail para alertas" error={state.fieldErrors?.email} className="flex-1">
            <Input name="email" type="email" placeholder="outro@exemplo.com" required />
          </Field>
          <Button type="submit" disabled={pending} className="mt-6 h-11 shrink-0">
            {pending ? "Adicionando..." : "Adicionar"}
          </Button>
        </div>
      </form>
    </div>
  );
}

