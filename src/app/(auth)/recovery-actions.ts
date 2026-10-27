"use server";

import { clearRecoveryCodes, consumeRecoveryCode } from "@/lib/mfa-recovery";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Login com código de recuperação, quando a pessoa perdeu o aplicativo de
 * códigos. Ela já passou pela senha (sessão aal1). Um código válido remove o
 * 2FA da conta para ela entrar só com a senha; depois configura de novo.
 */
export async function recoverWithCode(codeInput: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: "Sessão expirada. Entre de novo." };

  const limit = await rateLimit(`mfa-recovery:${userId}`, 5, 15 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };

  const ok = await consumeRecoveryCode(userId, codeInput);
  if (!ok) return { error: "Código inválido ou já usado." };

  // Código certo: remove os fatores de 2FA para liberar a entrada só com a senha.
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  for (const f of data.user?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId }).catch(() => {});
  }
  // Os códigos restantes não valem mais (o 2FA foi removido).
  await clearRecoveryCodes(userId);
  return { ok: true };
}
