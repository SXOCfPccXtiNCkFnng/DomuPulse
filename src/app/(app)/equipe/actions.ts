"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember, ROLE_LABEL, ROLE_RANK as RANK, type CurrentMember, type Role } from "@/lib/auth";
import { siteUrl } from "@/lib/email";
import { sendInviteEmail } from "@/lib/email-templates";
import { inviteUrl, regenerateInviteCode } from "@/lib/invite-link";
import { describeError, logger } from "@/lib/logger";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { IMPORT_MAX_ROWS, normalize, roleFromText } from "@/lib/team-import";
import { emailSchema, fieldErrors, nameSchema, type FormState } from "@/lib/validation";

function orgWritable(org: CurrentMember["org"]) {
  if (org.status === "active" || org.status === "past_due") return true;
  return org.status === "trialing" && new Date(org.trialEndsAt) > new Date();
}

const READ_ONLY = { error: "Sua assinatura está inativa. Regularize para alterar a equipe." };

const inviteSchema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  role: z.enum(["director", "manager", "broker"]),
  scopeId: z.uuid("Escolha onde a pessoa vai atuar."),
});

export async function inviteMember(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role === "broker") return { error: "Sem permissão." };
  if (!orgWritable(me.org)) return READ_ONLY;

  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { fullName, email, role, scopeId } = parsed.data;

  if (RANK[role] <= RANK[me.role]) return { error: "Você só pode convidar cargos abaixo do seu." };

  const limit = await rateLimit(`invite:user:${me.userId}`, 40, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };

  // O escopo é lido com o cliente do usuário: o RLS garante que a equipe ou
  // diretoria pertence à organização dele.
  const supabase = await createClient();
  let teamId: string | null = null;
  let divisionId: string | null = null;

  if (role === "director") {
    if (me.role !== "owner") return { error: "Só o administrador convida superintendentes." };
    const { data } = await supabase.from("divisions").select("id").eq("id", scopeId).maybeSingle();
    if (!data) return { fieldErrors: { scopeId: "Diretoria inválida." } };
    divisionId = data.id;
  } else {
    const { data } = await supabase.from("teams").select("id, division_id").eq("id", scopeId).maybeSingle();
    if (!data) return { fieldErrors: { scopeId: "Equipe inválida." } };
    if (me.role === "director" && data.division_id !== me.divisionId) return { error: "Essa equipe está fora da sua diretoria." };
    if (me.role === "manager" && data.id !== me.teamId) return { error: "Você só pode convidar para a sua equipe." };
    teamId = data.id;
  }

  const result = await createInvite(me, { fullName, email, role, teamId, divisionId });
  if (!result.ok) return result.field ? { fieldErrors: { [result.field]: result.error } } : { error: result.error };

  revalidatePath("/equipe");
  return { success: `Convite enviado para ${email}.` };
}

type InviteResult = { ok: true } | { ok: false; error: string; field?: "email" };

/**
 * Cria o usuário e o membro e envia o convite pelo nosso e-mail, com a
 * marca do Pulse. Usado pelo convite manual e pela importação. Quem chama
 * já conferiu permissão e escopo.
 */
async function createInvite(
  me: CurrentMember,
  input: { fullName: string; email: string; role: Role; teamId: string | null; divisionId: string | null },
): Promise<InviteResult> {
  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: { data: { full_name: input.fullName } },
  });
  const hash = invited?.properties?.hashed_token;
  if (inviteError || !invited.user || !hash) {
    if (inviteError?.code === "email_exists") return { ok: false, field: "email", error: "Este e-mail já tem conta no Pulse." };
    logger.error("team.invite_link", { message: describeError(inviteError), orgId: me.org.id });
    return { ok: false, error: "Não foi possível enviar o convite. Tente novamente." };
  }

  const { error: memberError } = await admin.from("members").insert({
    org_id: me.org.id,
    user_id: invited.user.id,
    full_name: input.fullName,
    role: input.role,
    team_id: input.teamId,
    division_id: input.divisionId,
  });
  if (memberError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    logger.error("team.invite_member", { message: describeError(memberError), orgId: me.org.id });
    return { ok: false, error: "Não foi possível cadastrar o membro. Tente novamente." };
  }

  const sent = await sendInviteEmail({
    to: input.email,
    fullName: input.fullName,
    orgName: me.org.name,
    roleLabel: ROLE_LABEL[input.role],
    invitedBy: me.fullName,
    link: siteUrl(`/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=invite`),
  });
  if (!sent.ok) {
    // Sem e-mail o convite não serve: desfaz para poder tentar de novo.
    await admin.auth.admin.deleteUser(invited.user.id);
    return { ok: false, error: "Não foi possível enviar o e-mail de convite. Tente novamente em instantes." };
  }
  return { ok: true };
}

