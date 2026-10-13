import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Crie a conta da sua imobiliária</h1>
      <p className="mt-2 mb-8 text-muted">Em poucos minutos sua equipe está lançando relatórios.</p>
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
