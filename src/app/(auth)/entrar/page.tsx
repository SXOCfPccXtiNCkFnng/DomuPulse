import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth-forms";
import { AuthHeading } from "@/components/auth-heading";

export const metadata: Metadata = { title: "Entrar" };

export default function SignInPage() {
  return (
    <>
      <AuthHeading eyebrow="Acesse sua conta" title={<>Bem-vindo <span className="text-brand-text">de volta.</span></>}>
        Entre para acompanhar sua equipe ao vivo.
      </AuthHeading>
      <Suspense>
        <SignInForm />
      </Suspense>
      <p className="mt-8 text-sm text-muted">
        Ainda não usa o Pulse?{" "}
        <Link href="/criar-conta" className="font-medium text-ink underline-offset-4 hover:underline">
          Criar conta da imobiliária
        </Link>
      </p>
    </>
  );
}
