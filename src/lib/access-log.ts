import "server-only";
import { headers } from "next/headers";
import { describeError, logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Guarda o registro de acesso exigido pelo Marco Civil (art. 15): quem, IP e
 * quando. Nunca lança: uma falha aqui não pode impedir o login.
 */
export async function recordAccess(userId: string, event: "login" | "signup" | "join", ip: string) {
  try {
    const userAgent = (await headers()).get("user-agent")?.slice(0, 400) ?? null;
    const { error } = await createAdminClient()
      .from("access_logs")
      .insert({ user_id: userId, event, ip: ip.slice(0, 64), user_agent: userAgent });
    if (error) logger.warn("access_log.insert", { message: describeError(error) });
  } catch (error) {
    logger.warn("access_log.insert", { message: describeError(error) });
  }
}
