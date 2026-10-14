import "server-only";
import { siteUrl } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

// Link de convite da conta. A tabela é só do servidor: quem chama já conferiu
// que a pessoa pode ver ou trocar o link.

export const INVITE_CODE = /^[0-9a-f]{32}$/;

function newCode() {
  return crypto.randomUUID().replaceAll("-", "");
}

/** Código atual da conta. O banco cria um junto com a conta; aqui só cobre a falta. */
export async function getInviteCode(orgId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("org_invites").select("code").eq("org_id", orgId).maybeSingle();
  if (data) return data.code as string;
  const { data: created } = await admin
    .from("org_invites")
    .upsert({ org_id: orgId, code: newCode() }, { onConflict: "org_id", ignoreDuplicates: true })
    .select("code")
    .maybeSingle();
  if (created) return created.code as string;
  // Outra requisição criou ao mesmo tempo: lê o dela.
  const { data: again } = await admin.from("org_invites").select("code").eq("org_id", orgId).single();
  return again?.code as string;
}

/** Troca o código: o link antigo para de funcionar na hora. */
export async function regenerateInviteCode(orgId: string) {
  const code = newCode();
  await createAdminClient().from("org_invites").upsert({ org_id: orgId, code, created_at: new Date().toISOString() });
  return code;
}

export function inviteUrl(code: string) {
  return siteUrl(`/convite/${code}`);
}

/** Conta dona do código, se o link ainda vale. Conta cancelada não recebe ninguém. */
export async function findOrgByInviteCode(code: string) {
  if (!INVITE_CODE.test(code)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("org_invites")
    .select("organizations (id, name, status)")
    .eq("code", code)
    .maybeSingle<{ organizations: { id: string; name: string; status: string } | null }>();
  const org = data?.organizations;
  if (!org || org.status === "canceled") return null;
  return { id: org.id, name: org.name };
}
