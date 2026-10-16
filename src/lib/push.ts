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

// Só os serviços de push dos navegadores. Sem isso, o endpoint seria qualquer
// https:// e o servidor faria requisições a hosts arbitrários (SSRF cego).
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", ".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];

export function isPushEndpoint(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return PUSH_HOSTS.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));
  } catch {
    return false;
  }
}

/** As chaves VAPID estão no ambiente? Sem elas não há como mandar push. */
export function pushConfigured() {
  try {
    pushEnv();
    vapidPublicKey();
    return true;
  } catch {
    return false;
  }
}

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
    (subs ?? []).filter((s) => isPushEndpoint(s.endpoint)).map(async (s) => {
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
