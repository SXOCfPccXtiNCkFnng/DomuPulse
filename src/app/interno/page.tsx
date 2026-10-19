import clsx from "clsx";
import { AlertTriangle, Building2, CircleCheck, CircleX, LayoutDashboard, Stethoscope, Tag, TriangleAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { BrandMark } from "@/components/ui/logo";
import { StatTile } from "@/components/live/viz";
import {
  getSignupAlertEmails,
  loadAlerts,
  loadCoupons,
  loadHealth,
  loadOrgs,
  loadOverview,
  loadPayingClients,
  type HealthStatus,
  type OrgStatusView,
} from "@/lib/interno";
import { formatMoney, formatNumber } from "@/lib/metrics";
import { platformAdminSession } from "@/lib/platform-admin";
import { getMonthlyPriceCents } from "@/lib/pricing";
import { formatDate } from "@/lib/time";
import { extendTrial, grantAccess, resolveAlertsBySource, setAlertResolved, setCouponActive, suspendAccess } from "./actions";
import { ConfirmButton, CouponForm, PriceForm, SignupAlertEmailsCard } from "./client";

// Título neutro: a página não se anuncia para quem não tem acesso.
export const metadata: Metadata = { title: "Pulse", robots: { index: false, follow: false } };

const TABS = [
  { id: "visao", label: "Visão geral", Icon: LayoutDashboard },
  { id: "clientes", label: "Pessoas pagantes", Icon: Users },
  { id: "empresas", label: "Empresas", Icon: Building2 },
  { id: "comercial", label: "Comercial", Icon: Tag },
  { id: "saude", label: "Saúde do sistema", Icon: Stethoscope },
  { id: "erros", label: "Erros", Icon: AlertTriangle },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function InternoPage(props: PageProps<"/interno">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Gate searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Gate({ searchParams }: { searchParams: PageProps<"/interno">["searchParams"] }) {
  const { email, aal2 } = await platformAdminSession();
  if (!aal2) return <EnableMfa />;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const tab = (TABS.find((t) => t.id === one(sp.aba))?.id ?? "visao") as TabId;

  const [health, openAlerts] = await Promise.all([loadHealth(), loadAlerts({ status: "open", level: "error" })]);
  const healthFails = health.filter((c) => c.status === "fail").length;
  const badges: Partial<Record<TabId, number>> = { saude: healthFails, erros: openAlerts.length };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-2.5">
            <BrandMark className="size-7" />
            <span className="font-display font-semibold tracking-tight">Painel interno</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="hidden text-[13px] text-muted sm:inline">{email}</span>
            <ThemeToggle />
          </span>
        </div>
        <nav aria-label="Abas" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {TABS.map(({ id, label, Icon }) => (
            <Link
              key={id}
              href={`/interno?aba=${id}`}
              aria-current={tab === id ? "page" : undefined}
              className={clsx(
                "flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-[13px] font-medium transition-colors",
                tab === id ? "bg-brand text-brand-ink" : "text-ink-2 hover:bg-surface-2",
              )}
            >
              <Icon className="size-4" />
              {label}
              {badges[id] ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">
                  {badges[id]}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {tab === "visao" ? <Overview /> : null}
        {tab === "clientes" ? <ClientsTab search={one(sp.q).slice(0, 80)} status={one(sp.situacao)} /> : null}
        {tab === "empresas" ? <Orgs search={one(sp.q).slice(0, 80)} /> : null}
        {tab === "comercial" ? <Commercial /> : null}
        {tab === "saude" ? <Health checks={health} /> : null}
        {tab === "erros" ? <Errors status={one(sp.status) === "resolvidos" ? "resolved" : "open"} level={one(sp.nivel)} /> : null}
      </main>
    </div>
  );
}

async function Overview() {
  const o = await loadOverview();
  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Assinantes"
          value={o.byStatus.active + o.byStatus.past_due}
          detail={`${formatNumber(o.byStatus.active)} em dia, ${formatNumber(o.byStatus.past_due)} com fatura em aberto`}
          emphasis
        />
        <StatTile label="Receita mensal recorrente" value={Math.round(o.mrrCents / 100)} detail="em reais, assinaturas ativas e em atraso" emphasis />
        <StatTile label="Imobiliárias" value={o.totalOrgs} detail={`${o.newThisWeek} novas nos últimos 7 dias`} />
        <StatTile label="Pessoas ativas" value={o.activeMembers} detail={`${formatNumber(o.brokers)} corretores`} />
        <StatTile label="Relatórios hoje" value={o.reportsToday} detail={`${o.openErrors} erros em aberto`} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Imobiliárias por situação" />
          <ul className="flex flex-col gap-1 p-4 sm:p-5">
            {(Object.keys(STATUS) as OrgStatusView[]).map((s) => (
              <li key={s} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-2">
                <StatusBadge status={s} />
                <span className="font-display text-lg font-semibold tabular-nums">{o.byStatus[s]}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Acessos gratuitos acabando" description="Próximos 3 dias: bom momento para um contato comercial" />
          <ul className="flex flex-col gap-1 p-4 sm:p-5">
            {o.endingSoon.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">Nenhum acesso gratuito acabando.</li> : null}
            {o.endingSoon.map((org) => (
              <li key={org.id} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-2">
                <span className="truncate text-sm font-medium">{org.name}</span>
                <span className="text-sm text-muted tabular-nums">{formatDate(org.trialEndsAt.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

const HEALTH_ICON: Record<HealthStatus, ReactNode> = {
  ok: <CircleCheck className="size-5 text-brand-text" aria-label="ok" />,
  warn: <TriangleAlert className="size-5 text-warn" aria-label="atenção" />,
  fail: <CircleX className="size-5 text-danger" aria-label="falha" />,
};

function Health({ checks }: { checks: Awaited<ReturnType<typeof loadHealth>> }) {
  const groups = [...new Set(checks.map((c) => c.group))];
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <Card key={group}>
          <CardHeader title={group} />
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {checks
              .filter((c) => c.group === group)
              .map((c) => (
                <li key={c.id} className="flex gap-3 px-5 py-3.5 sm:px-6">
                  <span className="mt-0.5 shrink-0">{HEALTH_ICON[c.status]}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{c.label}</span>
                    <span className="block text-sm break-words text-muted">{c.detail}</span>
                    {c.fix ? <span className="mt-1 block text-sm text-ink-2">Como resolver: {c.fix}</span> : null}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

async function Errors({ status, level }: { status: "open" | "resolved"; level: string }) {
  const lvl = level === "erro" ? "error" : level === "aviso" ? "warn" : "all";
  const alerts = await loadAlerts({ status, level: lvl });
  const filter = (label: string, params: string, active: boolean) => (
    <Link href={`/interno?aba=erros${params}`} className={buttonClass(active ? "primary" : "secondary", "sm")}>
      {label}
    </Link>
  );
  const levelParam = lvl === "all" ? "" : `&nivel=${level}`;
  const statusParam = status === "resolved" ? "&status=resolvidos" : "";

  return (
    <Card>
      <CardHeader
        title={status === "open" ? "Erros em aberto" : "Erros resolvidos"}
        description="O mesmo erro repetido aparece uma vez, com o número de ocorrências"
      />
      <div className="flex flex-wrap gap-2 px-5 pt-4 sm:px-6">
        {filter("Em aberto", levelParam, status === "open")}
        {filter("Resolvidos", `&status=resolvidos${levelParam}`, status === "resolved")}
        <span className="mx-1 w-px bg-line" />
        {filter("Todos", statusParam, lvl === "all")}
        {filter("Só erros", `${statusParam}&nivel=erro`, lvl === "error")}
        {filter("Só avisos", `${statusParam}&nivel=aviso`, lvl === "warn")}
      </div>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {alerts.length === 0 ? <li className="px-6 py-12 text-center text-sm text-muted">Nada por aqui.</li> : null}
        {alerts.map((a) => (
          <li key={a.id} className="px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.level === "error" ? "danger" : "warn"}>{a.level === "error" ? "Erro" : "Aviso"}</Badge>
                  <code className="text-[13px] font-semibold">{a.source}</code>
                  <span className="text-xs text-muted tabular-nums">
                    {a.occurrences} {a.occurrences === 1 ? "vez" : "vezes"}
                  </span>
                  {a.orgName ? <Badge>{a.orgName}</Badge> : null}
                </div>
                <p className="mt-1.5 text-sm break-words text-ink-2">{a.message}</p>
                <p className="mt-1 text-xs text-muted">
                  Primeira vez {when(a.first_seen_at)}, última {when(a.last_seen_at)}
                  {a.resolved_at ? `, resolvido por ${a.resolved_by ?? "alguém"} ${when(a.resolved_at)}` : ""}
                </p>
                {Object.keys(a.meta).length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted hover:text-ink">Detalhes</summary>
                    <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(a.meta, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <form action={setAlertResolved.bind(null, a.id, !a.resolved_at)}>
                  <button type="submit" className={buttonClass("secondary", "sm")}>
                    {a.resolved_at ? "Reabrir" : "Resolvido"}
                  </button>
                </form>
                {!a.resolved_at ? (
                  <form action={resolveAlertsBySource.bind(null, a.source)}>
                    <button type="submit" className={buttonClass("ghost", "sm")}>
                      Resolver toda a origem
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const STATUS: Record<OrgStatusView, { label: string; tone: "neutral" | "brand" | "warn" | "danger" }> = {
  trial: { label: "Acesso gratuito", tone: "neutral" },
  trial_expired: { label: "Aguardando ativação", tone: "warn" },
  active: { label: "Ativa", tone: "brand" },
  past_due: { label: "Fatura em aberto", tone: "warn" },
  canceled: { label: "Cancelada", tone: "danger" },
};

function StatusBadge({ status }: { status: OrgStatusView }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}

async function ClientsTab({ search, status }: { search: string; status: string }) {
  const [clients, alertEmails] = await Promise.all([loadPayingClients(search), getSignupAlertEmails()]);
  const filtered = status ? clients.filter((c) => c.view === status) : clients;

  const filterBtn = (label: string, value: string) => {
    const active = (status || "") === value;
    const url = `/interno?aba=clientes${value ? `&situacao=${value}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`;
    return (
      <Link href={url} className={buttonClass(active ? "primary" : "secondary", "sm")}>
        {label}
      </Link>
    );
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0">
        <CardHeader
          title="Pessoas cadastradas (Clientes pagantes)"
          description={`${filtered.length} ${filtered.length === 1 ? "titular cadastrado" : "titulares cadastrados"} (exclui corretores e membros convidados)`}
        />
        <form className="flex gap-2 px-5 pt-4 sm:px-6" action="/interno">
          <input type="hidden" name="aba" value="clientes" />
          {status ? <input type="hidden" name="situacao" value={status} /> : null}
          <input
            name="q"
            defaultValue={search}
            placeholder="Buscar por nome, e-mail, telefone ou imobiliária"
            className="h-10 w-full max-w-md rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-ink"
          />
          <button type="submit" className={buttonClass("secondary", "md")}>
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap gap-2 px-5 pt-3 sm:px-6">
          {filterBtn("Todos", "")}
          {filterBtn("Ativos", "active")}
          {filterBtn("Acesso gratuito", "trial")}
          {filterBtn("Aguardando ativação", "trial_expired")}
          {filterBtn("Fatura em aberto", "past_due")}
          {filterBtn("Cancelados", "canceled")}
        </div>

        <ul className="mt-4 divide-y divide-line border-t border-line">
          {filtered.length === 0 ? (
            <li className="px-6 py-12 text-center text-sm text-muted">Nenhuma pessoa pagante encontrada.</li>
          ) : null}
          {filtered.map((client) => {
            const cleanPhone = client.phone ? client.phone.replace(/\D/g, "") : "";
            const waUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : null;
            return (
              <li key={client.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{client.fullName}</span>
                    <Badge tone="brand">Titular</Badge>
                    <StatusBadge status={client.view} />
                    {client.couponCode ? <Badge>Cupom {client.couponCode}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-2">
                    <span className="font-medium">{client.orgName}</span>
                    {client.email ? ` • ${client.email}` : " • sem e-mail"}
                    {client.phone ? ` • WhatsApp ${client.phone}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {client.teamSize} {client.teamSize === 1 ? "pessoa na equipe" : "pessoas na equipe"}
                    {client.priceCents ? ` • Assinatura: ${formatMoney(client.priceCents)}/mês` : ""} • Cadastrado em{" "}
                    {formatDate(client.createdAt.slice(0, 10))}
                    {client.view === "trial" || client.view === "trial_expired"
                      ? ` • Teste até ${formatDate(client.trialEndsAt.slice(0, 10))}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {waUrl ? (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClass("secondary", "sm")}
                    >
                      WhatsApp
                    </a>
                  ) : null}
                  {client.email ? (
                    <a href={`mailto:${client.email}`} className={buttonClass("ghost", "sm")}>
                      E-mail
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex flex-col gap-5 self-start">
        <Card>
          <CardHeader
            title="Alertas de novos cadastros"
            description="Receba avisos por e-mail sempre que um novo cliente se cadastrar"
          />
          <SignupAlertEmailsCard initialEmails={alertEmails} />
        </Card>
      </div>
    </div>
  );
}

async function Orgs({ search }: { search: string }) {
  const orgs = await loadOrgs(search);
  return (
    <Card>
      <CardHeader title="Empresas" description="As 100 mais recentes" />
      <form className="flex gap-2 px-5 pt-4 sm:px-6" action="/interno">
        <input type="hidden" name="aba" value="empresas" />
        <input
          name="q"
          defaultValue={search}
          placeholder="Buscar pelo nome"
          className="h-10 w-full max-w-sm rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-ink"
        />
        <button type="submit" className={buttonClass("secondary", "md")}>
          Buscar
        </button>
      </form>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {orgs.length === 0 ? <li className="px-6 py-12 text-center text-sm text-muted">Nenhuma empresa encontrada.</li> : null}
        {orgs.map((org) => (
          <li key={org.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{org.name}</span>
                <StatusBadge status={org.view} />
                {org.coupon_code ? <Badge>Cupom {org.coupon_code}</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted">
                {org.owner ? `${org.owner.name}, ${org.owner.email ?? "sem e-mail"}` : "Sem administrador"}
                {org.contact_phone ? `, WhatsApp ${org.contact_phone}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {org.activeMembers} {org.activeMembers === 1 ? "pessoa ativa" : "pessoas ativas"}
                {org.price_cents ? `, assinou por ${formatMoney(org.price_cents)}` : ""}, criada em{" "}
                {formatDate(org.created_at.slice(0, 10))}
                {org.view === "trial" || org.view === "trial_expired" ? `, acesso gratuito até ${formatDate(org.trial_ends_at.slice(0, 10))}` : ""}
                {org.lastReport ? `, último relatório em ${formatDate(org.lastReport)}` : ", nenhum relatório ainda"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {org.view === "trial" || org.view === "trial_expired" ? (
                <>
                  <form action={extendTrial.bind(null, org.id, 7)}>
                    <button type="submit" className={buttonClass("secondary", "sm")}>
                      Mais 7 dias
                    </button>
                  </form>
                  <form action={extendTrial.bind(null, org.id, 14)}>
                    <button type="submit" className={buttonClass("secondary", "sm")}>
                      Mais 14 dias
                    </button>
                  </form>
                </>
              ) : null}
              {org.view !== "active" ? (
                <form action={grantAccess.bind(null, org.id)}>
                  <ConfirmButton label="Liberar acesso" confirmLabel="Confirmar" />
                </form>
              ) : null}
              {org.view !== "canceled" ? (
                <form action={suspendAccess.bind(null, org.id)}>
                  <ConfirmButton label="Suspender" confirmLabel="Confirmar suspensão" danger />
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function Commercial() {
  const [coupons, priceCents] = await Promise.all([loadCoupons(), getMonthlyPriceCents()]);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0">
        <CardHeader title="Cupons" description={`Valor atual: ${formatMoney(priceCents)} por conta, por mês`} />
        <div className="mt-3 overflow-x-auto border-t border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium sm:px-6">Código</th>
                <th className="px-3 py-3 font-medium">Benefício</th>
                <th className="px-3 py-3 font-medium">Usos</th>
                <th className="px-3 py-3 font-medium">Validade</th>
                <th className="px-5 py-3 sm:px-6" />
              </tr>
            </thead>
            <tbody>
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-muted">
                    Nenhum cupom criado.
                  </td>
                </tr>
              ) : null}
              {coupons.map((c) => (
                <tr key={c.code} className={clsx("border-t border-line", !c.active && "text-muted")}>
                  <td className="px-5 py-3 sm:px-6">
                    <span className="font-semibold">{c.code}</span>
                    {c.description ? <span className="block text-xs text-muted">{c.description}</span> : null}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{c.free_days ? `${c.free_days} dias grátis` : `${Number(c.percent_off)}% de desconto`}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {c.redemption_count}
                    {c.max_redemptions ? ` de ${c.max_redemptions}` : ""}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{c.expires_at ? formatDate(c.expires_at.slice(0, 10)) : "Sem prazo"}</td>
                  <td className="px-5 py-3 text-right sm:px-6">
                    <form action={setCouponActive.bind(null, c.code, !c.active)}>
                      <button type="submit" className={buttonClass("ghost", "sm")}>
                        {c.active ? "Desativar" : "Reativar"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex flex-col gap-5 self-start">
        <Card>
          <CardHeader title="Valor da assinatura" description="Por conta, por mês. Vale para novas assinaturas; quem já assina continua no valor dela" />
          <PriceForm currentCents={priceCents} />
        </Card>
        <Card>
          <CardHeader title="Novo cupom" description="Dias grátis liberam a conta sem pagamento; desconto vale em todas as faturas" />
          <CouponForm />
        </Card>
      </div>
    </div>
  );
}

// O painel mexe em todas as imobiliárias: só abre com a verificação em duas
// etapas confirmada. Quem já ativou passa pela tela do código no login.
function EnableMfa() {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <Card className="max-w-md p-8 text-center">
        <BrandMark className="mx-auto size-10" />
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">Ative a verificação em duas etapas</h1>
        <p className="mt-2 text-sm text-muted">
          O painel interno mexe em todas as imobiliárias. Para abrir, sua conta precisa da verificação em duas etapas, com o código
          confirmado nesta sessão. Ative em Conta e entre de novo.
        </p>
        <Link href="/conta?aba=seguranca" className={buttonClass("primary", "md", "mt-6")}>
          Ativar na minha conta
        </Link>
      </Card>
    </main>
  );
}

function when(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