export async function setMemberActive(memberId: string, active: boolean): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role === "broker") return { error: "Sem permissão." };
  if (!orgWritable(me.org)) return READ_ONLY;
  if (!z.uuid().safeParse(memberId).success || memberId === me.id) return { error: "Membro inválido." };

  // Se o RLS deixa ver e não é a própria pessoa, quem chamou lidera o alvo.
  const supabase = await createClient();
  const { data: target } = await supabase.from("members").select("id, user_id, role").eq("id", memberId).maybeSingle();
  if (!target || RANK[target.role as Role] <= RANK[me.role]) return { error: "Sem permissão para alterar este membro." };

  const admin = createAdminClient();
  const { error } = await admin.from("members").update({ active }).eq("id", memberId).eq("org_id", me.org.id);
  if (error) return { error: "Não foi possível atualizar. Tente novamente." };

  // Bloqueia o login de quem foi desativado. O histórico continua salvo.
  await admin.auth.admin.updateUserById(target.user_id, { ban_duration: active ? "none" : "876000h" });

  revalidatePath("/equipe");
  return { success: active ? "Acesso reativado." : "Acesso desativado. O histórico foi mantido." };
}

const teamSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto.").max(80),
  divisionId: z.string().optional(),
  divisionName: z.string().trim().max(80).optional(),
});

export async function createTeam(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role !== "owner" && me.role !== "director") return { error: "Sem permissão." };
  if (!orgWritable(me.org)) return READ_ONLY;

  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  let divisionId = me.role === "director" ? me.divisionId : parsed.data.divisionId;

  // Primeira equipe da imobiliária: cria a diretoria junto.
  if (me.role === "owner" && !divisionId) {
    const name = parsed.data.divisionName || "Diretoria principal";
    const { data, error } = await supabase
      .from("divisions")
      .insert({ org_id: me.org.id, name })
      .select("id")
      .single();
    if (error) return { error: error.code === "23505" ? "Já existe uma diretoria com esse nome." : "Não foi possível criar a diretoria." };
    divisionId = data.id;
  }

  const { error } = await supabase
    .from("teams")
    .insert({ org_id: me.org.id, division_id: divisionId, name: parsed.data.name });
  if (error) {
    if (error.code === "23505") return { fieldErrors: { name: "Já existe uma equipe com esse nome." } };
    return { error: "Não foi possível criar a equipe." };
  }

  revalidatePath("/equipe");
  return { success: "Equipe criada." };
}

// --------------------------------------------------------------------------
// Gestão da equipe
// --------------------------------------------------------------------------

/**
 * Quem chama lidera o alvo? Lido com o cliente do usuário: se o RLS deixa
 * ver e o cargo do alvo é abaixo do seu, lidera.
 */
async function ledTarget(me: CurrentMember, memberId: string) {
  if (!z.uuid().safeParse(memberId).success || memberId === me.id) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("id, user_id, role, team_id, division_id, full_name, active, terms_accepted_at")
    .eq("id", memberId)
    .maybeSingle();
  if (!data || RANK[data.role as Role] <= RANK[me.role]) return null;
  return data;
}

async function auditMember(actor: string, orgId: string, memberId: string, action: string, data: Record<string, unknown>) {
  // Ações com a chave de serviço não têm usuário no banco: o autor vai explícito.
  await createAdminClient().from("audit_log").insert({
    org_id: orgId,
    actor,
    table_name: "members",
    record_id: memberId,
    action,
    new_data: data,
  });
}

const memberSchema = z.object({
  fullName: nameSchema,
  role: z.enum(["director", "manager", "broker"]),
  scopeId: z.uuid("Escolha onde a pessoa vai atuar."),
});

