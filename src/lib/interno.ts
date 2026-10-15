import "server-only";
import { publicEnv, vapidPublicKey } from "@/lib/env";
import { HEARTBEATS } from "@/lib/heartbeat";
import { getMonthlyPriceCents } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIMEZONE, todayIn } from "@/lib/time";

// Tudo aqui usa a chave de serviço. Só chame depois de requirePlatformAdmin().

export type OrgStatusView = "trial" | "trial_expired" | "active" | "past_due" | "canceled";

type OrgRow = {
  id: string;
  name: string;
  status: "trialing" | "active" | "past_due" | "canceled";
  trial_ends_at: string;
  price_cents: number | null;
  coupon_code: string | null;
  contact_phone: string | null;
  created_at: string;
};

export function statusView(org: Pick<OrgRow, "status" | "trial_ends_at">): OrgStatusView {
  if (org.status === "trialing") return new Date(org.trial_ends_at) > new Date() ? "trial" : "trial_expired";
  return org.status;
}

export async function loadOverview() {
  const admin = createAdminClient();
  const today = todayIn(DEFAULT_TIMEZONE);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ data: orgs }, { count: activeMembers }, { count: brokers }, { count: reportsToday }, { count: openErrors }, currentPrice] =
    await Promise.all([
      admin.from("organizations").select("id, name, status, trial_ends_at, price_cents, coupon_code, created_at"),
      admin.from("members").select("id", { count: "exact", head: true }).eq("active", true),
      admin.from("members").select("id", { count: "exact", head: true }).eq("active", true).eq("role", "broker"),
      admin.from("reports").select("id", { count: "exact", head: true }).eq("report_date", today),
      admin.from("ops_alerts").select("id", { count: "exact", head: true }).is("resolved_at", null).eq("level", "error"),
      getMonthlyPriceCents(),
    ]);

  const list = (orgs ?? []) as OrgRow[];
  const byStatus: Record<OrgStatusView, number> = { trial: 0, trial_expired: 0, active: 0, past_due: 0, canceled: 0 };
  let mrrCents = 0;
  for (const org of list) {
    const view = statusView(org);
    byStatus[view]++;
    if (view === "active" || view === "past_due") {
      // Valor gravado na assinatura. Acesso liberado à mão conta pelo valor vigente.
      mrrCents += org.price_cents ?? currentPrice;
    }
  }

  const in3days = Date.now() + 3 * 86_400_000;
  const endingSoon = list
    .filter((o) => statusView(o) === "trial" && Date.parse(o.trial_ends_at) <= in3days)
    .sort((a, b) => Date.parse(a.trial_ends_at) - Date.parse(b.trial_ends_at));

  return {
    totalOrgs: list.length,
    byStatus,
    mrrCents,
    newThisWeek: list.filter((o) => o.created_at >= weekAgo).length,
    activeMembers: activeMembers ?? 0,
    brokers: brokers ?? 0,
    reportsToday: reportsToday ?? 0,
    openErrors: openErrors ?? 0,
    endingSoon: endingSoon.map((o) => ({ id: o.id, name: o.name, trialEndsAt: o.trial_ends_at })),
  };
}

export type HealthStatus = "ok" | "warn" | "fail";
export type HealthCheck = { id: string; group: string; label: string; status: HealthStatus; detail: string; fix?: string };

function has(value: string | undefined, min = 1) {
  return Boolean(value && value.trim().length >= min);
}

