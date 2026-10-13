"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
    </form>
  );
}
