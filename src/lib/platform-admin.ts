import "server-only";
import { notFound } from "next/navigation";
import { isPlatformAdminEmail, platformAdminEmails } from "@/lib/platform-admins";
import { createClient } from "@/lib/supabase/server";

export { platformAdminEmails };

/**
 * Libera o painel interno só para a lista de e-mails. Para qualquer outra
 * pessoa, logada ou não, a rota responde "não encontrada": não revela que
 * o painel existe. O proxy já barra antes; esta é a segunda checagem, feita
 * em toda página e ação do painel.
 */
export async function platformAdminSession(): Promise<{ email: string; userId: string; aal2: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  const userId = data?.claims?.sub;
  if (!userId || !isPlatformAdminEmail(email)) notFound();
  return { email: String(email).toLowerCase(), userId, aal2: data?.claims?.aal === "aal2" };
}

/**
 * Ações e dados do painel usam a chave de serviço, que ignora o RLS: a
 * verificação em duas etapas é exigida aqui, no código, sempre.
 */
export async function requirePlatformAdmin(): Promise<{ email: string; userId: string }> {
  const session = await platformAdminSession();
  if (!session.aal2) notFound();
  return session;
}
