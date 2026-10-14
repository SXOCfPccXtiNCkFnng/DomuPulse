import clsx from "clsx";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { InviteLink } from "@/components/invite-link";
import { Card, CardHeader } from "@/components/ui/card";
import { getCurrentMember, orgCanWrite } from "@/lib/auth";
import { formatMoney } from "@/lib/metrics";
import { inviteUrl, getInviteCode } from "@/lib/invite-link";
import { PLAN_FEATURES } from "@/lib/plans";
import { getMonthlyPriceCents } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { CouponForm, SubscriptionForm } from "@/app/(app)/conta/client";

export const metadata: Metadata = { title: "Ativar conta" };

const STEPS = ["Conta criada", "Ativar assinatura", "Convidar a equipe"];
const CURRENT_STEP = 1;

/** Boas-vindas depois do cadastro: o único lugar do produto que mostra preço. */
export default function AtivarPage() {
  return (
    <Suspense fallback={<AtivarSkeleton />}>
      <Ativar />
    </Suspense>
  );
}

function AtivarSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <span className="h-4 w-40 animate-pulse rounded bg-surface-2" />
      <span className="h-14 w-full max-w-xl animate-pulse rounded-xl bg-surface-2" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <span className="h-96 animate-pulse rounded-card bg-surface-2" />
        <span className="h-96 animate-pulse rounded-card bg-surface-2" />
      </div>
    </div>
  );
}

async function Ativar() {
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

  const [{ data: org }, priceCents, code] = await Promise.all([
    createAdminClient().from("organizations").select("coupon_code").eq("id", me.org.id).single(),
    getMonthlyPriceCents(),
    getInviteCode(me.org.id),
  ]);
  const { data: coupon } = org?.coupon_code
    ? await createAdminClient().from("coupons").select("code, percent_off").eq("code", org.coupon_code).maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="animate-rise">
        <p className="flex items-center gap-3 text-[12px] font-semibold tracking-[0.18em] text-brand-text uppercase">
          <span className="h-px w-8 bg-brand-text" />
          Boas-vindas, {me.fullName.split(" ")[0]}
        </p>
        <h1 className="mt-5 font-display text-[2.1rem] leading-[1.05] font-bold tracking-[-0.03em] sm:text-5xl">
          Falta pouco para a {me.org.name} <span className="text-brand-text">começar.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Escolha quantas pessoas vão usar o Pulse e ative com Pix, boleto ou cartão. Assim que o pagamento confirmar, você já
          cria as equipes e convida os corretores.
        </p>
        <ol className="mt-8 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step}
              className={clsx(
                "flex items-center gap-3 border-t-2 pt-3 text-sm",
                i < CURRENT_STEP && "border-brand-text text-ink-2",
                i === CURRENT_STEP && "border-brand-text font-semibold text-ink",
                i > CURRENT_STEP && "border-line text-muted",
              )}
            >
              <span
                className={clsx(
                  "grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums",
                  i < CURRENT_STEP ? "bg-brand text-brand-ink" : i === CURRENT_STEP ? "bg-brand-soft text-brand-text" : "bg-surface-2",
                )}
              >
                {i < CURRENT_STEP ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <Card className="self-start p-6 sm:p-8">
          <p className="text-[12px] font-semibold tracking-[0.16em] text-muted uppercase">Por mês</p>
          <p className="mt-2 font-display text-5xl font-bold tracking-tight tabular-nums">{formatMoney(priceCents)}</p>
          <p className="mt-1 text-sm text-muted">Valor fixo da sua conta, com quantos corretores você quiser.</p>
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
              priceCents={priceCents}
              appliedCoupon={coupon?.percent_off != null ? { code: coupon.code, percentOff: Number(coupon.percent_off) } : null}
            />
          </Card>
          <Card>
            <CardHeader title="Recebeu um cupom?" description="Cupons de acesso liberam a conta na hora, sem pagamento" />
            <CouponForm />
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Link da sua equipe"
          description="Mande para os corretores. Quem abrir cria a própria senha e já entra na sua conta."
        />
        <InviteLink url={inviteUrl(code)} orgName={me.org.name} canRegenerate />
        <p className="border-t border-line px-5 py-4 text-sm text-muted sm:px-6">
          Depois de ativar, crie as equipes em Equipe: no link, cada corretor escolhe a dele.
        </p>
      </Card>
    </div>
  );
}
