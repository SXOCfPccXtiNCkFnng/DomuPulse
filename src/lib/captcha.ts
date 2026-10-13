import "server-only";
import { logger } from "@/lib/logger";

export const CAPTCHA_FIELD = "cf-turnstile-response";

export function captchaEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/**
 * Confere o desafio do Cloudflare Turnstile no servidor. Sem as chaves
 * configuradas, o captcha fica desligado (útil no desenvolvimento) e a
 * Saúde do sistema do painel interno avisa.
 */
export async function verifyCaptcha(formData: FormData, ip: string): Promise<boolean> {
  if (!captchaEnabled()) return true;
  const token = formData.get(CAPTCHA_FIELD);
  if (typeof token !== "string" || !token || token.length > 2048) return false;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!data.success) logger.warn("captcha.rejected", { message: (data["error-codes"] ?? []).join(", ") || "recusado" });
    return Boolean(data.success);
  } catch (error) {
    // Cloudflare fora do ar não pode travar o login: libera e registra.
    logger.error("captcha.unavailable", { message: error instanceof Error ? error.message : String(error) });
    return true;
  }
}

export const CAPTCHA_ERROR = "Confirme que você não é um robô e tente de novo.";
