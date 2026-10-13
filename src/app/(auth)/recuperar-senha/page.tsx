import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ResetPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Recuperar senha</h1>
      <p className="mt-2 mb-8 text-muted">Enviamos um link para você criar uma senha nova.</p>
      <ResetRequestForm />
      <Link href="/entrar" className="mt-8 inline-block text-sm text-muted hover:text-ink">
        Voltar para o login
      </Link>
    </>
  );
}
