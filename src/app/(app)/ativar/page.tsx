import { Check } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getCurrentMember, orgCanWrite } from "@/lib/auth";
import { formatMoney } from "@/lib/metrics";
import { MIN_SEATS, PLAN_FEATURES, PRICE_PER_SEAT_CENTS } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { CouponForm, SubscriptionForm } from "../conta/client";

export const metadata: Metadata = { title: "Ativar conta" };

/** Primeiro passo depois do cadastro: o único lugar do produto que mostra preço. */
export default async function AtivarPage() {
  const me = await getCurrentMember();
  if (orgCanWrite(me.org)) redirect("/painel");

  if (me.role !== "owner") {
    return (
      <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Conta aguardando ativação</h1>
        <p className="mt-2 text-sm text-muted">
          A {me.org.name} ainda não ativou o Pulse. Assim que o administrador ativar, você já pode usar normalmente.
        </p>
      </Card>
    );
  }

  const { data: org } = await createAdminClient().from("organizations").select("seats, coupon_code").eq("id", me.org.id).single();
  const { data: coupon } = org?.coupon_code
    ? await createAdminClient().from("coupons").select("code, percent_off").eq("code", org.coupon_code).maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="animate-rise">
        <p className="text-sm text-muted">{me.org.name}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Ative sua conta</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Escolha quantas pessoas vão usar o Pulse e ative com Pix, boleto ou cartão. Assim que o pagamento confirmar, você já
          cria as equipes e convida os corretores.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <Card className="self-start p-6 sm:p-8">
          <p className="text-[12px] font-semibold tracking-[0.16em] text-muted uppercase">Por pessoa ativa, por mês</p>
          <p className="mt-2 font-display text-5xl font-bold tracking-tight tabular-nums">{formatMoney(PRICE_PER_SEAT_CENTS)}</p>
          <p className="mt-1 text-sm text-muted">A partir de {MIN_SEATS} pessoas. Desativou alguém, o assento fica livre para outro.</p>
          <ul className="mt-6 flex flex-col gap-2.5 border-t border-line pt-6">
            {PLAN_FEATURES.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-ink-2">
                <Check className="mt-0.5 size-4 shrink-0 text-brand-text" strokeWidth={2.5} />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Assinatura" description="Mensal, cancele quando quiser" />
            <SubscriptionForm
              pricePerSeat={formatMoney(PRICE_PER_SEAT_CENTS)}
              pricePerSeatCents={PRICE_PER_SEAT_CENTS}
              defaultSeats={Math.max(MIN_SEATS, org?.seats ?? MIN_SEATS)}
              minSeats={MIN_SEATS}
              appliedCoupon={coupon?.percent_off != null ? { code: coupon.code, percentOff: Number(coupon.percent_off) } : null}
            />
          </Card>
          <Card>
            <CardHeader title="Recebeu um cupom?" description="Cupons de acesso liberam a conta na hora, sem pagamento" />
            <CouponForm />
          </Card>
        </div>
      </div>
    </div>
  );
}
