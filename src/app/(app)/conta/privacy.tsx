"use client";

import { AlertTriangle } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import type { FormState } from "@/lib/validation";
import { deleteMyAccount } from "./account-actions";
import { cancelSubscription, type BillingState } from "./billing-actions";

/** Excluir a conta: pede para digitar o nome da empresa (dono) ou EXCLUIR (demais). */
export function DeleteAccountForm({ isOwner, orgName }: { isOwner: boolean; orgName: string }) {
  const [state, action, pending] = useActionState(deleteMyAccount, {} as FormState);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const expected = isOwner ? orgName : "EXCLUIR";
  const matches = isOwner ? typed.trim() === orgName : typed.trim().toUpperCase() === "EXCLUIR";

  return (
    <div className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex gap-3 rounded-xl bg-danger-soft p-4 text-sm text-danger">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        {isOwner ? (
          <p>
            Você é o administrador. Excluir a sua conta <strong>apaga a {orgName} inteira</strong>: equipes, membros, relatórios,
            clientes, agenda e metas. Ninguém da equipe consegue mais entrar, a assinatura é cancelada e não dá para desfazer.
            Antes, baixe os relatórios que quiser guardar.
          </p>
        ) : (
          <p>
            Seu nome, e-mail, aparelhos e avisos são apagados e o acesso é bloqueado de vez. Os números que você lançou ficam
            com a empresa, sem o seu nome, porque fazem parte do histórico da equipe. Não dá para desfazer.
          </p>
        )}
      </div>

      {open ? (
        <form action={action} className="flex flex-col gap-3" noValidate>
          {state.error ? <FormMessage>{state.error}</FormMessage> : null}
          <Field
            label={isOwner ? `Para confirmar, digite o nome da empresa: ${orgName}` : "Para confirmar, digite EXCLUIR"}
            error={state.fieldErrors?.confirmation}
          >
            <Input name="confirmation" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={expected} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={pending || !matches}>
              {pending ? "Excluindo..." : isOwner ? "Excluir a empresa e minha conta" : "Excluir minha conta"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="danger" className="self-start" onClick={() => setOpen(true)}>
          Quero excluir minha conta
        </Button>
      )}
    </div>
  );
}

/** Cancelar a assinatura: pede um segundo clique, porque para de cobrar na hora. */
export function CancelSubscriptionButton() {
  const [state, action, pending] = useActionState(cancelSubscription, {} as BillingState);
  const [armed, setArmed] = useState(false);

  if (state.success) return <FormMessage tone="success">{state.success}</FormMessage>;

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {armed ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
          <Button variant="ghost" onClick={() => setArmed(false)} disabled={pending}>
            Manter assinatura
          </Button>
        </div>
      ) : (
        <Button variant="secondary" className="self-start" onClick={() => setArmed(true)}>
          Cancelar assinatura
        </Button>
      )}
    </form>
  );
}
