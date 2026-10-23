"use server";

import { revalidatePath } from "next/cache";
import { connectInstance, connectionState, createInstance, deleteInstance, EvolutionError, instanceName, logoutInstance, setWebhook } from "@/lib/evolution";
import { describeError, logger } from "@/lib/logger";
import { requireHr } from "@/lib/recruitment";
import { createAdminClient } from "@/lib/supabase/admin";

const STATE_TO_STATUS: Record<string, "connected" | "connecting" | "disconnected"> = {
  open: "connected",
  connecting: "connecting",
  close: "disconnected",
};

async function ownerHr() {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  if (gate.role !== "owner") return { error: "Só o administrador conecta o WhatsApp." };
  return gate;
}

/** Cria (ou reabre) a instância da empresa e devolve o QR para parear. */
export async function startConnection() {
  const gate = await ownerHr();
  if ("error" in gate) return gate;
  const orgId = gate.org.id;
  const admin = createAdminClient();

  try {
    await admin.from("wa_connections").upsert({ org_id: orgId, instance: instanceName(orgId), status: "connecting", updated_at: new Date().toISOString() });

    // Garante a instância pré-configurada. Se já existe, segue em frente.
    let qr: { qrcodeBase64: string | null; pairingCode: string | null } | null = null;
    try {
      qr = await createInstance(orgId);
    } catch (error) {
      const exists = error instanceof EvolutionError && (error.status === 403 || error.status === 409 || /exist|already|in use/i.test(error.message));
      if (!exists) throw error;
      // Instância antiga: reaponta o webhook, que pode estar com um endereço velho.
      await setWebhook(orgId).catch((e) => logger.warn("wa.webhook_set", { message: describeError(e), orgId }));
    }

    // Se já está conectado, não precisa de QR.
    const state = await connectionState(orgId).catch(() => ({ state: "close", number: null as string | null }));
    if (state.state === "open") {
      await admin.from("wa_connections").update({ status: "connected", phone: state.number, updated_at: new Date().toISOString() }).eq("org_id", orgId);
      revalidatePath("/conta");
      return { qrcodeBase64: null, pairingCode: null, connected: true };
    }

    // Busca o QR de pareamento (a criação nem sempre devolve junto).
    if (!qr?.qrcodeBase64) qr = await connectInstance(orgId);
    revalidatePath("/conta");
    return { qrcodeBase64: qr.qrcodeBase64, pairingCode: qr.pairingCode };
  } catch (error) {
    // Detalhe técnico fica só no log interno; o usuário vê uma mensagem simples.
    const detail = error instanceof EvolutionError ? `${error.status} ${error.message}` : describeError(error);
    logger.error("wa.connect", { message: detail, orgId });
    return { error: "Não foi possível conectar agora. Tente de novo em instantes." };
  }
}

/** Confere a situação atual direto no Evolution e grava. */
export async function refreshStatus() {
  const gate = await requireHr();
  if ("error" in gate) return gate;
  const orgId = gate.org.id;
  try {
    const { state, number } = await connectionState(orgId);
    const status = STATE_TO_STATUS[state] ?? "disconnected";
    await createAdminClient()
      .from("wa_connections")
      .update({ status, ...(number ? { phone: number } : {}), updated_at: new Date().toISOString() })
      .eq("org_id", orgId);
    revalidatePath("/conta");
    return { status, number };
  } catch {
    return { status: "disconnected" as const, number: null };
  }
}

/** Desconecta o número. A instância fica guardada para reconectar depois. */
export async function disconnectWhatsapp() {
  const gate = await ownerHr();
  if ("error" in gate) return gate;
  const orgId = gate.org.id;
  try {
    await logoutInstance(orgId).catch(() => {});
    await createAdminClient().from("wa_connections").update({ status: "disconnected", phone: null, updated_at: new Date().toISOString() }).eq("org_id", orgId);
    revalidatePath("/conta");
    return { ok: true };
  } catch (error) {
    logger.error("wa.disconnect", { message: describeError(error), orgId });
    return { error: "Não foi possível desconectar." };
  }
}

/** Apaga a instância por completo (recomeçar do zero). */
export async function resetWhatsapp() {
  const gate = await ownerHr();
  if ("error" in gate) return gate;
  const orgId = gate.org.id;
  try {
    await deleteInstance(orgId).catch(() => {});
    await createAdminClient().from("wa_connections").delete().eq("org_id", orgId);
    revalidatePath("/conta");
    return { ok: true };
  } catch {
    return { error: "Não foi possível reiniciar." };
  }
}
