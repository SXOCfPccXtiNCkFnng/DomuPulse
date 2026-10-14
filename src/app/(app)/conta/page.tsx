import clsx from "clsx";
import { Bell, Building2, CreditCard, Palette, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { requireActivatedMember, orgCanWrite, ROLE_LABEL, type OrgStatus } from "@/lib/auth";
import { vapidPublicKeyOrNull } from "@/lib/env";
import { formatMoney } from "@/lib/metrics";
import { getMonthlyPriceCents } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";
import { CouponForm, HashToTab, InstallGuide, PushSettings, SubscriptionForm, WeeklyDigestToggle } from "./client";
import { OrgSettingsForm } from "./org-settings";
import { ChangePasswordForm, MfaSettings, SignOutEverywhere } from "./security";

export const metadata: Metadata = { title: "Conta" };

const STATUS_LABEL: Record<OrgStatus, { label: string; tone: "brand" | "warn" | "danger" | "neutral" }> = {
  trialing: { label: "Acesso gratuito", tone: "neutral" },
  active: { label: "Ativa", tone: "brand" },
  past_due: { label: "Fatura em aberto", tone: "warn" },
  canceled: { label: "Cancelada", tone: "danger" },
};

// Abas da conta. As do administrador aparecem primeiro; o corretor vê só as dele.
const TABS = [
  { id: "imobiliaria", label: "Imobiliária", Icon: Building2, ownerOnly: true },
  { id: "assinatura", label: "Assinatura", Icon: CreditCard, ownerOnly: true },
  { id: "notificacoes", label: "Notificações", Icon: Bell, ownerOnly: false },
  { id: "seguranca", label: "Segurança", Icon: ShieldCheck, ownerOnly: false },
  { id: "aparelho", label: "Aparência e app", Icon: Palette, ownerOnly: false },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function ContaPage(props: PageProps<"/conta">) {
  const me = await requireActivatedMember();
  const sp = await props.searchParams;
  const tabs = TABS.filter((t) => !t.ownerOnly || me.role === "owner");
  const requested = typeof sp.aba === "string" ? sp.aba : "";
  const tab: TabId = tabs.find((t) => t.id === requested)?.id ?? tabs[0].id;

  return (
    <div className="flex flex-col gap-5">
      <HashToTab />
      <header className="animate-rise">
        <p className="text-sm text-muted">
          {ROLE_LABEL[me.role]} em {me.org.name}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{me.fullName}</h1>
      </header>

      {/* Fica preso no topo ao rolar: dá para trocar de aba de qualquer ponto da página. */}
      <nav
        aria-label="Seções da conta"
        className="sticky top-14 z-20 -mx-4 overflow-x-auto bg-bg/85 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10"
      >
        <ul className="flex w-max gap-1 rounded-xl bg-surface-2 p-1">
          {tabs.map(({ id, label, Icon }) => (
            <li key={id}>
              <Link
                href={`/conta?aba=${id}`}
                scroll={false}
                aria-current={tab === id ? "page" : undefined}
                className={clsx(
                  "flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                  tab === id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "imobiliaria" ? (
        <div className="max-w-3xl">
          <Card>
            <CardHeader title="Imobiliária" description="Nome, fuso e horários de relatório da equipe" />
            <OrgSettingsForm name={me.org.name} timezone={me.org.timezone} slots={me.org.reportSlots} />
          </Card>
        </div>
      ) : null}

      {tab === "assinatura" ? <Subscription orgStatus={me.org.status} trialEndsAt={me.org.trialEndsAt} canWrite={orgCanWrite(me.org)} /> : null}

      {tab === "notificacoes" ? <Notifications showDigest={me.role !== "broker"} memberId={me.id} /> : null}

      {tab === "seguranca" ? (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title="Trocar senha" />
            <ChangePasswordForm />
          </Card>
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title="Verificação em duas etapas" description="Um código do celular além da senha" />
              <MfaSettings />
            </Card>
            <Card>
              <CardHeader title="Aparelhos conectados" />
              <SignOutEverywhere />
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "aparelho" ? (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title="Aparência" description="Fica salvo neste aparelho" />
            <div className="p-5 sm:p-6">
              <ThemeSwitcher className="max-w-sm" />
            </div>
          </Card>
          <Card>
            <CardHeader title="Instalar o app" description="Abra o Pulse direto da tela inicial, como um aplicativo" />
            <InstallGuide />
          </Card>
        </div>
      ) : null}
    </div>
  );
}

async function Notifications({ showDigest, memberId }: { showDigest: boolean; memberId: string }) {
  const vapidKey = vapidPublicKeyOrNull();
  const supabase = await createClient();
  const [{ data: digest }, { data: claims }] = await Promise.all([
    showDigest ? supabase.from("members").select("weekly_digest, digest_email").eq("id", memberId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.auth.getClaims(),
  ]);
  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader title="Notificações" description="Lembretes de relatório e alertas da equipe neste aparelho" />
        {vapidKey ? (
          <PushSettings vapidKey={vapidKey} />
        ) : (
          <p className="p-5 text-sm text-muted sm:p-6">As notificações no celular ainda não foram configuradas neste ambiente.</p>
        )}
        {showDigest ? (
          <WeeklyDigestToggle
            initial={digest?.weekly_digest ?? true}
            digestEmail={digest?.digest_email ?? null}
            loginEmail={String(claims?.claims?.email ?? "")}
          />
        ) : null}
      </Card>
    </div>
  );
}

async function Subscription({ orgStatus, trialEndsAt, canWrite }: { orgStatus: OrgStatus; trialEndsAt: string; canWrite: boolean }) {
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("price_cents, coupon_code").single();
  // A tabela de cupons é só do servidor: o percentual é lido com a chave de serviço.
  const [{ data: coupon }, priceCents] = await Promise.all([
    org?.coupon_code
      ? createAdminClient().from("coupons").select("code, percent_off").eq("code", org.coupon_code).maybeSingle()
      : Promise.resolve({ data: null }),
    getMonthlyPriceCents(),
  ]);
  const status = STATUS_LABEL[orgStatus];

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Assinatura"
          description={
            orgStatus === "trialing"
              ? canWrite
                ? `Acesso gratuito até ${formatDate(trialEndsAt.slice(0, 10))}`
                : "Conta aguardando ativação"
              : org?.price_cents
                ? `${formatMoney(org.price_cents)} por mês, corretores sem limite`
                : "Corretores sem limite"
          }
          action={<Badge tone={status.tone}>{status.label}</Badge>}
        />
        <SubscriptionForm
          priceCents={priceCents}
          appliedCoupon={coupon?.percent_off != null ? { code: coupon.code, percentOff: Number(coupon.percent_off) } : null}
        />
      </Card>
      <Card>
        <CardHeader title="Cupom" description="Dias grátis liberam o acesso na hora; desconto vale em todas as faturas" />
        <CouponForm />
      </Card>
    </div>
  );
}
