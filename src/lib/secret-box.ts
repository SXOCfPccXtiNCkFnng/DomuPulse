import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { nfseEnv } from "@/lib/env.server";

// Criptografia dos certificados digitais (AES-256-GCM). A chave fica só no
// servidor (NFSE_CERT_KEY): quem ler o banco vê apenas texto embaralhado.
// Formato: "v1.<iv>.<tag>.<conteúdo>", em base64.

export function seal(plain: Buffer | string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", nfseEnv().certKey, iv);
  const data = Buffer.concat([cipher.update(typeof plain === "string" ? Buffer.from(plain, "utf8") : plain), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function open(sealed: string) {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Segredo em formato desconhecido.");
  const decipher = createDecipheriv("aes-256-gcm", nfseEnv().certKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
}
