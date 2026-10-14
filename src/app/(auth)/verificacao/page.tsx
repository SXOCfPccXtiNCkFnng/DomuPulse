import type { Metadata } from "next";
import { Suspense } from "react";
import { MfaVerifyForm } from "@/components/mfa-verify";
import { AuthHeading } from "@/components/auth-heading";

export const metadata: Metadata = { title: "Verificação" };

export default function VerificationPage() {
  return (
    <>
      <AuthHeading eyebrow="Segurança" title={<>Verificação em <span className="text-brand-text">duas etapas.</span></>}>
        Digite o código que aparece no seu aplicativo autenticador.
      </AuthHeading>
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
