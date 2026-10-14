"use client";

import clsx from "clsx";
import { Check, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { joinWithInvite, requestPasswordReset, signIn, signUp, updatePassword } from "@/app/(auth)/actions";
import { Captcha } from "@/components/captcha";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { PASSWORD_RULES } from "@/lib/password";
import { formatPhoneBR } from "@/lib/phone";
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
  const justSignedUp = params.get("cadastro") === "ok";
  const accountDeleted = params.get("conta") === "excluida";

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="proximo" value={params.get("proximo") ?? ""} />
      {state.error || queryError ? (
        <FormMessage>{state.error ?? queryError}</FormMessage>
      ) : accountDeleted ? (
        <FormMessage tone="success">Sua conta foi excluída. Obrigado por ter usado o Domu Pulse.</FormMessage>
      ) : justSignedUp ? (
        <FormMessage tone="success">Conta criada com sucesso. Entre com o e-mail e a senha que você cadastrou.</FormMessage>
      ) : null}
      <Field label="E-mail" error={state.fieldErrors?.email}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          defaultValue={state.values?.email}
          key={state.values?.email}
        />
      </Field>
      <PasswordField name="password" label="Senha" autoComplete="current-password" error={state.fieldErrors?.password} />
      <Link href="/recuperar-senha" className="-mt-1 self-end text-[13px] text-muted hover:text-ink">
        Esqueci minha senha
      </Link>
      <Captcha resetKey={state} />
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  const v = state.values ?? {};
  // key força os campos a reaparecerem com o valor devolvido pelo servidor.
  const k = JSON.stringify(v);

  return (
    <form action={action} className="relative flex flex-col gap-4" noValidate>
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
      <Field label="Nome e sobrenome" error={state.fieldErrors?.fullName}>
        <Input name="fullName" autoComplete="name" required autoFocus defaultValue={v.fullName} key={`n${k}`} />
      </Field>
      <Field label="Nome da imobiliária" error={state.fieldErrors?.orgName}>
        <Input name="orgName" autoComplete="organization" required defaultValue={v.orgName} key={`o${k}`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail de trabalho" error={state.fieldErrors?.email}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={v.email} key={`e${k}`} />
        </Field>
        <PhoneField error={state.fieldErrors?.whatsapp} defaultValue={v.whatsapp} key={`w${k}`} />
      </div>
      <PasswordField
        name="password"
        label="Crie uma senha"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        showRules
      />
      <TermsCheckbox error={state.fieldErrors?.acceptTerms} />
      <Captcha resetKey={state} />
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? "Criando conta..." : "Criar conta"}
      </Button>
    </form>
  );
}

/** Corretor entrando pelo link de convite da conta. */
export function JoinForm({ code, teams }: { code: string; teams: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(joinWithInvite, initial);
  const v = state.values ?? {};
  const k = JSON.stringify(v);

  return (
    <form action={action} className="relative flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      <input type="hidden" name="code" value={code} />
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      <Field label="Nome e sobrenome" error={state.fieldErrors?.fullName}>
        <Input name="fullName" autoComplete="name" required autoFocus defaultValue={v.fullName} key={`n${k}`} />
      </Field>
      <Field label="E-mail" error={state.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={v.email} key={`e${k}`} />
      </Field>
      {teams.length === 1 ? (
        <input type="hidden" name="teamId" value={teams[0].id} />
      ) : (
        <Field label="Sua equipe" error={state.fieldErrors?.teamId}>
          <Select name="teamId" required defaultValue={v.teamId ?? ""} key={`t${k}`}>
            <option value="" disabled>
              Escolha a equipe
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <PasswordField
        name="password"
        label="Crie uma senha"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        showRules
      />
      <TermsCheckbox error={state.fieldErrors?.acceptTerms} />
      <Captcha resetKey={state} />
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? "Entrando na equipe..." : "Entrar na equipe"}
      </Button>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.success) return <FormMessage tone="success">{state.success}</FormMessage>;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      <Field label="E-mail" error={state.fieldErrors?.email}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          defaultValue={state.values?.email}
          key={state.values?.email}
        />
      </Field>
      <Captcha resetKey={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Enviando..." : "Enviar link"}
      </Button>
    </form>
  );
}

export function NewPasswordForm({ needsTerms }: { needsTerms: boolean }) {
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      <PasswordField
        name="password"
        label="Nova senha"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        showRules
        autoFocus
      />
      <PasswordField name="confirm" label="Repita a senha" autoComplete="new-password" error={state.fieldErrors?.confirm} />
      {needsTerms ? <TermsCheckbox error={state.fieldErrors?.acceptTerms} /> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Salvando..." : "Salvar e entrar"}
      </Button>
    </form>
  );
}

// Controlado de propósito: o valor sobrevive à limpeza do formulário que o
// React faz depois do envio, e a lista de requisitos marca enquanto digita.
export function PasswordField({
  name,
  label,
  autoComplete,
  error,
  showRules = false,
  autoFocus,
}: {
  name: string;
  label: string;
  autoComplete: string;
  error?: string;
  showRules?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <Field label={label} error={error}>
        <span className="relative block">
          <Input
            name={name}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete}
            required
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setVisible((s) => !s)}
            aria-label={visible ? "Esconder senha" : "Mostrar senha"}
            className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-ink"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </span>
      </Field>
      {showRules ? (
        <ul aria-label="Requisitos da senha" className="grid gap-x-4 gap-y-1 pt-1 sm:grid-cols-2">
          {PASSWORD_RULES.map((rule) => {
            const ok = rule.test(value);
            return (
              <li
                key={rule.id}
                className={clsx("flex items-center gap-1.5 text-[13px] transition-colors", ok ? "text-brand-text" : "text-muted")}
              >
                <span
                  className={clsx(
                    "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                    ok ? "border-transparent bg-brand text-brand-ink" : "border-line-strong",
                  )}
                >
                  {ok ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                {rule.label}
                <span className="sr-only">{ok ? ", atendido" : ", pendente"}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function PhoneField({ error, defaultValue }: { error?: string; defaultValue?: string }) {
  const [value, setValue] = useState(() => formatPhoneBR(defaultValue ?? ""));
  return (
    <Field label="WhatsApp" error={error}>
      <Input
        name="whatsapp"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="(11) 99999 0000"
        required
        value={value}
        onChange={(e) => setValue(formatPhoneBR(e.target.value))}
        aria-invalid={Boolean(error) || undefined}
      />
    </Field>
  );
}

function TermsCheckbox({ error }: { error?: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-2">
        <input
          type="checkbox"
          name="acceptTerms"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
          aria-invalid={Boolean(error) || undefined}
        />
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
      {error ? <span className="text-[13px] text-danger">{error}</span> : null}
    </div>
  );
}
