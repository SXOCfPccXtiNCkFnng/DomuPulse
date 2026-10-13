import type { Metadata } from "next";
import { ThemeSwitcher } from "@/components/theme";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { getCurrentMember, ROLE_LABEL, type OrgStatus } from "@/lib/auth";
import { vapidPublicKey } from "@/lib/env";
import { formatMoney } from "@/lib/metrics";
import { MIN_SEATS, PRICE_PER_SEAT_CENTS } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";
import { InstallGuide, PushSettings, SubscriptionForm } from "./client";

export const metadata: Metadata = { title: "Conta" };

const STATUS_LABEL: Record<OrgStatus, { label: string; tone: "brand" | "warn" | "danger" | "neutral" }> = {
  trialing: { label: "Teste grátis", tone: "neutral" },
  active: { label: "Ativa", tone: "brand" },
  past_due: { label: "Fatura em aberto", tone: "warn" },
  canceled: { label: "Cancelada", tone: "danger" },
};

export default async function ContaPage() {
  const me = await getCurrentMember();
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("seats").single();
  const status = STATUS_LABEL[me.org.status];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="animate-rise">
        <p className="text-sm text-muted">
          {ROLE_LABEL[me.role]} em {me.org.name}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{me.fullName}</h1>
      </header>

      <Card>
        <CardHeader title="Notificações" description="Lembretes de relatório e alertas da equipe neste aparelho" />
        <PushSettings vapidKey={vapidPublicKey()} />
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
                ? `Teste grátis até ${formatDate(me.org.trialEndsAt.slice(0, 10))}`
                : `${org?.seats ?? 0} assentos contratados`
            }
            action={<Badge tone={status.tone}>{status.label}</Badge>}
          />
          <SubscriptionForm
            pricePerSeat={formatMoney(PRICE_PER_SEAT_CENTS)}
            pricePerSeatCents={PRICE_PER_SEAT_CENTS}
            defaultSeats={Math.max(MIN_SEATS, org?.seats ?? MIN_SEATS)}
            minSeats={MIN_SEATS}
          />
        </Card>
      ) : null}
    </div>
  );
}
