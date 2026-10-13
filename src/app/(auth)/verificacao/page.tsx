import type { Metadata } from "next";
import { Suspense } from "react";
import { MfaVerifyForm } from "@/components/mfa-verify";

export const metadata: Metadata = { title: "Verificação" };

export default function VerificationPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Verificação em duas etapas</h1>
      <p className="mt-2 mb-8 text-muted">Digite o código que aparece no seu aplicativo autenticador.</p>
      <Suspense>
        <MfaVerifyForm />
      </Suspense>
      <form action="/auth/sair" method="post" className="mt-8">
        <button type="submit" className="text-sm text-muted hover:text-ink">
          Entrar com outra conta
        </button>
      </form>
    </>
  );
}
