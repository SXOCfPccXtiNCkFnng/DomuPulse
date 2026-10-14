"use server";

import { after } from "next/server";
import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { sendDigestEmailChangedEmail } from "@/lib/email-templates";
import { sendToUsers } from "@/lib/push";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, type FormState } from "@/lib/validation";

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({
    p256dh: z.string().min(20).max(200),
    auth: z.string().min(8).max(100),
  }),
});

export async function savePushSubscription(input: unknown, userAgent: string) {
  const me = await getCurrentMember();
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  // O mesmo aparelho pode trocar de usuário (celular compartilhado). O
  // endpoint passa a pertencer a quem está logado agora.
  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: me.userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth_key: parsed.data.keys.auth,
      user_agent: userAgent.slice(0, 400),
    },
    { onConflict: "endpoint" },
  );
  return { ok: !error };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

export async function sendTestNotification() {
  const me = await getCurrentMember();
  const { sent } = await sendToUsers([me.userId], {
    title: "Tudo certo",
    body: "Você vai receber os lembretes de relatório neste aparelho.",
    url: "/painel",
    tag: "teste",
  });
  return { sent };
}

const digestScheduleSchema = z.object({
  daily: z.boolean(),
  dailyHour: z.number().int().min(0).max(23).nullable(),
  weekly: z.boolean(),
  weeklyWeekday: z.number().int().min(0).max(6),
  monthly: z.boolean(),
});

/** Quais resumos por e-mail a pessoa recebe e quando (só liderança recebe). */
export async function setDigestSchedule(input: unknown) {
  const me = await getCurrentMember();
  if (me.role === "broker") return { ok: false };
  const parsed = digestScheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const v = parsed.data;
  const { error } = await createAdminClient()
    .from("members")
    .update({
      daily_digest: v.daily,
      daily_digest_hour: v.dailyHour,
      weekly_digest: v.weekly,
      weekly_digest_weekday: v.weeklyWeekday,
      monthly_digest: v.monthly,
    })
    .eq("id", me.id);
  return { ok: !error };
}

/** E-mail para receber o resumo semanal. Vazio volta para o e-mail de login. */
export async function setDigestEmail(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role === "broker") return { error: "Sem permissão." };
  const raw = String(formData.get("digestEmail") ?? "").trim();
  const parsed = raw ? emailSchema.safeParse(raw) : null;
  if (parsed && !parsed.success) return { fieldErrors: { digestEmail: "E-mail inválido." }, values: { digestEmail: raw } };
  const digestEmail = parsed?.data ?? null;

  const limit = await rateLimit(`digest-email:${me.id}`, 10, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec), values: { digestEmail: raw } };

  const admin = createAdminClient();
  const { data: before } = await admin.from("members").select("digest_email").eq("id", me.id).single();
  const { error } = await admin.from("members").update({ digest_email: digestEmail }).eq("id", me.id);
  if (error) return { error: "Não foi possível salvar. Tente de novo.", values: { digestEmail: raw } };

  // Mudou o destino dos dados da equipe: avisa o e-mail de login, como na troca
  // de senha. Se a conta foi invadida, o dono fica sabendo na hora.
  if ((before?.digest_email ?? null) !== digestEmail) {
    const { data: auth } = await (await createClient()).auth.getClaims();
    const loginEmail = auth?.claims?.email;
    if (loginEmail) after(() => sendDigestEmailChangedEmail({ to: loginEmail, newEmail: digestEmail }));
  }
  return { success: digestEmail ? `O resumo vai chegar em ${digestEmail}.` : "O resumo vai chegar no seu e-mail de login.", values: { digestEmail: digestEmail ?? "" } };
}
