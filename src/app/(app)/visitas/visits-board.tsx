"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, Download, MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { setVisitStage } from "@/app/(app)/agenda/actions";
import type { ClientMember } from "@/components/live/types";
import { roleLabel } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { VisitStageSelect } from "@/components/visit-stage-select";
import { whatsappLink } from "@/lib/clients";
import { useOrgClock } from "@/lib/live/use-live-day";
import { getBrowserClient } from "@/lib/supabase/client";
import { addDays, dateIn, formatTimeIn, zonedToIso } from "@/lib/time";
import { type AppointmentStatus, startOfVisitWeek, VISIT_STAGE_KEYS, VISIT_STAGES, VISIT_WEEKDAYS, type VisitStage, visitStageOf } from "@/lib/visits";

// Cores (ARGB) usadas no Excel, nos mesmos tons das situações da tela.
const EXPORT_FILL: Record<VisitStage, string> = {
  message_sent: "FFE2EFDA",
  confirmed: "FFFFF2CC",
  rescheduled: "FFDCE9F5",
  no_show: "FFFDE0DF",
  wont_come: "FFF4CCCC",
  visited: "FFD9F2E3",
};
const EXPORT_HEADER = "FFEFEFEF";
const EXPORT_TODAY = "FFE8F0FE";
const EXPORT_BORDER = "FFDDDDDD";

type Visit = {
  id: string;
  member_id: string;
  client_name: string;
  client_phone: string | null;
  scheduled_at: string;
  status: AppointmentStatus;
  region: string | null;
  visit_stage?: string | null;
};
type Broker = { id: string; name: string; active: boolean; is_broker: boolean; visit_goal?: number };

const DEFAULT_VISIT_GOAL = 15;
type Board = { start: string; visits: Visit[]; brokers: Broker[]; error: string | null };

const REFRESH_MS = 60_000;

/** "12/11" a partir de "2026-11-12". */
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

const brokerChip = "inline-block max-w-44 truncate rounded-md bg-surface-2 px-2 py-0.5 text-left font-semibold uppercase text-ink-2";

