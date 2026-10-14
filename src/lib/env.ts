import { z } from "zod";

// As variáveis NEXT_PUBLIC_ precisam ser lidas por nome literal para que o
// Next consiga embuti-las no bundle do cliente.
const publicSchema = z.object({
  supabaseUrl: z.url(),
  supabaseKey: z.string().min(20),
  siteUrl: z.url(),
});

let cachedPublic: z.infer<typeof publicSchema> | undefined;

export function publicEnv() {
  cachedPublic ??= publicSchema.parse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
  return cachedPublic;
}

export function vapidPublicKey() {
  return z.string().min(20).parse(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

/** Igual a vapidPublicKey, mas sem quebrar a página quando a chave ainda não foi configurada. */
export function vapidPublicKeyOrNull() {
  const parsed = z.string().min(20).safeParse(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  return parsed.success ? parsed.data : null;
}
