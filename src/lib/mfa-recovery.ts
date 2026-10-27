import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Códigos de recuperação do 2FA. Guardamos só o hash (scrypt + salt por código);
// o texto só aparece uma vez, na geração. Tudo com a chave de serviço.

const CODE_COUNT = 10;
// Sem 0, O, 1, I, L para não confundir na hora de digitar.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode() {
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`; // formato ABCD-EFGH
}

/** Deixa só letras e números em maiúsculo (tira traços e espaços). */
export function normalizeCode(input: string) {
  return String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashCode(normalized: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(normalized, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyHash(normalized: string, stored: string) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const got = scryptSync(normalized, Buffer.from(saltHex, "hex"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Gera (substituindo os antigos) os códigos da pessoa. Devolve o texto uma única vez. */
export async function generateRecoveryCodes(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const codes = Array.from({ length: CODE_COUNT }, randomCode);
  await admin.from("mfa_recovery_codes").delete().eq("user_id", userId);
  await admin.from("mfa_recovery_codes").insert(codes.map((c) => ({ user_id: userId, code_hash: hashCode(normalizeCode(c)) })));
  return codes;
}

/** Confere um código e o marca como usado. Não mexe nos fatores de 2FA. */
export async function consumeRecoveryCode(userId: string, input: string): Promise<boolean> {
  const code = normalizeCode(input);
  if (code.length < 6) return false;
  const admin = createAdminClient();
  const { data } = await admin.from("mfa_recovery_codes").select("id, code_hash").eq("user_id", userId).is("used_at", null);
  for (const row of (data ?? []) as { id: string; code_hash: string }[]) {
    if (verifyHash(code, row.code_hash)) {
      await admin.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
      return true;
    }
  }
  return false;
}

/** Apaga todos os códigos da pessoa (ao desativar o 2FA ou após usar um código). */
export async function clearRecoveryCodes(userId: string) {
  await createAdminClient().from("mfa_recovery_codes").delete().eq("user_id", userId);
}
