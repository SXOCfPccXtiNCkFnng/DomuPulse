import "server-only";
import { describeError, logger } from "@/lib/logger";
import { pushConfigured, sendToUsers } from "@/lib/push";
import type { Role } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";

type Notice = { kind: string; title: string; body?: string; url?: string };

/**
 * Cria avisos no sininho e manda o mesmo aviso como push para o celular e o
 * computador de quem ativou as notificações. Nunca lança: avisar não pode
 * quebrar o fluxo.
 */
export async function notifyUsers(orgId: string | null, userIds: string[], notice: Notice) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const { error } = await createAdminClient()
    .from("notifications")
    .insert(unique.map((user_id) => ({ user_id, org_id: orgId, ...notice })));
  if (error) logger.error("notify.insert", { message: describeError(error), orgId });

  // Sem as chaves VAPID o push fica desligado; o aviso no sininho continua.
  if (!pushConfigured()) return;
  try {
    // Sem tag: avisos de pessoas diferentes empilham em vez de substituir um ao outro.
    await sendToUsers(unique, { title: notice.title, body: notice.body ?? "", url: notice.url });
  } catch (pushError) {
    logger.warn("notify.push", { message: describeError(pushError), orgId });
  }
}

/** Avisa quem tem um dos cargos na organização (por exemplo, os administradores). */
export async function notifyRoles(orgId: string, roles: Role[], notice: Notice) {
  const { data } = await createAdminClient()
    .from("members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("active", true)
    .in("role", roles);
  await notifyUsers(orgId, (data ?? []).map((m) => m.user_id), notice);
}

/** Avisa a liderança acima de um membro: gerente da equipe, superintendente e administrador. */
export async function notifyLeadersOf(member: { orgId: string; teamId: string | null; divisionId: string | null }, notice: Notice) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("members")
    .select("user_id, role, team_id, division_id")
    .eq("org_id", member.orgId)
    .eq("active", true)
    .in("role", ["owner", "director", "manager"]);
  const leaders = (data ?? []).filter(
    (m) =>
      m.role === "owner" ||
      (m.role === "director" && member.divisionId && m.division_id === member.divisionId) ||
      (m.role === "manager" && member.teamId && m.team_id === member.teamId),
  );
  await notifyUsers(member.orgId, leaders.map((m) => m.user_id), notice);
}
