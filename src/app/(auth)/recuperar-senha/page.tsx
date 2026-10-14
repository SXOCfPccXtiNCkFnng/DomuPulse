import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "@/components/auth-forms";
import { AuthHeading } from "@/components/auth-heading";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ResetPage() {
  return (
    <>
      <AuthHeading eyebrow="Acesso" title={<>Recuperar <span className="text-brand-text">senha.</span></>}>
        Enviamos um link para você criar uma senha nova.
      </AuthHeading>
      <ResetRequestForm />
      <Link href="/entrar" className="mt-8 inline-block text-sm text-muted hover:text-ink">
        Voltar para o login
      </Link>
    </>
  );
}
