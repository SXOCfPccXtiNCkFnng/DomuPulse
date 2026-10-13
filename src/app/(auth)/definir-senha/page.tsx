import type { Metadata } from "next";
import { Suspense } from "react";
import { NewPasswordForm } from "@/components/auth-forms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Definir senha" };

export default function NewPasswordPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Crie sua senha</h1>
      <p className="mt-2 mb-8 text-muted">Você vai usar esta senha para entrar no Pulse.</p>
      <Suspense>
        <Form />
      </Suspense>
    </>
  );
}

// Quem chegou por convite ainda não aceitou os termos: pede aqui.
async function Form() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  const { data } = userId
    ? await supabase.from("members").select("terms_accepted_at").eq("user_id", userId).maybeSingle()
    : { data: null };
  return <NewPasswordForm needsTerms={Boolean(data) && !data?.terms_accepted_at} />;
}
