"use server";

import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { sendPasswordChangedEmail } from "@/lib/email-templates";
import { publicEnv } from "@/lib/env";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, passwordSchema, type FormState } from "@/lib/validation";

const schema = z
  .object({ current: z.string().min(1, "Informe a senha atual.").max(72), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não conferem." })
  .refine((v) => v.password !== v.current, { path: ["password"], message: "Use uma senha diferente da atual." });

/**
 * Troca de senha pedindo a atual: um aparelho esquecido aberto não basta para
 * tomar a conta. Depois, desconecta os outros aparelhos e avisa por e-mail.
 */
export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const email = auth?.claims?.email;
  const userId = auth?.claims?.sub;
  if (!email || !userId) redirect("/entrar");

  const limit = await rateLimit(`password-change:${userId}`, 5, 15 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };

  // Confere a senha atual num cliente separado, sem tocar na sessão desta aba.
  const { supabaseUrl, supabaseKey } = publicEnv();
  const probe = createStatelessClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await probe.auth.signInWithPassword({ email, password: parsed.data.current });
  if (wrong) return { fieldErrors: { current: "Senha atual incorreta." } };
  await probe.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password") return { fieldErrors: { password: "Senha fraca. Siga os requisitos abaixo do campo." } };
    if (error.code === "insufficient_aal") return { error: "Confirme o código do aplicativo autenticador antes de trocar a senha." };
    return { error: "Não foi possível trocar a senha. Tente novamente." };
  }

  await supabase.auth.signOut({ scope: "others" });
  after(() => sendPasswordChangedEmail({ to: email }));
  return { success: "Senha alterada. Os outros aparelhos foram desconectados." };
}

/** Desconecta a conta de todos os aparelhos, inclusive este. */
export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/entrar");
}
