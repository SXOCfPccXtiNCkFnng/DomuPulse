"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { AsaasError, deleteSubscription } from "@/lib/asaas";
import { getCurrentMember } from "@/lib/auth";
import { describeError, logger } from "@/lib/logger";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation";

/**
 * Exclusão de conta pelo próprio usuário (LGPD, art. 18).
 *
 * Corretor, gerente e superintendente: os dados pessoais somem (nome, e-mail,
 * aparelhos, avisos) e o acesso é bloqueado de vez. Os números de produção
 * ficam para a imobiliária como "Pessoa removida": são registros do trabalho,
 * que a empresa pode guardar, e apagá-los quebraria os relatórios da equipe.
 *
 * Administrador: é o dono da conta, então excluir apaga a imobiliária inteira,
 * depois de cancelar a assinatura no Asaas.
 */
export async function deleteMyAccount(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  const limit = await rateLimit(`delete-account:${me.userId}`, 5, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };

  const admin = createAdminClient();

  if (me.role === "owner") {
    if (confirmation !== me.org.name) {
      return { fieldErrors: { confirmation: `Digite o nome da imobiliária exatamente como aparece: ${me.org.name}` } };
    }

    // Sem cancelar no Asaas, a cobrança continuaria depois de a conta sumir.
    const { data: org } = await admin.from("organizations").select("asaas_subscription_id").eq("id", me.org.id).single();
    const subscriptionId = (org?.asaas_subscription_id as string | null) ?? null;
    if (subscriptionId) {
      try {
        await deleteSubscription(subscriptionId);
      } catch (error) {
        logger.error("account.delete_org_subscription", {
          message: error instanceof AsaasError ? `Asaas ${error.status}` : describeError(error),
          orgId: me.org.id,
        });
        return { error: "Não foi possível cancelar a assinatura agora, então nada foi apagado. Tente de novo em alguns minutos." };
      }
    }

    const { data: members } = await admin.from("members").select("user_id").eq("org_id", me.org.id);
    // Apagar a organização leva junto equipes, membros, relatórios, clientes e agenda.
    const { error } = await admin.from("organizations").delete().eq("id", me.org.id);
    if (error) {
      logger.error("account.delete_org", { message: describeError(error), orgId: me.org.id });
      return { error: "Não foi possível excluir agora. Tente de novo ou fale com a gente pelo WhatsApp." };
    }
    await Promise.all((members ?? []).map((m) => admin.auth.admin.deleteUser(m.user_id as string)));
    // O registro de alterações guarda cópias dos dados (inclusive as geradas
    // agora pela exclusão em cascata): sai junto com a imobiliária.
    await admin.from("audit_log").delete().eq("org_id", me.org.id);
    await admin.from("audit_log").insert({
      org_id: null,
      actor: null,
      table_name: "platform",
      record_id: null,
      action: "delete_org",
      new_data: { org_name: me.org.name, members: members?.length ?? 0 },
    });
  } else {
    if (confirmation.toUpperCase() !== "EXCLUIR") return { fieldErrors: { confirmation: "Digite EXCLUIR para confirmar." } };

    const { error: authError } = await admin.auth.admin.updateUserById(me.userId, {
      // Endereço que ninguém recebe, para o e-mail real ficar livre e sumir do sistema.
      email: `removido-${me.userId}@removido.domutech.digital`,
      email_confirm: true,
      password: randomBytes(32).toString("base64url"),
      user_metadata: {},
      ban_duration: "876000h",
    });
    if (authError) {
      logger.error("account.anonymize_user", { message: describeError(authError), orgId: me.org.id });
      return { error: "Não foi possível excluir agora. Tente de novo ou fale com a gente pelo WhatsApp." };
    }
    await Promise.all([
      admin
        .from("members")
        .update({ full_name: "Pessoa removida", active: false, digest_email: null, weekly_digest: false, terms_accepted_ip: null })
        .eq("id", me.id),
      admin.from("push_subscriptions").delete().eq("user_id", me.userId),
      admin.from("notifications").delete().eq("user_id", me.userId),
    ]);
    // Cópias antigas do cadastro da pessoa no registro de alterações.
    await admin.from("audit_log").delete().eq("table_name", "members").eq("record_id", me.id);
    await admin.from("audit_log").insert({
      org_id: me.org.id,
      actor: null,
      table_name: "platform",
      record_id: me.id,
      action: "delete_account",
      new_data: { role: me.role },
    });
  }

  await (await createClient()).auth.signOut({ scope: "global" }).catch(() => {});
  redirect("/entrar?conta=excluida");
}
