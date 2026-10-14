"use server";

import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { LEGAL_DOCS_VERSION } from "@/lib/legal";
import { clientIp } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceptTermsSchema, type FormState } from "@/lib/validation";

/** Aceite da versão nova dos Termos e da Política, com data, versão e IP (prova do consentimento). */
export async function acceptUpdatedTerms(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  const parsed = acceptTermsSchema.safeParse(formData.get("acceptTerms"));
  if (!parsed.success) return { fieldErrors: { acceptTerms: "Marque que leu e aceita para continuar." } };

  const { error } = await createAdminClient()
    .from("members")
    .update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: LEGAL_DOCS_VERSION,
      terms_accepted_ip: (await clientIp()).slice(0, 64),
    })
    .eq("id", me.id);
  if (error) return { error: "Não foi possível registrar o aceite. Tente de novo." };

  redirect("/painel");
}