function ago(iso: string | null) {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

export async function loadHealth(): Promise<HealthCheck[]> {
  const admin = createAdminClient();
  const checks: HealthCheck[] = [];
  const env = process.env;
  const deploy = "Cadastre na Vercel em Settings, Environment Variables, e faça um novo deploy.";

  // Configuração
  const vapid = (() => {
    try {
      vapidPublicKey();
      return has(env.VAPID_PRIVATE_KEY, 20);
    } catch {
      return false;
    }
  })();
  const config: [string, boolean, string, string?][] = [
    ["E-mail (Resend)", has(env.RESEND_API_KEY) && has(env.EMAIL_FROM), "boas-vindas, convites, senha e avisos"],
    ["Notificações (VAPID)", vapid, "lembretes no celular"],
    ["Segredo do cron", has(env.CRON_SECRET, 32), "chamadas do cron-job.org", "Mínimo de 32 caracteres."],
    ["Asaas", has(env.ASAAS_API_KEY) && has(env.ASAAS_WEBHOOK_TOKEN, 32), "cobrança das assinaturas"],
    ["Notas fiscais (NFS-e)", Buffer.from(env.NFSE_CERT_KEY ?? "", "base64").length === 32 && (env.NFSE_ENV === "homologacao" || env.NFSE_ENV === "producao"), "emissão de notas fiscais pelos corretores", env.NFSE_ENV === "homologacao" ? "Em homologação: as notas saem sem valor fiscal." : undefined],
    ["Administradores do painel", has(env.PLATFORM_ADMIN_EMAILS), "acesso a este painel e alertas de erro"],
    ["Captcha (Turnstile)", has(env.TURNSTILE_SECRET_KEY) && has(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY), "proteção contra robôs no cadastro e login"],
  ];
  for (const [label, ok, why, extra] of config) {
    checks.push({
      id: `env-${label}`,
      group: "Configuração",
      label,
      status: ok ? "ok" : "fail",
      detail: ok ? `Configurado (${why}).` : `Não configurado: afeta ${why}.${extra ? ` ${extra}` : ""}`,
      fix: ok ? undefined : deploy,
    });
  }
  const site = publicEnv().siteUrl;
  checks.push({
    id: "env-site",
    group: "Configuração",
    label: "Endereço do app",
    status: site.startsWith("https://") ? "ok" : process.env.NODE_ENV === "production" ? "fail" : "warn",
    detail: `NEXT_PUBLIC_SITE_URL é ${site}.`,
    fix: site.startsWith("https://") ? undefined : "Em produção use https://pulse.domutech.digital.",
  });
  if (env.ASAAS_ENV !== "production") {
    checks.push({
      id: "env-asaas-sandbox",
      group: "Configuração",
      label: "Asaas em modo de teste",
      status: process.env.NODE_ENV === "production" ? "warn" : "ok",
      detail: "ASAAS_ENV não está como production: cobranças não são reais.",
      fix: "Troque para production quando começar a cobrar.",
    });
  }

  // Banco: cada migração deixa uma marca que o código usa.
  const marks: [string, string, string][] = [
    ["organizations", "subscribed_seats, coupon_code", "20261013010000_platform.sql"],
    ["organizations", "price_cents", "20261014000000_flat_price_invite_link.sql"],
    ["platform_settings", "monthly_price_cents", "20261014000000_flat_price_invite_link.sql"],
    ["org_invites", "code", "20261014000000_flat_price_invite_link.sql"],
    ["reports", "notes", "20261014010000_report_notes.sql"],
    ["members", "digest_email", "20261014020000_client_owner_digest_email.sql"],
    ["organizations", "cancel_at", "20261014030000_subscription_cancel.sql"],
    ["access_logs", "id", "20261014040000_access_logs.sql"],
    ["members", "daily_digest", "20261014050000_daily_digest.sql"],
    ["members", "daily_digest_hour, weekly_digest_weekday, monthly_digest", "20261014060000_digest_schedule.sql"],
    ["invoices", "id", "20261015000000_invoices.sql"],
    ["fiscal_profiles", "member_id", "20261015010000_nfse.sql"],
    ["members", "terms_version", "20261013010000_platform.sql"],
    ["ops_alerts", "fingerprint", "20261013010000_platform.sql"],
    ["system_heartbeats", "name", "20261013010000_platform.sql"],
    ["rate_limits", "key", "20261013010000_platform.sql"],
  ];
  const results = await Promise.all(marks.map(([t, c]) => admin.from(t).select(c).limit(1)));
  const missing = marks.filter((_, i) => results[i].error);
  checks.push({
    id: "db",
    group: "Banco de dados",
    label: "Tabelas e colunas usadas pelo código",
    status: missing.length ? "fail" : "ok",
    detail: missing.length ? `Faltando: ${missing.map(([t, c]) => `${t} (${c})`).join("; ")}.` : `${marks.length} verificações em dia.`,
    fix: missing.length ? `Aplique a migração ${[...new Set(missing.map((m) => m[2]))].join(", ")} no Supabase.` : undefined,
  });

  // Rotinas
  const { data: beats } = await admin.from("system_heartbeats").select("name, last_run_at, last_ok_at, last_error");
  const byName = new Map((beats ?? []).map((b) => [b.name as string, b]));
  for (const hb of HEARTBEATS) {
    const beat = byName.get(hb.name);
    const lastOk = beat?.last_ok_at ?? null;
    let status: HealthStatus;
    if (hb.everyMin === 0) status = beat?.last_error ? "warn" : "ok";
    else if (!lastOk) status = "fail";
    else {
      const late = (Date.now() - Date.parse(lastOk)) / 60_000;
      status = late <= hb.everyMin * 2 ? "ok" : late <= hb.everyMin * 6 ? "warn" : "fail";
    }
    if (beat?.last_error && status === "ok") status = "warn";
    checks.push({
      id: `hb-${hb.name}`,
      group: "Rotinas",
      label: hb.label,
      status,
      detail:
        `Última execução ${ago(beat?.last_run_at ?? null)}, último sucesso ${ago(lastOk)}.` +
        (beat?.last_error ? ` Erro: ${beat.last_error}` : ""),
      fix: status === "ok" ? undefined : hb.fix,
    });
  }

  return checks;
}

export type AlertRow = {
  id: string;
  source: string;
  level: "error" | "warn";
  message: string;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  meta: Record<string, unknown>;
  org_id: string | null;
  orgName: string | null;
};

export async function loadAlerts(filter: { status: "open" | "resolved"; level: "all" | "error" | "warn" }): Promise<AlertRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("ops_alerts")
    .select("id, source, level, message, occurrences, first_seen_at, last_seen_at, resolved_at, resolved_by, meta, org_id, organizations (name)")
    .order("last_seen_at", { ascending: false })
    .limit(200);
  query = filter.status === "open" ? query.is("resolved_at", null) : query.not("resolved_at", "is", null);
  if (filter.level !== "all") query = query.eq("level", filter.level);
  const { data } = await query;
  return ((data ?? []) as unknown as (Omit<AlertRow, "orgName"> & { organizations: { name: string } | null })[]).map(
    ({ organizations, ...row }) => ({ ...row, orgName: organizations?.name ?? null }),
  );
}