export async function updateMember(memberId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role === "broker") return { error: "Sem permissão." };
  if (!orgWritable(me.org)) return READ_ONLY;

  const target = await ledTarget(me, memberId);
  if (!target) return { error: "Sem permissão para alterar este membro." };

  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { fullName, role, scopeId } = parsed.data;
  if (RANK[role] <= RANK[me.role]) return { fieldErrors: { role: "Você só pode atribuir cargos abaixo do seu." } };

  // O novo lugar precisa estar dentro do escopo de quem altera.
  const supabase = await createClient();
  let update: Record<string, unknown>;
  if (role === "director") {
    if (me.role !== "owner") return { error: "Só o administrador define superintendentes." };
    const { data } = await supabase.from("divisions").select("id").eq("id", scopeId).maybeSingle();
    if (!data) return { fieldErrors: { scopeId: "Diretoria inválida." } };
    update = { full_name: fullName, role, division_id: data.id, team_id: null };
  } else {
    const { data } = await supabase.from("teams").select("id, division_id").eq("id", scopeId).maybeSingle();
    if (!data) return { fieldErrors: { scopeId: "Equipe inválida." } };
    if (me.role === "director" && data.division_id !== me.divisionId) return { fieldErrors: { scopeId: "Essa equipe está fora da sua diretoria." } };
    if (me.role === "manager" && data.id !== me.teamId) return { fieldErrors: { scopeId: "Você só pode manter a pessoa na sua equipe." } };
    update = { full_name: fullName, role, team_id: data.id, division_id: data.division_id };
  }

  const { error } = await createAdminClient().from("members").update(update).eq("id", memberId).eq("org_id", me.org.id);
  if (error) {
    logger.error("team.update_member", { message: describeError(error), orgId: me.org.id });
    return { error: "Não foi possível salvar. Tente novamente." };
  }
  await auditMember(me.userId, me.org.id, memberId, "update_member", update);

  revalidatePath("/equipe");
  return { success: "Alterações salvas." };
}

export async function resendInvite(memberId: string): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role === "broker") return { error: "Sem permissão." };
  const target = await ledTarget(me, memberId);
  if (!target) return { error: "Sem permissão." };
  if (target.terms_accepted_at) return { error: "Essa pessoa já entrou no Pulse." };

  const limit = await rateLimit(`invite:resend:${memberId}`, 3, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };

  const admin = createAdminClient();
  const { data: user } = await admin.auth.admin.getUserById(target.user_id);
  const email = user.user?.email;
  if (!email) return { error: "Convite sem e-mail. Desative e convide de novo." };

  // Convite ainda não aceito: um novo link de acesso, que leva a criar a senha.
  let type: "invite" | "magiclink" = "invite";
  let link = await admin.auth.admin.generateLink({ type: "invite", email });
  if (link.error) {
    type = "magiclink";
    link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  }
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) {
    logger.error("team.resend_invite", { message: describeError(link.error), orgId: me.org.id });
    return { error: "Não foi possível gerar o convite. Tente novamente." };
  }

  const sent = await sendInviteEmail({
    to: email,
    fullName: target.full_name,
    orgName: me.org.name,
    roleLabel: ROLE_LABEL[target.role as Role],
    invitedBy: me.fullName,
    link: siteUrl(`/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=${type}&next=/definir-senha`),
  });
  if (!sent.ok) return { error: "Não foi possível enviar o e-mail. Tente novamente em instantes." };
  return { success: `Convite reenviado para ${email}.` };
}

const teamNameSchema = z.string().trim().min(2, "Nome muito curto.").max(80, "Nome muito longo.");

export async function renameTeam(teamId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role !== "owner" && me.role !== "director") return { error: "Sem permissão." };
  const name = teamNameSchema.safeParse(formData.get("name"));
  if (!name.success) return { fieldErrors: { name: name.error.issues[0].message } };

  // Cliente do usuário: o RLS só deixa o administrador ou o superintendente da diretoria.
  const supabase = await createClient();
  const { data, error } = await supabase.from("teams").update({ name: name.data }).eq("id", teamId).select("id");
  if (error?.code === "23505") return { fieldErrors: { name: "Já existe uma equipe com esse nome." } };
  if (error || !data?.length) return { error: "Sem permissão ou equipe inexistente." };
  revalidatePath("/equipe");
  return { success: "Equipe renomeada." };
}

export async function deleteTeam(teamId: string): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role !== "owner" && me.role !== "director") return { error: "Sem permissão." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("teams").delete().eq("id", teamId).select("id");
  // 23503: ainda há membros (mesmo desativados) ligados à equipe.
  if (error?.code === "23503") return { error: "Mova as pessoas desta equipe antes. Quem já fez parte dela continua ligado a ela." };
  if (error || !data?.length) return { error: "Sem permissão ou equipe inexistente." };
  revalidatePath("/equipe");
  return { success: "Equipe excluída." };
}

