import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth-forms";
import { AuthHeading } from "@/components/auth-heading";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeading eyebrow="Nova conta" title={<>Crie a conta da sua <span className="text-brand-text">empresa.</span></>}>
        Escolha o módulo e comece hoje: relatório dos corretores ao vivo ou recrutamento pelo WhatsApp.
      </AuthHeading>
      <Suspense>
        <SignUpForm />
      </Suspense>
      <p className="mt-8 text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-ink underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
