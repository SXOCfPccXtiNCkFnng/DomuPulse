import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth-forms";
import { AuthHeading } from "@/components/auth-heading";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeading eyebrow="Nova conta" title={<>Crie a conta da sua <span className="text-brand-text">imobiliária.</span></>}>
        Em poucos minutos sua equipe está lançando relatórios.
      </AuthHeading>
      <SignUpForm />
      <p className="mt-8 text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-ink underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
