"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { sendPasswordResetEmail, sendWelcomeEmail } from "@/lib/email-templates";
import { siteUrl } from "@/lib/email";
import { LEGAL_DOCS_VERSION } from "@/lib/legal";
import { describeError, logger } from "@/lib/logger";
import { clientIp, rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  acceptTermsSchema,
  emailSchema,
  fieldErrors,
  fullNameSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
  keep,
  type FormState,
} from "@/lib/validation";

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha.").max(72),
});

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const values = keep(formData, ["email"]);
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  // Por IP contra varredura, por e-mail contra força bruta numa conta só.
  const ip = await clientIp();
  for (const [key, limit] of [
    [`login:ip:${ip}`, 30],
    [`login:email:${parsed.data.email}`, 8],
  ] as const) {
    const check = await rateLimit(key, limit, 15 * 60);
    if (!check.ok) return { error: tooManyAttempts(check.retryAfterSec), values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.status === 429) return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo.", values };
    // Mensagem única para não revelar se o e-mail existe.
    return { error: "E-mail ou senha incorretos.", values };
  }

  redirect(safeNext(formData.get("proximo")));
}

const signUpSchema = z.object({
  fullName: fullNameSchema,
  orgName: nameSchema,
  email: emailSchema,
  whatsapp: phoneSchema,
  password: passwordSchema,
  acceptTerms: acceptTermsSchema,
});

const GENERIC_SIGNUP_ERROR = { error: "Não foi possível criar a conta agora. Tente novamente." };

// Cadastro sem confirmação de e-mail: a conta já nasce confirmada, a pessoa
// entra direto no painel e recebe um e-mail de boas-vindas.
export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  // Campo invisível: pessoas não preenchem, robôs costumam preencher.
  if (formData.get("website")) return GENERIC_SIGNUP_ERROR;
  const values = keep(formData, ["fullName", "orgName", "email", "whatsapp"]);

  const ip = await clientIp();
  const limit = await rateLimit(`signup:ip:${ip}`, 8, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec), values };

  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { fullName, orgName, email, whatsapp, password } = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    if (error?.code === "email_exists") {
      return { fieldErrors: { email: "Este e-mail já tem conta. Entre ou recupere a senha." }, values };
    }
    if (error?.code === "weak_password") {
      return { fieldErrors: { password: "Senha fraca. Siga os requisitos abaixo do campo." }, values };
    }
    logger.error("auth.signup_create_user", { message: describeError(error) });
    return { ...GENERIC_SIGNUP_ERROR, values };
  }

  const user = data.user;
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: orgName, contact_phone: whatsapp })
    .select("id")
    .single();

  const { error: memberError } = org
    ? await admin.from("members").insert({
        org_id: org.id,
        user_id: user.id,
        full_name: fullName,
        role: "owner",
        // Prova do consentimento (LGPD): quando, qual versão e de onde.
        terms_accepted_at: new Date().toISOString(),
        terms_version: LEGAL_DOCS_VERSION,
        terms_accepted_ip: ip.slice(0, 64),
      })
    : { error: orgError };

  if (orgError || memberError) {
    logger.error("auth.signup_org", { message: describeError(orgError ?? memberError) });
    // Desfaz para o e-mail poder ser usado de novo.
    if (org) await admin.from("organizations").delete().eq("id", org.id);
    await admin.auth.admin.deleteUser(user.id);
    return { ...GENERIC_SIGNUP_ERROR, values };
  }

  // Envia depois da resposta, para o cadastro não esperar o provedor de e-mail.
  after(() => sendWelcomeEmail({ to: email, fullName, orgName }));

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) redirect("/entrar");

  redirect("/painel");
}

const RESET_SENT = {
  success: "Se este e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.",
};

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const values = keep(formData, ["email"]);
  const parsed = z.object({ email: emailSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const { email } = parsed.data;

  const ip = await clientIp();
  for (const [key, limit] of [
    [`reset:ip:${ip}`, 10],
    [`reset:email:${email}`, 3],
  ] as const) {
    const check = await rateLimit(key, limit, 60 * 60);
    if (!check.ok) return { error: tooManyAttempts(check.retryAfterSec), values };
  }

  // O link sai pelo nosso e-mail, com a marca do Pulse. E-mail inexistente
  // recebe a mesma resposta, para não revelar quem tem conta.
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email });
  const hash = data?.properties?.hashed_token;
  if (!error && hash) {
    const link = siteUrl(`/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=recovery`);
    after(() => sendPasswordResetEmail({ to: email, link }));
  }

  return RESET_SENT;
}

export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  const needsTerms = formData.get("needsTerms") === "1";
  const parsed = z
    .object({
      password: passwordSchema,
      confirm: z.string(),
      acceptTerms: needsTerms ? acceptTermsSchema : z.any(),
    })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não conferem." })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: "Seu link expirou. Peça um novo link de acesso." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: "Use uma senha diferente da atual." } };
    if (error.code === "weak_password") return { fieldErrors: { password: "Senha fraca. Siga os requisitos abaixo do campo." } };
    return { error: "Não foi possível salvar a senha. Tente novamente." };
  }

  // Quem entrou por convite aceita os termos aqui, no primeiro acesso.
  if (needsTerms) {
    await createAdminClient()
      .from("members")
      .update({
        terms_accepted_at: new Date().toISOString(),
        terms_version: LEGAL_DOCS_VERSION,
        terms_accepted_ip: (await clientIp()).slice(0, 64),
      })
      .eq("user_id", userId)
      .is("terms_accepted_at", null);
  }

  redirect("/painel");
}
