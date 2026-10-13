import type { Metadata } from "next";
import { ThemeSwitcher } from "@/components/theme";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { getCurrentMember, orgCanWrite, ROLE_LABEL, type OrgStatus } from "@/lib/auth";
import { vapidPublicKey } from "@/lib/env";
import { formatMoney } from "@/lib/metrics";
import { isPlatformAdminEmail } from "@/lib/platform-admins";
import { MIN_SEATS, PRICE_PER_SEAT_CENTS } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";
import { CouponForm, InstallGuide, PushSettings, SubscriptionForm, WeeklyDigestToggle } from "./client";
import { OrgSettingsForm } from "./org-settings";
import { ChangePasswordForm, MfaSettings, SignOutEverywhere } from "./security";

export const metadata: Metadata = { title: "Conta" };

const STATUS_LABEL: Record<OrgStatus, { label: string; tone: "brand" | "warn" | "danger" | "neutral" }> = {
  trialing: { label: "Acesso gratuito", tone: "neutral" },
  active: { label: "Ativa", tone: "brand" },
  past_due: { label: "Fatura em aberto", tone: "warn" },
  canceled: { label: "Cancelada", tone: "danger" },
};

export default async function ContaPage() {
  const me = await getCurrentMember();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: digest } = await supabase.from("members").select("weekly_digest").eq("id", me.id).maybeSingle();
  const { data: org } = await supabase.from("organizations").select("seats, coupon_code").single();
  // A tabela de cupons é só do servidor: o percentual é lido com a chave de serviço.
  const { data: coupon } =
    me.role === "owner" && org?.coupon_code
      ? await createAdminClient().from("coupons").select("code, percent_off").eq("code", org.coupon_code).maybeSingle()
      : { data: null };
  const status = STATUS_LABEL[me.org.status];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="animate-rise">
        <p className="text-sm text-muted">
          {ROLE_LABEL[me.role]} em {me.org.name}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{me.fullName}</h1>
      </header>

      {me.role === "owner" ? (
        <Card id="imobiliaria">
          <CardHeader title="Imobiliária" description="Nome, fuso e horários de relatório da equipe" />
          <OrgSettingsForm name={me.org.name} timezone={me.org.timezone} slots={me.org.reportSlots} />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Notificações" description="Lembretes de relatório e alertas da equipe neste aparelho" />
        <PushSettings vapidKey={vapidPublicKey()} />
        {me.role !== "broker" ? <WeeklyDigestToggle initial={digest?.weekly_digest ?? true} /> : null}
      </Card>

      <Card id="seguranca">
        <CardHeader title="Verificação em duas etapas" description="Um código do celular além da senha" />
        <MfaSettings required={isPlatformAdminEmail(claims?.claims?.email)} />
      </Card>

      <Card>
        <CardHeader title="Trocar senha" />
        <ChangePasswordForm />
      </Card>

      <Card>
        <CardHeader title="Aparelhos conectados" />
        <SignOutEverywhere />
      </Card>

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

      {me.role === "owner" ? (
        <Card id="assinatura">
          <CardHeader
            title="Assinatura"
            description={
              me.org.status === "trialing"
                ? orgCanWrite(me.org)
                  ? `Acesso gratuito até ${formatDate(me.org.trialEndsAt.slice(0, 10))}`
                  : "Conta aguardando ativação"
                : `${org?.seats ?? 0} assentos contratados`
            }
            action={<Badge tone={status.tone}>{status.label}</Badge>}
          />
          <SubscriptionForm
            pricePerSeat={formatMoney(PRICE_PER_SEAT_CENTS)}
            pricePerSeatCents={PRICE_PER_SEAT_CENTS}
            defaultSeats={Math.max(MIN_SEATS, org?.seats ?? MIN_SEATS)}
            minSeats={MIN_SEATS}
            appliedCoupon={coupon?.percent_off != null ? { code: coupon.code, percentOff: Number(coupon.percent_off) } : null}
          />
          <div className="border-t border-line">
            <p className="px-5 pt-5 text-sm font-medium sm:px-6">Cupom</p>
            <CouponForm />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