export function VisitsBoard({ member }: { member: ClientMember }) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const tz = member.org.timezone;
  const { today } = useOrgClock(tz);
  const currentWeek = startOfVisitWeek(today);
  const [week, setWeek] = useState<string | null>(null);
  const start = week ?? currentWeek;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const [board, setBoard] = useState<Board | null>(null);
  const [brokerFilter, setBrokerFilter] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const leader = member.role !== "broker";

  const load = useCallback(async () => {
    const [v, b] = await Promise.all([
      supabase.rpc("visits_board", { p_from: zonedToIso(start, "00:00", tz), p_to: zonedToIso(addDays(start, 7), "00:00", tz) }),
      supabase.rpc("visits_board_brokers"),
    ]);
    const error = v.error ?? b.error;
    setBoard({
      start,
      visits: (v.data ?? []) as Visit[],
      brokers: (b.data ?? []) as Broker[],
      error: error
        ? error.code === "PGRST202" || error.code === "42883"
          ? "A tela de visitas ainda não foi ativada no banco. Rode a atualização 20261116000000_visits_board.sql no Supabase."
          : "Não foi possível carregar as visitas. Tente de novo."
        : null,
    });
  }, [supabase, start, tz]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const ready = board?.start === start ? board : null;
  const visits = useMemo(() => ready?.visits ?? [], [ready]);

  // Linhas: corretores ativos + quem tem visita na semana (inativo ou da liderança).
  const rows = useMemo(() => {
    const members = ready?.brokers ?? [];
    const withVisits = new Set(visits.map((v) => v.member_id));
    const list = members.filter((b) => (b.is_broker && b.active) || withVisits.has(b.id));
    for (const id of withVisits) if (!list.some((b) => b.id === id)) list.push({ id, name: "Outro membro", active: false, is_broker: false });
    return list;
  }, [ready, visits]);
  const nameOf = useMemo(() => new Map(rows.map((b) => [b.id, b.name])), [rows]);

  // Contagem de agendamentos, como na planilha: toda visita marcada conta, qualquer que seja a situação.
  const grid = useMemo(() => {
    const count = new Map<string, number>();
    for (const v of visits) {
      const key = `${v.member_id}|${dateIn(v.scheduled_at, tz)}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    return count;
  }, [visits, tz]);
  const cell = (memberId: string, day: string) => grid.get(`${memberId}|${day}`) ?? 0;
  const rowTotal = (memberId: string) => days.reduce((s, d) => s + cell(memberId, d), 0);
  const dayTotal = (day: string) => rows.reduce((s, b) => s + cell(b.id, day), 0);
  const weekTotal = days.reduce((s, d) => s + dayTotal(d), 0);
  const goalOf = (b: Broker) => b.visit_goal ?? DEFAULT_VISIT_GOAL;
  const goalTotal = rows.reduce((s, b) => s + goalOf(b), 0);

  const [goalError, setGoalError] = useState<string | null>(null);
  async function changeGoal(memberId: string, goal: number) {
    setGoalError(null);
    setBoard((b) => (b ? { ...b, brokers: b.brokers.map((x) => (x.id === memberId ? { ...x, visit_goal: goal } : x)) } : b));
    const { error } = await supabase.rpc("set_visit_goal", { p_member: memberId, p_goal: goal });
    if (error) {
      setGoalError(
        error.code === "PGRST202" || error.code === "42883"
          ? "Falta rodar a atualização do banco (20261118000000_week_start_visit_goal.sql) para salvar a meta."
          : error.code === "42501"
            ? error.message
            : "Não foi possível salvar a meta. Tente de novo.",
      );
    }
    void load();
  }

  const [stageError, setStageError] = useState<string | null>(null);
  async function changeStage(v: Visit, stage: VisitStage | null) {
    setStageError(null);
    const status = stage ? VISIT_STAGES[stage].status : "scheduled";
    setBoard((b) => (b ? { ...b, visits: b.visits.map((x) => (x.id === v.id ? { ...x, visit_stage: stage, status } : x)) } : b));
    const r = await setVisitStage(v.id, stage);
    if ("error" in r) setStageError(r.error);
    void load();
  }

  const stageCounts = new Map<VisitStage, number>();
  for (const v of visits) {
    const s = visitStageOf(v.visit_stage, v.status);
    if (s) stageCounts.set(s, (stageCounts.get(s) ?? 0) + 1);
  }

  const list = visits.filter(
    (v) => (!brokerFilter || v.member_id === brokerFilter) && (!dayFilter || dateIn(v.scheduled_at, tz) === dayFilter),
  );

  const isCurrent = start === currentWeek;
  const go = (n: number) => {
    const next = addDays(start, n * 7);
    setWeek(next === currentWeek ? null : next);
    setDayFilter(null);
  };

  // Exporta a semana inteira para Excel, com a grade em cima e os clientes
  // embaixo, nas mesmas cores das situações. A lib carrega só ao clicar.
  const [exporting, setExporting] = useState(false);
  async function exportXlsx() {
    if (!ready || exporting) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Visitas");
      const line = { style: "thin" as const, color: { argb: EXPORT_BORDER } };
      const bordered = { top: line, left: line, bottom: line, right: line };
      const fillOf = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

      const titleRow = ws.addRow([`Visitas · ${member.org.name}`]);
      titleRow.font = { bold: true, size: 14 };
      const subRow = ws.addRow([`Semana de ${dayMonth(days[0])} a ${dayMonth(days[6])}${isCurrent ? " (semana atual)" : ""}`]);
      subRow.font = { color: { argb: "FF888888" } };
      ws.addRow([]);

      // Grade: corretores x dias, com totais e meta.
      const head1 = ws.addRow(["Corretor", ...days.map((d, i) => `${VISIT_WEEKDAYS[i]} ${dayMonth(d)}`), "Total", "Meta"]);
      head1.eachCell((c, col) => {
        c.font = { bold: true };
        c.fill = fillOf(EXPORT_HEADER);
        c.border = bordered;
        c.alignment = { horizontal: col === 1 ? "left" : "center" };
      });
      const todayIdx = days.indexOf(today);
      rows.forEach((b) => {
        const r = ws.addRow([b.name, ...days.map((d) => cell(b.id, d)), rowTotal(b.id), goalOf(b)]);
        r.eachCell((c, col) => {
          c.border = bordered;
          if (col > 1) c.alignment = { horizontal: "center" };
        });
        if (todayIdx >= 0) r.getCell(todayIdx + 2).fill = fillOf(EXPORT_TODAY);
      });
      const foot1 = ws.addRow(["Total do dia", ...days.map((d) => dayTotal(d)), weekTotal, goalTotal]);
      foot1.eachCell((c, col) => {
        c.font = { bold: true };
        c.fill = fillOf(EXPORT_HEADER);
        c.border = bordered;
        if (col > 1) c.alignment = { horizontal: "center" };
      });

      ws.addRow([]);
      const title2 = ws.addRow(["Clientes da semana"]);
      title2.font = { bold: true, size: 12 };

      // Clientes, cada linha na cor da situação.
      const head2 = ws.addRow(["Nome do cliente", "Telefone", "Dia", "Horário", "Região", "Corretor", "Situação"]);
      head2.eachCell((c) => {
        c.font = { bold: true };
        c.fill = fillOf(EXPORT_HEADER);
        c.border = bordered;
      });
      const sorted = [...visits].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
      sorted.forEach((v) => {
        const day = dateIn(v.scheduled_at, tz);
        const weekday = VISIT_WEEKDAYS[days.indexOf(day)] ?? dayMonth(day);
        const stage = visitStageOf(v.visit_stage, v.status);
        const r = ws.addRow([
          v.client_name,
          v.client_phone ?? "",
          `${weekday} ${dayMonth(day)}`,
          formatTimeIn(v.scheduled_at, tz),
          v.region ?? "",
          nameOf.get(v.member_id) ?? "",
          stage ? VISIT_STAGES[stage].label : "",
        ]);
        r.eachCell((c) => {
          c.border = bordered;
          if (stage) c.fill = fillOf(EXPORT_FILL[stage]);
        });
      });

      const widths = [26, 15, 12, 12, 15, 16, 12, 10, 10, 10];
      widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `visitas-${days[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted">Toda a equipe · semana de quinta a quarta</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Visitas</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void exportXlsx()} disabled={!ready || exporting}>
            <Download className="size-4" />
            {exporting ? "Gerando..." : "Exportar Excel"}
          </Button>
          <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => go(-1)} aria-label="Semana anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium tabular-nums">
            {dayMonth(days[0])} a {dayMonth(days[6])}
            {isCurrent ? <span className="block text-xs font-normal text-muted">Semana atual</span> : null}
          </span>
          <Button size="sm" variant="ghost" onClick={() => go(1)} aria-label="Próxima semana">
            <ChevronRight className="size-4" />
          </Button>
          {!isCurrent ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setWeek(null);
                setDayFilter(null);
              }}
            >
              Semana atual
            </Button>
          ) : null}
          </div>
        </div>
      </header>

      {ready?.error ? <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{ready.error}</p> : null}
      {goalError ? <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{goalError}</p> : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2 text-xs font-semibold tracking-wide text-muted uppercase">
                <th className="px-3 py-2.5 text-left">Corretor</th>
                {days.map((d, i) => (
                  <th key={d} className={clsx("px-2 py-2.5 text-center", d === today && "bg-brand-soft text-brand-text")}>
                    <button
                      type="button"
                      onClick={() => setDayFilter((f) => (f === d ? null : d))}
                      className={clsx("flex w-full flex-col items-center rounded-md hover:text-ink", dayFilter === d && "text-ink underline underline-offset-4")}
                      title="Mostrar só as visitas deste dia"
                    >
                      {VISIT_WEEKDAYS[i]}
                      <span className="font-normal normal-case tabular-nums">{dayMonth(d)}</span>
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center">Total</th>
                <th className="px-3 py-2.5 text-center" title={leader ? "Meta de visitas da semana. Clique para alterar." : "Meta de visitas da semana"}>
                  Meta
                </th>
              </tr>
            </thead>
            <tbody>
              {!ready ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted">
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted">
                    Nenhum corretor na equipe ainda.
                  </td>
                </tr>
              ) : (
                rows.map((b) => (
                  <tr key={b.id} className={clsx("border-t border-line", brokerFilter === b.id && "bg-surface-2")}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setBrokerFilter((f) => (f === b.id ? null : b.id))}
                        className={clsx(brokerChip, "text-[13px] hover:text-ink", brokerFilter === b.id && "bg-brand-soft text-brand-text")}
                        title="Mostrar só as visitas deste corretor"
                      >
                        {b.name}
                      </button>
                    </td>
                    {days.map((d) => {
                      const n = cell(b.id, d);
                      return (
                        <td key={d} className={clsx("px-2 py-2 text-center tabular-nums", d === today && "bg-brand-soft/50")}>
                          <span className={clsx("font-display text-base font-semibold", n === 0 && "text-muted/60")}>{n}</span>
                        </td>
                      );
                    })}
                    <td
                      className={clsx(
                        "px-3 py-2 text-center font-display text-base font-semibold tabular-nums",
                        goalOf(b) > 0 && rowTotal(b.id) >= goalOf(b) && "text-success",
                      )}
                    >
                      {rowTotal(b.id)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {leader ? (
                        <GoalInput key={goalOf(b)} value={goalOf(b)} name={b.name} onSave={(g) => void changeGoal(b.id, g)} />
                      ) : (
                        <span className="font-display text-base font-semibold tabular-nums text-ink-2">{goalOf(b)}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {ready && rows.length ? (
              <tfoot>
                <tr className="border-t-2 border-line-strong bg-surface-2">
                  <td className="px-3 py-2.5 text-xs font-semibold tracking-wide text-muted uppercase">Total do dia</td>
                  {days.map((d) => (
                    <td key={d} className="px-2 py-2.5 text-center tabular-nums">
                      <span className="font-display text-base font-semibold">{dayTotal(d)}</span>
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center">
                    <span className="font-display text-lg font-semibold tabular-nums">{weekTotal}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="font-display text-lg font-semibold tabular-nums text-ink-2">{goalTotal}</span>
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Clientes da semana"
          description={
            brokerFilter || dayFilter
              ? `${list.length} de ${visits.length} visitas`
              : "Entram sozinhas ao marcar visita na Agenda, em Clientes ou no relatório. Mude a situação e a linha ganha a cor. Todo agendamento conta no total."
          }
          action={
            brokerFilter || dayFilter ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setBrokerFilter(null);
                  setDayFilter(null);
                }}
              >
                <X className="size-3.5" />
                Limpar filtro
              </Button>
            ) : undefined
          }
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 pt-4 text-xs text-ink-2 sm:px-6">
          {VISIT_STAGE_KEYS.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={clsx("size-3 rounded-sm", VISIT_STAGES[k].chip)} />
              {VISIT_STAGES[k].label}
              <span className="font-semibold tabular-nums text-muted">{stageCounts.get(k) ?? 0}</span>
            </span>
          ))}
        </div>
        {stageError ? <p className="mx-5 mt-3 rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger sm:mx-6">{stageError}</p> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-line bg-surface-2 text-xs font-semibold tracking-wide text-muted uppercase">
                <th className="px-4 py-2.5 text-left">Nome do cliente</th>
                <th className="px-3 py-2.5 text-left">Telefone</th>
                <th className="px-3 py-2.5 text-left">Dia</th>
                <th className="px-3 py-2.5 text-left">Horário</th>
                <th className="px-3 py-2.5 text-left">Região</th>
                <th className="px-3 py-2.5 text-left">Corretor</th>
                <th className="px-3 py-2.5 text-left">Situação</th>
                {leader ? <th className="px-4 py-2.5 text-right">Contato</th> : null}
              </tr>
            </thead>
            <tbody>
              {ready && list.length === 0 ? (
                <tr>
                  <td colSpan={leader ? 8 : 7} className="px-4 py-8 text-center text-muted">
                    Nenhuma visita {brokerFilter || dayFilter ? "com esse filtro" : "marcada nesta semana"}.
                  </td>
                </tr>
              ) : null}
              {list.map((v) => {
                const day = dateIn(v.scheduled_at, tz);
                const time = formatTimeIn(v.scheduled_at, tz);
                const weekday = VISIT_WEEKDAYS[days.indexOf(day)] ?? dayMonth(day);
                const stage = visitStageOf(v.visit_stage, v.status);
                const canceled = v.status === "canceled";
                const canEdit = leader || v.member_id === member.id;
                const prep = weekday === "Sábado" || weekday === "Domingo" ? "no" : "na";
                const senderRole = roleLabel(member.role, member.org.segment);
                const senderName = member.displayName.split(" ")[0];
                const brokerName = nameOf.get(v.member_id) ?? "";
                const text = `Olá ${v.client_name.split(" ")[0]}! Tudo bem? Aqui é o ${senderRole} ${senderName}, to passando pra confirmar sua visita ${prep} ${weekday.toLowerCase()} ( ${dayMonth(day)} ) as ${time} com o corretor ${brokerName}!! Podemos confirmar sua presença?`;
                return (
                  <tr key={v.id} className={clsx("border-t border-line transition-colors", stage && VISIT_STAGES[stage].row)}>
                    <td className={clsx("px-4 py-2.5 font-medium", canceled && "line-through opacity-80")}>{v.client_name}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                      {v.client_phone ? (
                        <a href={`tel:${v.client_phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                          {v.client_phone}
                        </a>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {weekday} <span className="text-muted tabular-nums">{dayMonth(day)}</span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{time}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{v.region ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className={clsx(brokerChip, "text-[12px]")}>{nameOf.get(v.member_id) ?? "-"}</span>
                    </td>
                    <td className="px-3 py-2">
                      <VisitStageSelect value={stage} onChange={(s) => void changeStage(v, s)} disabled={!canEdit} className="min-w-40" />
                    </td>
                    {leader ? (
                      <td className="px-4 py-2.5 text-right">
                        {v.client_phone ? (
                          <a
                            href={`${whatsappLink(v.client_phone)}?text=${encodeURIComponent(text)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 text-[13px] font-semibold text-brand-text hover:opacity-80"
                          >
                            <MessageCircle className="size-3.5" />
                            WhatsApp
                          </a>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** Meta editável da liderança: salva ao sair do campo ou no Enter. */
function GoalInput({ value, name, onSave }: { value: number; name: string; onSave: (goal: number) => void }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const goal = Number(text);
    if (text.trim() === "" || !Number.isInteger(goal) || goal < 0 || goal > 999) {
      setText(String(value));
      return;
    }
    if (goal !== value) onSave(goal);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={999}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      aria-label={`Meta de visitas de ${name}`}
      className="h-8 w-14 rounded-lg border border-line bg-surface text-center font-display text-base font-semibold tabular-nums outline-none [appearance:textfield] focus:border-brand [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}
