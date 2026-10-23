import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_RULES } from "@/lib/password";
import { validatePhoneBR } from "@/lib/phone";

export const emailSchema = z
  .email("Informe um e-mail válido, como voce@empresa.com.br.")
  .max(254)
  .transform((v) => v.trim().toLowerCase());

// Mesma regra configurada no Supabase Auth e mostrada no formulário.
export const passwordSchema = z
  .string()
  .max(PASSWORD_MAX, `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`)
  .superRefine((value, ctx) => {
    const failed = PASSWORD_RULES.find((r) => !r.test(value));
    if (failed) {
      ctx.addIssue({
        code: "custom",
        message: value.length < PASSWORD_MIN ? `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.` : `Falta na senha: ${failed.label.toLowerCase()}.`,
      });
    }
  });

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Nome muito curto.")
  .max(120, "Nome muito longo.");

// Nome e sobrenome, sem números nem símbolos.
export const fullNameSchema = nameSchema
  .refine((v) => v.split(/\s+/).filter((p) => p.length >= 2).length >= 2, "Informe nome e sobrenome.")
  .refine((v) => !/[0-9!@#$%^&*()_+=[\]{};:"\\|,.<>/?]/.test(v), "O nome não pode ter números ou símbolos.");

export const phoneSchema = z.string().transform((value, ctx) => {
  const result = validatePhoneBR(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }
  return result.digits;
});

export const acceptTermsSchema = z.literal("on", {
  error: "Para continuar, aceite os Termos de Uso e a Política de Privacidade.",
});

export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  // O React limpa o formulário depois do envio: devolvemos o que foi
  // digitado para repor nos campos. Nunca inclui senha.
  values?: Record<string, string>;
};

export function keep(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "").slice(0, 200)]));
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