export async function loadOrgs(search: string) {
  const admin = createAdminClient();
  let query = admin
    .from("organizations")
    .select("id, name, status, trial_ends_at, price_cents, coupon_code, contact_phone, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (search) query = query.ilike("name", `%${search.replace(/[%_]/g, "")}%`);
  const { data: orgs } = await query;
  const list = (orgs ?? []) as OrgRow[];
  if (list.length === 0) return [];

  const ids = list.map((o) => o.id);
  const [{ data: members }, { data: lastReports }] = await Promise.all([
    admin.from("members").select("org_id, user_id, full_name, role, active").in("org_id", ids),
    admin.from("reports").select("org_id, report_date").in("org_id", ids).order("report_date", { ascending: false }).limit(2000),
  ]);

  const lastReport = new Map<string, string>();
  for (const r of lastReports ?? []) if (!lastReport.has(r.org_id)) lastReport.set(r.org_id, r.report_date);

  // E-mail do dono vem do Auth: uma consulta por organização listada.
  const owners = new Map<string, { name: string; email: string | null }>();
  await Promise.all(
    list.map(async (org) => {
      const owner = (members ?? []).find((m) => m.org_id === org.id && m.role === "owner");
      if (!owner) return;
      const { data } = await admin.auth.admin.getUserById(owner.user_id);
      owners.set(org.id, { name: owner.full_name, email: data.user?.email ?? null });
    }),
  );

  return list.map((org) => ({
    ...org,
    view: statusView(org),
    activeMembers: (members ?? []).filter((m) => m.org_id === org.id && m.active).length,
    owner: owners.get(org.id) ?? null,
    lastReport: lastReport.get(org.id) ?? null,
  }));
}

export async function loadCoupons() {
  const { data } = await createAdminClient()
    .from("coupons")
    .select("code, percent_off, free_days, description, active, max_redemptions, redemption_count, expires_at, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}
