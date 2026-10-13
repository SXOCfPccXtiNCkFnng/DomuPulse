import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

type Bucket = { count: number; resetAt: number };
type Result = { ok: true } | { ok: false; retryAfterSec: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

// Primeira barreira, barata: memória da instância. Limpa janelas vencidas
// de tempos em tempos para o mapa não crescer sem fim.
function hitMemory(key: string, limit: number, windowMs: number): Result {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > limit) return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  return { ok: true };
}

/**
 * Limite de tentativas que vale para todas as instâncias (contagem no banco).
 * Se o banco falhar, vale só a memória: o login nunca sai do ar por causa
 * do limitador.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<Result> {
  const local = hitMemory(key, limit, windowSec * 1000);
  if (!local.ok) return local;

  try {
    const { data, error } = await createAdminClient()
      .rpc("hit_rate_limit", { p_key: key, p_window_seconds: windowSec })
      .single<{ hits: number; resets_at: string }>();
    if (error || !data) return local;
    if (data.hits > limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((Date.parse(data.resets_at) - Date.now()) / 1000)) };
    }
    return { ok: true };
  } catch {
    return local;
  }
}

// Na Vercel, o primeiro IP de x-forwarded-for é o do visitante.
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

export function tooManyAttempts(retryAfterSec: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Muitas tentativas. Tente de novo em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
}
