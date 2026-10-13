import { z } from "zod";

export const emailSchema = z
  .email("Informe um e-mail válido.")
  .max(254)
  .transform((v) => v.trim().toLowerCase());

// Mesma regra configurada no Supabase Auth: o servidor também rejeita.
export const passwordSchema = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.")
  .regex(/[a-z]/, "Inclua uma letra minúscula.")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula.")
  .regex(/[0-9]/, "Inclua um número.");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Nome muito curto.")
  .max(120, "Nome muito longo.");

export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
