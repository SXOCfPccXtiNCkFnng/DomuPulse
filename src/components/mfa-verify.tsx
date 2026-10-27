"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { recoverWithCode } from "@/app/(auth)/recovery-actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { safeNext } from "@/lib/safe-redirect";
import { getBrowserClient } from "@/lib/supabase/client";

export function MfaVerifyForm() {
  const supabase = useMemo(() => getBrowserClient(), []);
  const router = useRouter();
  const params = useSearchParams();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      if (cancelled) return;
      const factor = data?.totp.find((f) => f.status === "verified");
      if (factor) setFactorId(factor.id);
      else setError("Nenhum aplicativo autenticador encontrado nesta conta. Entre de novo.");
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      setPending(false);
      setCode("");
      setError(error.status === 429 ? "Muitas tentativas. Aguarde um pouco." : "Código incorreto ou expirado. Confira o aplicativo e tente de novo.");
      return;
    }
    router.replace(safeNext(params.get("proximo")));
    router.refresh();
  }

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    if (recovery.trim().length < 6) return;
    setPending(true);
    setError(null);
    const r = await recoverWithCode(recovery);
    if ("error" in r) {
      setPending(false);
      setRecovery("");
      return setError(r.error);
    }
    // O 2FA foi removido: atualiza a sessão para o app parar de pedir o código, e entra.
    await supabase.auth.refreshSession();
    router.replace(safeNext(params.get("proximo")));
    router.refresh();
  }

  if (mode === "recovery") {
    return (
      <form onSubmit={submitRecovery} className="flex flex-col gap-4" noValidate>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <p className="text-sm text-ink-2">
          Perdeu o acesso ao aplicativo de códigos? Digite um dos códigos de recuperação que você guardou ao ativar a verificação. Ele
          vale uma vez e desliga a verificação em duas etapas: depois de entrar, é só ativar de novo em Conta.
        </p>
        <Field label="Código de recuperação">
          <Input
            value={recovery}
            onChange={(e) => setRecovery(e.target.value.toUpperCase().slice(0, 12))}
            autoComplete="one-time-code"
            autoFocus
            placeholder="ABCD-EFGH"
            className="text-center font-mono text-lg tracking-[0.3em] uppercase"
          />
        </Field>
        <Button type="submit" size="lg" disabled={pending || recovery.trim().length < 6}>
          {pending ? "Verificando..." : "Entrar com código de recuperação"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setMode("totp");
            setError(null);
          }}
          className="text-sm text-muted hover:text-ink"
        >
          Voltar para o código do aplicativo
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Field label="Código de 6 dígitos" hint="Abra o aplicativo autenticador (Google Authenticator, Authy, 1Password ou outro).">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          className="text-center font-display text-2xl tracking-[0.4em]"
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending || code.length !== 6 || !factorId}>
        {pending ? "Confirmando..." : "Confirmar"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setMode("recovery");
          setError(null);
        }}
        className="text-sm text-muted hover:text-ink"
      >
        Perdi o acesso ao aplicativo
      </button>
    </form>
  );
}
