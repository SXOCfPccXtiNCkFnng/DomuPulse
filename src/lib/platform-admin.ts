import "server-only";
import { redirect } from "next/navigation";
import { isPlatformAdminEmail, platformAdminEmails } from "@/lib/platform-admins";
import { createClient } from "@/lib/supabase/server";

export { platformAdminEmails };

/**
 * Libera o painel interno só para a lista de e-mails (PLATFORM_ADMIN_EMAILS).
 * Sem login vai para o login; fora da lista vê "sem acesso". O proxy já barra
 * antes; esta é a segunda checagem, feita em toda página e ação do painel.
 */
export async function platformAdminSession(): Promise<{ email: string; userId: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  const userId = data?.claims?.sub;
  if (!userId) redirect("/entrar?proximo=/interno");
  if (!isPlatformAdminEmail(email)) redirect("/sem-acesso");
  return { email: String(email).toLowerCase(), userId };
}

/** Ações e dados do painel usam a chave de serviço, que ignora o RLS: toda ação confere a lista de novo. */
export const requirePlatformAdmin = platformAdminSession;
