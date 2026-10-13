import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Teste grátis por 14 dias</h1>
      <p className="mt-2 mb-8 text-muted">Sem cartão. Você convida a equipe depois.</p>
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
