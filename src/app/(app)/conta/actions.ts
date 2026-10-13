"use server";

import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { sendToUsers } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
