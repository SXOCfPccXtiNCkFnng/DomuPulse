import clsx from "clsx";
import { Bell, Building2, CreditCard, Download, Lock, Palette, ShieldCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { requireActivatedMember, orgCanWrite, ROLE_LABEL, type OrgStatus } from "@/lib/auth";
import { vapidPublicKeyOrNull } from "@/lib/env";
import { formatMoney } from "@/lib/metrics";
import { getMonthlyPriceCents } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";
import { CouponForm, DigestSettings, HashToTab, InstallGuide, PushSettings, SubscriptionForm } from "./client";
import { OrgSettingsForm } from "./org-settings";
import { CancelSubscriptionButton, DeleteAccountForm } from "./privacy";
import { ProfileForm } from "./profile";
import { OrgFiscalForm } from "../notas/fiscal";
import { ORG_FISCAL_COLUMNS, type OrgFiscal as OrgFiscalRow } from "@/lib/nfse";
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
  { id: "perfil", label: "Perfil", Icon: UserRound, ownerOnly: false },
  { id: "imobiliaria", label: "Imobiliária", Icon: Building2, ownerOnly: true },
  { id: "assinatura", label: "Assinatura", Icon: CreditCard, ownerOnly: true },
  { id: "notificacoes", label: "Notificações", Icon: Bell, ownerOnly: false },
  { id: "seguranca", label: "Segurança", Icon: ShieldCheck, ownerOnly: false },
  { id: "aparelho", label: "Aparência e app", Icon: Palette, ownerOnly: false },
  { id: "privacidade", label: "Privacidade e dados", Icon: Lock, ownerOnly: false },
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

      {tab === "perfil" ? <Profile name={me.fullName} /> : null}

      {tab === "imobiliaria" ? (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title="Imobiliária" description="Nome, fuso e horários de relatório da equipe" />
            <OrgSettingsForm name={me.org.name} timezone={me.org.timezone} slots={me.org.reportSlots} />
          </Card>
          <OrgFiscal orgId={me.org.id} />
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

      {tab === "privacidade" ? (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title="Baixar meus dados" description="Uma cópia de tudo o que o Pulse guarda sobre você" />
            <div className="flex flex-col gap-4 p-5 sm:p-6">
              <p className="text-sm text-ink-2">
                O arquivo traz seu cadastro, relatórios, presença, clientes, agenda, metas, comissões, avisos e aparelhos com
                notificação. Ele sai no formato JSON, que abre em qualquer editor de texto e pode ser importado em outros sistemas.
              </p>
              <a href="/conta/meus-dados" download className={buttonClass("secondary", "md", "self-start")}>
                <Download className="size-4" />
                Baixar meus dados
              </a>
              <p className="text-xs text-muted">
                Para os relatórios da equipe em planilha, use Exportar planilha em Relatórios. Termos e privacidade:{" "}
                <Link href="/termos" className="underline underline-offset-4">Termos de Uso</Link> e{" "}
                <Link href="/privacidade" className="underline underline-offset-4">Política de Privacidade</Link>.
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Excluir minha conta" description={me.role === "owner" ? "Apaga a imobiliária inteira" : "Remove seus dados pessoais do Pulse"} />
            <DeleteAccountForm isOwner={me.role === "owner"} orgName={me.org.name} />
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
    showDigest ? supabase.from("members").select("weekly_digest, weekly_digest_weekday, daily_digest, daily_digest_hour, monthly_digest, digest_email").eq("id", memberId).maybeSingle() : Promise.resolve({ data: null }),
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
          <DigestSettings
            initial={{
              daily: digest?.daily_digest ?? true,
              dailyHour: digest?.daily_digest_hour ?? null,
              weekly: digest?.weekly_digest ?? true,
              weeklyWeekday: digest?.weekly_digest_weekday ?? 1,
              monthly: digest?.monthly_digest ?? true,
            }}
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
  const { data: org } = await supabase.from("organizations").select("price_cents, coupon_code, asaas_subscription_id, cancel_at").single();
  const subscribed = Boolean(org?.asaas_subscription_id);
  const cancelAt = (org?.cancel_at as string | null) ?? null;
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
            cancelAt && orgStatus !== "canceled"
              ? `Cancelada: a equipe usa normalmente até ${formatDate(cancelAt.slice(0, 10))}`
              : orgStatus === "trialing"
              ? canWrite
                ? `Acesso gratuito até ${formatDate(trialEndsAt.slice(0, 10))}`
                : "Conta aguardando ativação"
              : org?.price_cents
                ? `${formatMoney(org.price_cents)} por mês, corretores sem limite`
                : "Corretores sem limite"
          }
          action={<Badge tone={status.tone}>{status.label}</Badge>}
        />
        {subscribed ? (
          <div className="flex flex-col gap-3 border-t border-line p-5 sm:p-6">
            <p className="text-sm text-ink-2">
              A cobrança é mensal e automática. Se cancelar, nenhuma cobrança nova é feita e a equipe continua usando até o fim do
              período já pago. Depois disso, os dados ficam disponíveis só para consulta.
            </p>
            <CancelSubscriptionButton />
          </div>
        ) : (
          <SubscriptionForm
            priceCents={priceCents}
            appliedCoupon={coupon?.percent_off != null ? { code: coupon.code, percentOff: Number(coupon.percent_off) } : null}
          />
        )}
      </Card>
      <Card>
        <CardHeader title="Cupom" description="Dias grátis liberam o acesso na hora; desconto vale em todas as faturas" />
        <CouponForm />
      </Card>
    </div>
  );
}

async function Profile({ name }: { name: string }) {
  const { data: claims } = await (await createClient()).auth.getClaims();
  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader title="Seu perfil" description="Seu nome no Pulse" />
        <ProfileForm name={name} email={String(claims?.claims?.email ?? "")} />
      </Card>
    </div>
  );
}

/** Dados da imobiliária como tomadora das notas fiscais dos corretores. */
async function OrgFiscal({ orgId }: { orgId: string }) {
  const { data } = await createAdminClient().from("organizations").select(ORG_FISCAL_COLUMNS).eq("id", orgId).single<OrgFiscalRow>();
  return (
    <Card>
      <CardHeader title="Dados fiscais" description="Para os corretores emitirem as notas contra a imobiliária pelo Pulse" />
      <OrgFiscalForm
        initial={{
          legalName: data?.fiscal_legal_name ?? "",
          cnpj: data?.fiscal_cnpj ?? "",
          email: data?.fiscal_email ?? "",
          cep: data?.fiscal_cep ?? "",
          street: data?.fiscal_street ?? "",
          number: data?.fiscal_number ?? "",
          district: data?.fiscal_district ?? "",
          city: data?.fiscal_city ?? "",
          uf: data?.fiscal_uf ?? "",
          serviceCode: data?.nfse_service_code ?? "100501",
        }}
      />
    </Card>
  );
}