export async function renameDivision(divisionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role !== "owner") return { error: "Só o administrador renomeia diretorias." };
  const name = teamNameSchema.safeParse(formData.get("name"));
  if (!name.success) return { fieldErrors: { name: name.error.issues[0].message } };
  const supabase = await createClient();
  const { data, error } = await supabase.from("divisions").update({ name: name.data }).eq("id", divisionId).select("id");
  if (error?.code === "23505") return { fieldErrors: { name: "Já existe uma diretoria com esse nome." } };
  if (error || !data?.length) return { error: "Sem permissão ou diretoria inexistente." };
  revalidatePath("/equipe");
  return { success: "Diretoria renomeada." };
}


// --------------------------------------------------------------------------
// Importação por planilha
// --------------------------------------------------------------------------

export type ImportResult = { line: number; email: string; ok: boolean; error?: string };

const importRowSchema = z.object({
  line: z.number().int(),
  fullName: z.string(),
  email: z.string(),
  role: z.string(),
  team: z.string(),
});

/**
 * Convida várias pessoas de uma vez. Valida tudo de novo no servidor (a
 * prévia da tela é só conveniência), confere assentos antes de enviar
 * qualquer convite e devolve o resultado de cada linha.
 */
export async function importMembers(rawRows: unknown): Promise<{ error?: string; results?: ImportResult[] }> {
  const me = await getCurrentMember();
  if (me.role === "broker") return { error: "Sem permissão." };
  if (!orgWritable(me.org)) return READ_ONLY;

  const parsed = z.array(importRowSchema).min(1).max(IMPORT_MAX_ROWS).safeParse(rawRows);
  if (!parsed.success) return { error: `Envie de 1 a ${IMPORT_MAX_ROWS} pessoas por planilha.` };

  const limit = await rateLimit(`import:user:${me.userId}`, 5, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };

  // Equipes no escopo de quem importa, lidas com o cliente do usuário (RLS).
  const supabase = await createClient();
  const { data: teams } = await supabase.from("teams").select("id, name, division_id");
  const scoped = (teams ?? []).filter(
    (t) => me.role === "owner" || (me.role === "director" ? t.division_id === me.divisionId : t.id === me.teamId),
  );
  const byName = new Map(scoped.map((t) => [normalize(t.name), t]));

  const results: ImportResult[] = [];
  const valid: { line: number; fullName: string; email: string; role: Role; teamId: string; divisionId: string }[] = [];
  const seen = new Set<string>();

  for (const row of parsed.data) {
    const fail = (error: string) => results.push({ line: row.line, email: row.email, ok: false, error });
    const name = nameSchema.safeParse(row.fullName);
    const email = emailSchema.safeParse(row.email);
    const role = roleFromText(row.role);
    const team = row.team ? byName.get(normalize(row.team)) : scoped.length === 1 ? scoped[0] : undefined;
    if (!name.success) fail("Nome inválido.");
    else if (!email.success) fail("E-mail inválido.");
    else if (seen.has(email.data)) fail("E-mail repetido na planilha.");
    else if (!role) fail("Cargo deve ser corretor ou gerente.");
    else if (RANK[role] <= RANK[me.role]) fail("Cargo acima do que você pode convidar.");
    else if (!team) fail(row.team ? `Equipe "${row.team}" não encontrada.` : "Informe a equipe.");
    else {
      seen.add(email.data);
      valid.push({ line: row.line, fullName: name.data, email: email.data, role, teamId: team.id, divisionId: team.division_id });
    }
  }

  // Um por vez: o provedor de e-mail limita envios em rajada.
  for (const v of valid) {
    const r = await createInvite(me, { fullName: v.fullName, email: v.email, role: v.role, teamId: v.teamId, divisionId: v.divisionId });
    results.push(r.ok ? { line: v.line, email: v.email, ok: true } : { line: v.line, email: v.email, ok: false, error: r.error });
  }

  revalidatePath("/equipe");
  return { results: results.sort((a, b) => a.line - b.line) };
}

/** Troca o link de convite da conta. O antigo para de funcionar na hora. */
export async function regenerateInviteLink(): Promise<{ url?: string; error?: string }> {
  const me = await getCurrentMember();
  if (me.role !== "owner") return { error: "Só o administrador troca o link de convite." };
  const limit = await rateLimit(`invite-link:${me.org.id}`, 10, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };
  const code = await regenerateInviteCode(me.org.id);
  await createAdminClient().from("audit_log").insert({
    org_id: me.org.id,
    actor: me.userId,
    table_name: "platform",
    record_id: me.org.id,
    action: "regenerate_invite_link",
    new_data: {},
  });
  return { url: inviteUrl(code) };
}
