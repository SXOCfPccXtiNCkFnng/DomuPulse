"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { sendPasswordChangedEmail, sendPasswordResetEmail, sendTeamWelcomeEmail, sendWelcomeEmail } from "@/lib/email-templates";
import { siteUrl } from "@/lib/email";
import { recordAccess } from "@/lib/access-log";
import { CAPTCHA_ERROR, verifyCaptcha } from "@/lib/captcha";
import { findOrgByInviteCode } from "@/lib/invite-link";
import { LEGAL_DOCS_VERSION } from "@/lib/legal";
import { notifyLeadersOf } from "@/lib/notify";
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
  if (!(await verifyCaptcha(formData, ip))) return { error: CAPTCHA_ERROR, values };

  const supabase = await createClient();
  const { data: signedIn, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.status === 429) return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo.", values };
    // Mensagem única para não revelar se o e-mail existe.
    return { error: "E-mail ou senha incorretos.", values };
  }
  if (signedIn.user) await recordAccess(signedIn.user.id, "login", ip);

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
// vai para o login com um aviso de sucesso e recebe um e-mail de boas-vindas.
export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  // Campo invisível: pessoas não preenchem, robôs costumam preencher.
  if (formData.get("website")) return GENERIC_SIGNUP_ERROR;
  const values = keep(formData, ["fullName", "orgName", "email", "whatsapp"]);

  const ip = await clientIp();
  const limit = await rateLimit(`signup:ip:${ip}`, 8, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec), values };

  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (!(await verifyCaptcha(formData, ip))) return { error: CAPTCHA_ERROR, values };

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
    // Sem teste grátis: a conta nasce aguardando ativação (assinatura ou cupom).
    .insert({
      name: orgName,
      contact_phone: whatsapp,
      trial_ends_at: new Date().toISOString(),
      trial_reminder_sent_at: new Date().toISOString(),
      trial_ended_notified_at: new Date().toISOString(),
    })
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
  await recordAccess(user.id, "signup", ip);
  after(() => sendWelcomeEmail({ to: email, fullName, orgName }));

  redirect("/entrar?cadastro=ok");
}

const joinSchema = z.object({
  code: z.string(),
  fullName: fullNameSchema,
  email: emailSchema,
  teamId: z.uuid("Escolha sua equipe."),
  password: passwordSchema,
  acceptTerms: acceptTermsSchema,
});

/**
 * Entrada pelo link de convite da conta: cria o usuário já como corretor da
 * equipe escolhida. O código é conferido de novo aqui, não só na página.
 */
export async function joinWithInvite(_: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("website")) return GENERIC_SIGNUP_ERROR;
  const values = keep(formData, ["fullName", "email", "teamId"]);

  const ip = await clientIp();
  const limit = await rateLimit(`join:ip:${ip}`, 8, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec), values };

  const parsed = joinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (!(await verifyCaptcha(formData, ip))) return { error: CAPTCHA_ERROR, values };

  const { code, fullName, email, teamId, password } = parsed.data;
  const org = await findOrgByInviteCode(code);
  if (!org) return { error: "Este link de convite não vale mais. Peça um novo ao seu gestor." };

  const admin = createAdminClient();
  const { data: team } = await admin.from("teams").select("id, division_id").eq("id", teamId).eq("org_id", org.id).maybeSingle();
  if (!team) return { fieldErrors: { teamId: "Escolha sua equipe." }, values };

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
    logger.error("auth.join_create_user", { message: describeError(error), orgId: org.id });
    return { ...GENERIC_SIGNUP_ERROR, values };
  }

  const { error: memberError } = await admin.from("members").insert({
    org_id: org.id,
    user_id: data.user.id,
    full_name: fullName,
    role: "broker",
    team_id: team.id,
    division_id: team.division_id,
    terms_accepted_at: new Date().toISOString(),
    terms_version: LEGAL_DOCS_VERSION,
    terms_accepted_ip: ip.slice(0, 64),
  });
  if (memberError) {
    logger.error("auth.join_member", { message: describeError(memberError), orgId: org.id });
    await admin.auth.admin.deleteUser(data.user.id);
    return { ...GENERIC_SIGNUP_ERROR, values };
  }

  after(() =>
    notifyLeadersOf(
      { orgId: org.id, teamId: team.id, divisionId: team.division_id },
      { kind: "member_joined", title: "Novo membro na equipe", body: `${fullName} entrou pelo link de convite.`, url: "/equipe" },
    ),
  );
  await recordAccess(data.user.id, "join", ip);
  after(() => sendTeamWelcomeEmail({ to: email, fullName, orgName: org.name }));

  redirect("/entrar?cadastro=ok");
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
  if (!(await verifyCaptcha(formData, ip))) return { error: CAPTCHA_ERROR, values };

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
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: "Seu link expirou. Peça um novo link de acesso." };

  // Quem ainda não aceitou os termos é decidido pelo banco, não pelo campo
  // escondido do formulário: senão bastava mandar "0" para pular o aceite.
  const { data: member } = await createAdminClient().from("members").select("terms_accepted_at").eq("user_id", userId).maybeSingle();
  const needsTerms = Boolean(member) && !member?.terms_accepted_at;

  const parsed = z
    .object({
      password: passwordSchema,
      confirm: z.string(),
      acceptTerms: needsTerms ? acceptTermsSchema : z.any(),
    })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não conferem." })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: "Use uma senha diferente da atual." } };
    if (error.code === "weak_password") return { fieldErrors: { password: "Senha fraca. Siga os requisitos abaixo do campo." } };
    return { error: "Não foi possível salvar a senha. Tente novamente." };
  }

  // Recuperação de senha: avisa o dono do e-mail. No primeiro acesso por
  // convite a pessoa está só criando a senha, então não há o que avisar.
  const email = auth?.claims?.email;
  if (!needsTerms && email) after(() => sendPasswordChangedEmail({ to: email }));

  // Quem entrou por convite aceita os termos aqui, no primeiro acesso.
  if (needsTerms) {
    const { data: joined } = await createAdminClient()
      .from("members")
      .update({
        terms_accepted_at: new Date().toISOString(),
        terms_version: LEGAL_DOCS_VERSION,
        terms_accepted_ip: (await clientIp()).slice(0, 64),
      })
      .eq("user_id", userId)
      .is("terms_accepted_at", null)
      .select("org_id, team_id, division_id, full_name")
      .maybeSingle();

    // Convite aceito: a liderança fica sabendo que a pessoa entrou.
    if (joined) {
      after(() =>
        notifyLeadersOf(
          { orgId: joined.org_id, teamId: joined.team_id, divisionId: joined.division_id },
          { kind: "member_joined", title: "Novo membro na equipe", body: `${joined.full_name} aceitou o convite e já pode usar o Pulse.`, url: "/equipe" },
        ),
      );
    }
    redirect("/painel");
  }

  // Recuperação de senha: encerra a sessão aberta pelo link e leva para o
  // login, onde a pessoa entra com a senha nova.
  await supabase.auth.signOut({ scope: "global" });
  redirect("/entrar?senha=alterada");
}
