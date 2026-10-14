"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/validation";
import { acceptUpdatedTerms } from "./actions";

export function AcceptTermsForm() {
  const [state, action, pending] = useActionState(acceptUpdatedTerms, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-2">
        <input type="checkbox" name="acceptTerms" className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" />
        <span>
          Li e aceito os{" "}
          <Link href="/termos" target="_blank" className="font-medium text-ink underline underline-offset-4">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" target="_blank" className="font-medium text-ink underline underline-offset-4">
            Política de Privacidade
          </Link>
          .
        </span>
      </label>
      {state.fieldErrors?.acceptTerms ? <span className="text-[13px] text-danger">{state.fieldErrors.acceptTerms}</span> : null}
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Registrando..." : "Aceitar e continuar"}
      </Button>
    </form>
  );
}
