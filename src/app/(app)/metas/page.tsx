import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import { getCurrentMember, isLeader } from "@/lib/auth";
import { GOAL_METRICS, projection, type GoalMetric } from "@/lib/goals";
import { formatMoney, formatNumber, METRICS } from "@/lib/metrics";
import { endOfMonth } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, startOfMonth, todayIn } from "@/lib/time";
import { deleteCommission } from "./actions";
import { BulkGoalsForm, CommissionForm, GoalRowForm } from "./forms";

export const metadata: Metadata = { title: "Metas" };

const LABEL = Object.fromEntries(METRICS.map((m) => [m.key, m.label])) as Record<GoalMetric, string>;

function monthLabel(month: string) {
  const text = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default async function MetasPage(props: PageProps<"/metas">) {
  const me = await getCurrentMember();
  const sp = await props.searchParams;
  const today = todayIn(me.org.timezone);
  const requested = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? `${sp.mes}-01` : startOfMonth(today);
  const month = requested > startOfMonth(today) ? startOfMonth(today) : requested;
  const monthEnd = endOfMonth(month);
  const to = monthEnd > today ? today : monthEnd;
  const leader = isLeader(me.role);

  const supabase = await createClient();
  const [{ data: brokers }, { data: goals }, { data: totals }, { data: commissions }] = await Promise.all([
    supabase.from("members").select("id, full_name, team_id").eq("role", "broker").eq("active", true).order("full_name"),
    supabase.from("goals").select("member_id, metric, target").eq("month", month),
    supabase.rpc("report_totals_by_member", { p_from: month, p_to: to }),
    supabase
      .from("commissions")
      .select("id, member_id, received_on, amount_cents, description")
      .gte("received_on", month)
      .lte("received_on", monthEnd)
      .order("received_on", { ascending: false }),
  ]);

  const goalOf = (memberId: string, metric: GoalMetric) =>
    (goals ?? []).find((g) => g.member_id === memberId && g.metric === metric)?.target as number | undefined;
  const actualOf = (memberId: string, metric: GoalMetric) =>
    Number(((totals ?? []) as Record<string, unknown>[]).find((t) => t.member_id === memberId)?.[metric] ?? 0);
  const nameOf = new Map((brokers ?? []).map((b) => [b.id, b.full_name]));
  const people = leader ? (brokers ?? []) : (brokers ?? []).filter((b) => b.id === me.id);
  const commissionTotal = (commissions ?? []).reduce((s, c) => s + Number(c.amount_cents), 0);
  const prev = addDays(month, -1).slice(0, 7);
  const next = addDays(monthEnd, 1).slice(0, 7);
  const isCurrent = month === startOfMonth(today);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted">{isCurrent ? `Atualizado até ${formatDate(today)}` : "Mês encerrado"}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Metas</h1>
        </div>
        <nav aria-label="Mês" className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
          <Link href={`/metas?mes=${prev}`} aria-label="Mês anterior" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink">
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-36 text-center text-sm font-medium">{monthLabel(month)}</span>
          {isCurrent ? (
            <span className="size-8" />
          ) : (
            <Link href={`/metas?mes=${next}`} aria-label="Próximo mês" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink">
              <ChevronRight className="size-4" />
            </Link>
          )}
        </nav>
      </header>

      {leader && people.length > 1 ? (
        <Card>
          <CardHeader title="Mesma meta para todos" description={`Aplica a ${people.length} corretores ativos. Zero apaga a meta.`} />
          <BulkGoalsForm month={month} memberIds={people.map((p) => p.id)} />
        </Card>
      ) : null}

      <Card className="min-w-0">
        <CardHeader
          title={leader ? "Metas por corretor" : "Suas metas"}
          description={isCurrent ? "Projeção pelo ritmo atual até o fim do mês" : undefined}
        />
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {people.length === 0 ? <li className="px-6 py-12 text-center text-sm text-muted">Nenhum corretor ativo.</li> : null}
          {people.map((p) => (
            <li key={p.id} className="flex flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center">
              <span className="flex w-56 shrink-0 items-center gap-2.5">
                <Avatar name={p.full_name} />
                <span className="truncate font-medium">{p.full_name}</span>
              </span>
              <div className="grid flex-1 gap-3 sm:grid-cols-3">
                {GOAL_METRICS.map((metric) => (
                  <Progress
                    key={metric}
                    label={LABEL[metric]}
                    actual={actualOf(p.id, metric)}
                    goal={goalOf(p.id, metric)}
                    projected={projection(actualOf(p.id, metric), month, today)}
                    showProjection={isCurrent}
                  />
                ))}
              </div>
              {leader ? (
                <GoalRowForm
                  month={month}
                  memberId={p.id}
                  values={Object.fromEntries(GOAL_METRICS.map((m) => [m, goalOf(p.id, m) ?? 0])) as Record<GoalMetric, number>}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0">
          <CardHeader title="Comissões recebidas" description={`${formatMoney(commissionTotal)} em ${monthLabel(month).toLowerCase()}`} />
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {(commissions ?? []).length === 0 ? <li className="px-6 py-10 text-center text-sm text-muted">Nenhuma comissão lançada neste mês.</li> : null}
            {(commissions ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <span className="w-20 shrink-0 text-sm text-muted tabular-nums">{formatDate(c.received_on)}</span>
                <span className="min-w-0 flex-1">
                  {leader ? <span className="block truncate text-sm font-medium">{nameOf.get(c.member_id) ?? "Corretor"}</span> : null}
                  <span className={clsx("block truncate text-sm", leader ? "text-muted" : "font-medium")}>{c.description || "Sem descrição"}</span>
                </span>
                <span className="font-semibold tabular-nums">{formatMoney(Number(c.amount_cents))}</span>
                <form action={deleteCommission.bind(null, c.id)}>
                  <button type="submit" className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-danger-soft hover:text-danger">
                    Remover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="self-start">
          <CardHeader title="Lançar comissão" />
          <CommissionForm
            brokers={leader ? people.map((p) => ({ id: p.id, name: p.full_name })) : null}
            defaultDate={isCurrent ? today : monthEnd}
            min={month}
            max={monthEnd > today ? today : monthEnd}
          />
        </Card>
      </div>
    </div>
  );
}

function Progress({
  label,
  actual,
  goal,
  projected,
  showProjection,
}: {
  label: string;
  actual: number;
  goal?: number;
  projected: number;
  showProjection: boolean;
}) {
  const pct = goal ? Math.min(100, (actual / goal) * 100) : 0;
  const onTrack = goal ? projected >= goal : false;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{formatNumber(actual)}</span>
          {goal ? <span className="text-muted"> de {formatNumber(goal)}</span> : <span className="text-muted"> sem meta</span>}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-label={`${label}: ${actual}${goal ? ` de ${goal}` : ""}`}
        aria-valuemin={0}
        aria-valuemax={goal || 1}
        aria-valuenow={actual}
      >
        <div className={clsx("h-full rounded-full", pct >= 100 ? "bg-brand" : "bg-brand-text")} style={{ width: `${pct}%` }} />
      </div>
      {goal && showProjection ? (
        <p className={clsx("mt-1 text-xs", onTrack ? "text-brand-text" : "text-warn")}>
          Projeção {formatNumber(projected)}, {onTrack ? "no ritmo" : "abaixo do ritmo"}
        </p>
      ) : null}
    </div>
  );
}
