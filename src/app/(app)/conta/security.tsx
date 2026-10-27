"use client";

import { Copy, Download, KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { PasswordField } from "@/components/auth-forms";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { getBrowserClient } from "@/lib/supabase/client";
import type { FormState } from "@/lib/validation";
import { changePassword, clearMyRecoveryCodes, createRecoveryCodes, signOutEverywhere } from "./security-actions";

type MfaState =
  | { kind: "loading" }
  | { kind: "unknown" }
  | { kind: "off" }
  | { kind: "enrolling"; factorId: string; qr: string; secret: string }
  | { kind: "codes"; codes: string[] }
  | { kind: "on"; factorId: string; since: string };

export function MfaSettings() {
  const supabase = useMemo(() => getBrowserClient(), []);
  const router = useRouter();
  const [state, setState] = useState<MfaState>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (cancelled) return;
      // Se a checagem falhar, não dizer "desligado" (apareceria "Ativar" por
      // engano, escondendo um 2FA que existe): mostrar que não deu para ler.
      if (error || !data) return setState({ kind: "unknown" });
      const verified = data.totp.find((f) => f.status === "verified");
      setState(verified ? { kind: "on", factorId: verified.id, since: verified.created_at } : { kind: "off" });
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, reload]);

  async function start() {
    setBusy(true);
    setError(null);
    // Tentativas anteriores não concluídas ficam pendentes: limpa antes.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Domu Pulse ${new Date().toISOString().slice(0, 16)}`,
      issuer: "Domu Pulse",
    });
    setBusy(false);
    if (error || !data) return setError("Não foi possível começar agora. Tente de novo.");
    setState({ kind: "enrolling", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== "enrolling" || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code });
    if (error) {
      setBusy(false);
      setCode("");
      return setError("Código incorreto. Confira se o horário do celular está certo e tente de novo.");
    }
    setCode("");
    // 2FA ativo: já entrega os códigos de recuperação para a pessoa guardar.
    const res = await createRecoveryCodes();
    setBusy(false);
    setState("codes" in res ? { kind: "codes", codes: res.codes } : { kind: "on", factorId: state.factorId, since: new Date().toISOString() });
    router.refresh();
  }

  async function disable() {
    if (state.kind !== "on") return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: state.factorId });
    if (error) {
      setBusy(false);
      setConfirmOff(false);
      return setError("Não foi possível desativar. Entre de novo com o código e tente outra vez.");
    }
    await clearMyRecoveryCodes().catch(() => {});
    setBusy(false);
    setConfirmOff(false);
    setState({ kind: "off" });
    router.refresh();
  }

  async function regenCodes() {
    setBusy(true);
    setError(null);
    const res = await createRecoveryCodes();
    setBusy(false);
    if ("codes" in res) setState({ kind: "codes", codes: res.codes });
    else setError(res.error);
  }

  return (
    <div className="flex flex-col gap-4 p-5 sm:p-6">
      {error ? <FormMessage>{error}</FormMessage> : null}

      {state.kind === "loading" ? <p className="text-sm text-muted">Verificando.</p> : null}

      {state.kind === "unknown" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2">Não foi possível verificar o estado da verificação em duas etapas agora.</p>
          <Button size="sm" variant="secondary" onClick={() => setReload((n) => n + 1)}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {state.kind === "off" ? (
        <>
          <p className="text-sm text-ink-2">
            Além da senha, o Pulse pede um código de 6 dígitos gerado no seu celular. Mesmo que alguém descubra sua senha, não
            consegue entrar.
          </p>
          <Button onClick={start} disabled={busy} className="self-start">
            {busy ? "Preparando..." : "Ativar verificação em duas etapas"}
          </Button>
        </>
      ) : null}

      {state.kind === "enrolling" ? (
        <form onSubmit={confirm} className="flex flex-col gap-4">
          <ol className="flex flex-col gap-1.5 text-sm text-ink-2">
            <li>1. Instale um aplicativo autenticador, como Google Authenticator, Authy ou 1Password.</li>
            <li>2. No aplicativo, escaneie o código abaixo.</li>
            <li>3. Digite o código de 6 dígitos que aparecer.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR em data URL gerado pelo Supabase */}
            <img src={state.qr} alt="QR code para o aplicativo autenticador" width={168} height={168} className="rounded-xl bg-white p-2" />
            <div className="min-w-0 text-sm">
              <p className="text-muted">Não consegue escanear? Digite esta chave no aplicativo:</p>
              <code className="mt-1 block rounded-lg bg-surface-2 px-2 py-1.5 text-xs break-all select-all">{state.secret}</code>
            </div>
          </div>
          <Field label="Código de 6 dígitos">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="max-w-48 text-center font-display text-xl tracking-[0.35em]"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? "Confirmando..." : "Confirmar e ativar"}
            </Button>
            <Button variant="ghost" onClick={() => setState({ kind: "off" })}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {state.kind === "codes" ? (
        <RecoveryCodes
          codes={state.codes}
          onDone={() => {
            setState({ kind: "loading" });
            setReload((n) => n + 1);
          }}
        />
      ) : null}

      {state.kind === "on" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-5 text-brand-text" />
              Ativa desde {new Date(state.since).toLocaleDateString("pt-BR")}.
            </p>
            {confirmOff ? (
              <span className="flex gap-2">
                <Button size="sm" variant="danger" onClick={disable} disabled={busy}>
                  {busy ? "Desativando..." : "Confirmar desativação"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmOff(false)}>
                  Cancelar
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmOff(true)}>
                Desativar
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-ink-2">Códigos de recuperação: use um para entrar se perder o celular. Gerar novos invalida os antigos.</p>
            <Button size="sm" variant="secondary" onClick={regenCodes} disabled={busy}>
              {busy ? "Gerando..." : "Gerar códigos de recuperação"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de área de transferência: a pessoa copia na mão.
    }
  };

  const download = () => {
    const content = `Códigos de recuperação do Domu Pulse\n\nGuarde em um lugar seguro. Cada código serve uma única vez para entrar caso você perca o celular.\n\n${text}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "domu-pulse-codigos-recuperacao.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-text">
        <KeyRound className="mt-0.5 size-4 shrink-0" />
        <p>
          Guarde estes códigos num lugar seguro (anotados ou no gerenciador de senhas). Se perder o celular, use um deles para
          entrar. Cada código vale <strong>uma vez</strong> e eles <strong>não aparecem de novo</strong>.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-2">
        {codes.map((c) => (
          <li key={c} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-center font-mono text-sm tracking-wider select-all">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={copy}>
          <Copy className="size-4" />
          {copied ? "Copiado!" : "Copiar"}
        </Button>
        <Button size="sm" variant="secondary" onClick={download}>
          <Download className="size-4" />
          Baixar
        </Button>
        <Button size="sm" onClick={onDone}>
          Já guardei
        </Button>
      </div>
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, {} as FormState);
  // Muda a key no sucesso para limpar os campos controlados.
  const formKey = state.success ?? "form";
  return (
    <form key={formKey} action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <PasswordField name="current" label="Senha atual" autoComplete="current-password" error={state.fieldErrors?.current} />
      <PasswordField name="password" label="Nova senha" autoComplete="new-password" error={state.fieldErrors?.password} showRules />
      <PasswordField name="confirm" label="Repita a nova senha" autoComplete="new-password" error={state.fieldErrors?.confirm} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Trocar senha"}
      </Button>
    </form>
  );
}

export function SignOutEverywhere() {
  const [armed, setArmed] = useState(false);
  return (
    <form action={signOutEverywhere} className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
      <p className="text-sm text-ink-2">Perdeu um celular ou usou um computador emprestado? Desconecte a conta de todos os aparelhos.</p>
      {armed ? (
        <span className="flex gap-2">
          <Button type="submit" size="sm" variant="danger">
            Sair de todos
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>
            Cancelar
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setArmed(true)}>
          Sair de todos os aparelhos
        </Button>
      )}
    </form>
  );
}
