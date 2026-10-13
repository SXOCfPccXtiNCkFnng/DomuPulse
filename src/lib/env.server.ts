import "server-only";
import { z } from "zod";

// Cada área valida só o que usa: faltar a chave do Asaas não derruba o login.
function lazy<T>(read: () => T) {
  let value: T | undefined;
  return () => (value ??= read());
}

export const supabaseSecretKey = lazy(() =>
  z.string().min(20, "SUPABASE_SECRET_KEY ausente").parse(process.env.SUPABASE_SECRET_KEY),
);

export const pushEnv = lazy(() =>
  z
    .object({
      privateKey: z.string().min(20),
      subject: z.string().regex(/^(mailto:|https:\/\/)/),
    })
    .parse({
      privateKey: process.env.VAPID_PRIVATE_KEY,
      subject: process.env.VAPID_SUBJECT,
    }),
);

export const cronSecret = lazy(() =>
  z.string().min(32, "CRON_SECRET precisa de 32 caracteres ou mais").parse(process.env.CRON_SECRET),
);

export const emailEnv = lazy(() =>
  z
    .object({
      resendApiKey: z.string().startsWith("re_"),
      from: z.string().min(5),
    })
    .parse({
      resendApiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
    }),
);

export const asaasEnv = lazy(() =>
  z
    .object({
      env: z.enum(["sandbox", "production"]),
      apiKey: z.string().min(20),
      webhookToken: z.string().min(32),
    })
    .parse({
      env: process.env.ASAAS_ENV,
      apiKey: process.env.ASAAS_API_KEY,
      webhookToken: process.env.ASAAS_WEBHOOK_TOKEN,
    }),
);
