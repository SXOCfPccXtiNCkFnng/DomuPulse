"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { sendWelcomeEmail } from "@/lib/email";
import { publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  emailSchema,
  fieldErrors,
  nameSchema,
  passwordSchema,
  type FormState,
} from "@/lib/validation";

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha.").max(72),
});

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Mensagem única para não revelar se o e-mail existe.
    if (error.code === "email_not_confirmed") {
      return { error: "Confirme seu e-mail pelo link que enviamos antes de entrar." };
    }
    if (error.status === 429) {
      return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
    }
    return { error: "E-mail ou senha incorretos." };
  }

  redirect(safeNext(formData.get("proximo")));
}

const signUpSchema = z.object({
  fullName: nameSchema,
  orgName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

const GENERIC_SIGNUP_ERROR = { error: "Não foi possível criar a conta agora. Tente novamente." };

// Cadastro sem confirmação de e-mail: a conta já nasce confirmada, a pessoa
// entra direto no painel e recebe um e-mail de boas-vindas.
export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  // Campo invisível: pessoas não preenchem, robôs costumam preencher.
  if (formData.get("website")) return GENERIC_SIGNUP_ERROR;

  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { fullName, orgName, email, password } = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    if (error?.code === "email_exists") {
      return { fieldErrors: { email: "Este e-mail já tem conta. Entre ou recupere a senha." } };
    }
    if (error?.code === "weak_password") {
      return { fieldErrors: { password: "Senha fraca. Use letras maiúsculas, minúsculas e números." } };
    }
    return GENERIC_SIGNUP_ERROR;
  }

  const user = data.user;
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: orgName })
    .select("id")
    .single();

  const { error: memberError } = org
    ? await admin.from("members").insert({
        org_id: org.id,
        user_id: user.id,
        full_name: fullName,
        role: "owner",
      })
    : { error: orgError };

  if (orgError || memberError) {
    // Desfaz para o e-mail poder ser usado de novo.
    if (org) await admin.from("organizations").delete().eq("id", org.id);
    await admin.auth.admin.deleteUser(user.id);
    return GENERIC_SIGNUP_ERROR;
  }

  // Envia depois da resposta, para o cadastro não esperar o provedor de e-mail.
  after(() => sendWelcomeEmail({ to: email, fullName, orgName }));

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) redirect("/entrar");

  redirect("/painel");
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ email: emailSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().siteUrl}/auth/confirm?next=/definir-senha`,
  });

  return { success: "Se este e-mail estiver cadastrado, você vai receber um link para criar uma nova senha." };
}

export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não conferem." })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: "Seu link expirou. Peça um novo link de acesso." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: "Use uma senha diferente da atual." } };
    return { error: "Não foi possível salvar a senha. Tente novamente." };
  }

  redirect("/painel");
}
