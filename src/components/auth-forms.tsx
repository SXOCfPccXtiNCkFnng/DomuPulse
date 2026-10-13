"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import type { FormState } from "@/lib/validation";

const initial: FormState = {};

const QUERY_ERRORS: Record<string, string> = {
  "sem-acesso": "Sua conta não está vinculada a nenhuma equipe ativa. Fale com o administrador.",
  "link-invalido": "Este link expirou ou já foi usado. Peça um novo.",
};

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  const params = useSearchParams();
  const queryError = QUERY_ERRORS[params.get("erro") ?? ""];

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="proximo" value={params.get("proximo") ?? ""} />
      {state.error || queryError ? <FormMessage>{state.error ?? queryError}</FormMessage> : null}
      <Field label="E-mail" error={state.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
      </Field>
      <Field label="Senha" error={state.fieldErrors?.password}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Link href="/recuperar-senha" className="-mt-1 self-end text-[13px] text-muted hover:text-ink">
        Esqueci minha senha
      </Link>
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, initial);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {/* Armadilha para robôs: escondido de pessoas e de leitores de tela. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      <Field label="Seu nome" error={state.fieldErrors?.fullName}>
        <Input name="fullName" autoComplete="name" required autoFocus />
      </Field>
      <Field label="Nome da imobiliária" error={state.fieldErrors?.orgName}>
        <Input name="orgName" autoComplete="organization" required />
      </Field>
      <Field label="E-mail de trabalho" error={state.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required />
      </Field>
      <Field
        label="Senha"
        error={state.fieldErrors?.password}
        hint="Mínimo de 10 caracteres, com maiúscula, minúscula e número."
      >
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? "Criando conta..." : "Começar teste grátis"}
      </Button>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.success) return <FormMessage tone="success">{state.success}</FormMessage>;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="E-mail" error={state.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Enviando..." : "Enviar link"}
      </Button>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      <Field
        label="Nova senha"
        error={state.fieldErrors?.password}
        hint="Mínimo de 10 caracteres, com maiúscula, minúscula e número."
      >
        <Input name="password" type="password" autoComplete="new-password" required autoFocus />
      </Field>
      <Field label="Repita a senha" error={state.fieldErrors?.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Salvando..." : "Salvar e entrar"}
      </Button>
    </form>
  );
}
