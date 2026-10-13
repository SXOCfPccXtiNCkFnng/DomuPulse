"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember, ROLE_RANK as RANK, type CurrentMember, type Role } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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

  const admin = createAdminClient();

  const [{ count }, { data: org }] = await Promise.all([
    admin.from("members").select("id", { count: "exact", head: true }).eq("org_id", me.org.id).eq("active", true),
    admin.from("organizations").select("seats").eq("id", me.org.id).single(),
  ]);
  if (org && (count ?? 0) >= org.seats) {
    return { error: `Todos os ${org.seats} assentos do plano estão em uso. Desative alguém ou aumente o plano.` };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${publicEnv().siteUrl}/auth/confirm`,
    data: { full_name: fullName },
  });
  if (inviteError || !invited.user) {
    if (inviteError?.code === "email_exists") return { fieldErrors: { email: "Este e-mail já tem conta no Pulse." } };
    return { error: "Não foi possível enviar o convite. Tente novamente." };
  }

  const { error: memberError } = await admin.from("members").insert({
    org_id: me.org.id,
    user_id: invited.user.id,
    full_name: fullName,
    role,
    team_id: teamId,
    division_id: divisionId,
  });
  if (memberError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return { error: "Não foi possível cadastrar o membro. Tente novamente." };
  }

  revalidatePath("/equipe");
  return { success: `Convite enviado para ${email}.` };
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
