import "server-only";
import webpush from "web-push";
import { vapidPublicKey } from "@/lib/env";
import { pushEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  // Notificações com a mesma tag substituem a anterior em vez de empilhar.
  tag?: string;
};

let configured = false;
function configure() {
  if (configured) return;
  const { privateKey, subject } = pushEnv();
  webpush.setVapidDetails(subject, vapidPublicKey(), privateKey);
  configured = true;
}

export async function sendToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0) return { sent: 0 };
  configure();

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .in("user_id", userIds);

  const body = JSON.stringify(payload);
  const expired: string[] = [];
  let sent = 0;

  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          body,
          { TTL: 60 * 30, urgency: "high" },
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404 e 410: o navegador descartou a inscrição. Removemos para não insistir.
        if (status === 404 || status === 410) expired.push(s.id);
        else console.error("push falhou", status);
      }
    }),
  );

  if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
  return { sent };
}
