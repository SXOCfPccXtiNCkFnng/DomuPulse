import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { cronSecret } from "@/lib/env.server";

/**
 * Autentica chamadas do cron-job.org: cabeçalho
 * `Authorization: Bearer <CRON_SECRET>`, comparado em tempo constante.
 * Sem segredo configurado, ninguém passa.
 */
export function isCronRequest(request: NextRequest): boolean {
  let secret: string;
  try {
    secret = cronSecret();
  } catch {
    return false;
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
