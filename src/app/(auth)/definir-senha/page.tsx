import type { Metadata } from "next";
import { NewPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Definir senha" };

export default function NewPasswordPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Crie sua senha</h1>
      <p className="mt-2 mb-8 text-muted">Você vai usar esta senha para entrar no Pulse.</p>
      <NewPasswordForm />
    </>
  );
}
