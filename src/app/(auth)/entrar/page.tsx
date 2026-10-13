import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Entrar" };

export default function SignInPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Bem-vindo de volta</h1>
      <p className="mt-2 mb-8 text-muted">Entre para acompanhar sua equipe ao vivo.</p>
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
