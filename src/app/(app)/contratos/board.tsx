"use client";

import clsx from "clsx";
import { AlertTriangle, Check, Copy, FileText, Mail, MessageCircle, Pencil, Plus, RefreshCw, ScrollText, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { buildLetter, formatPct, INDEX_CODES, INDEXES, type IndexCode, monthLabel, nextDueDate } from "@/lib/contract-math";
import type { ContractData } from "@/lib/gemini";
import { formatMoney } from "@/lib/metrics";
import { centsToInput, maskMoneyInput, parseMoney } from "@/lib/money";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/time";
import type { FormState } from "@/lib/validation";
import {
  analyzeContract,
  approveAdjustment,
  contractFileUrl,
  deleteContract,
  importContract,
  markLetterSent,
  prepareContractUpload,
  refreshAdjustments,
  saveContract,
  sendLetterEmail,
  setContractStatus,
  skipAdjustment,
} from "./actions";

export type Contract = {
  id: string;
  kind: "locacao" | "venda";
  reference: string;
  partyName: string;
  partyEmail: string | null;
  partyPhone: string | null;
  indexCode: IndexCode;
  baseDate: string;
  periodMonths: number;
  lagMonths: number;
  allowDecrease: boolean;
  valueCents: number;
  lastAdjustedOn: string | null;
  nextAdjustmentOn: string;
  status: "active" | "ended";
  fileName: string | null;
  hasFile: boolean;
  extracted: { clause?: string | null; notes?: string | null; indexOther?: string | null } | null;
  needsReview: boolean;
  notes: string | null;
};

export type Adjustment = {
  id: string;
  contractId: string;
  dueOn: string;
  indexCode: IndexCode;
  months: { month: string; pct: number }[];
  missing: string[];
  pct: number;
  oldCents: number;
  newCents: number;
  finalCents: number | null;
  status: "pending" | "approved" | "skipped";
  letter: string | null;
  sentAt: string | null;
};

type Draft = { contract?: Contract; file?: { path: string; name: string }; ai?: ContractData; aiError?: string };

const textareaClass =
  "w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] hover:border-line-strong focus:border-ink focus:outline-none";

const daysUntil = (today: string, date: string) => Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);

function dueBadge(today: string, dueOn: string) {
  const days = daysUntil(today, dueOn);
  if (days < 0) return <Badge tone="danger">Atrasado {Math.abs(days)} {Math.abs(days) === 1 ? "dia" : "dias"}</Badge>;
  if (dueOn.slice(0, 7) === today.slice(0, 7)) return <Badge tone="warn">{days === 0 ? "Hoje" : `Este mês, em ${days} ${days === 1 ? "dia" : "dias"}`}</Badge>;
  return <Badge>Em {days} dias</Badge>;
}

function whatsappUrl(phone: string | null, text: string) {
  const d = (phone ?? "").replace(/\D/g, "");
  const number = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function ContractsBoard({
  contracts,
  adjustments,
  orgName,
  today,
  latestIndex,
  aiEnabled,
}: {
  contracts: Contract[];
  adjustments: Adjustment[];
  orgName: string;
  today: string;
  latestIndex: Record<IndexCode, string | null>;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState<Adjustment | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const byId = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);
  const pending = adjustments.filter((a) => a.status === "pending" && byId.has(a.contractId));
  const toSend = adjustments.filter((a) => a.status === "approved" && !a.sentAt && byId.has(a.contractId));
  const active = contracts.filter((c) => c.status === "active");
  const monthEnd = `${today.slice(0, 7)}-31`;
  const stats = {
    active: active.length,
    thisMonth: active.filter((c) => c.nextAdjustmentOn >= today && c.nextAdjustmentOn <= monthEnd).length,
    overdue: active.filter((c) => c.nextAdjustmentOn < today).length,
    review: active.filter((c) => c.needsReview).length,
  };
  const filtered = contracts.filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || c.reference.toLowerCase().includes(q) || c.partyName.toLowerCase().includes(q);
  });
  const indexInfo = INDEX_CODES.filter((c) => latestIndex[c]).map((c) => `${INDEXES[c].label} até ${monthLabel(latestIndex[c]!)}`);

  const refresh = () =>
    startRefresh(async () => {
      const r = await refreshAdjustments();
      setMessage("error" in r ? r.error : r.created ? `${r.created} reajuste(s) novo(s) para conferir.` : "Índices e reajustes atualizados.");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted">Reajustes</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Contratos</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={clsx("size-4", refreshing && "animate-spin")} />
            {refreshing ? "Atualizando..." : "Atualizar índices"}
          </Button>
          <Button onClick={() => setUploading(true)}>
            <Plus className="size-4" />
            Adicionar contratos
          </Button>
        </div>
      </header>

      {message ? <FormMessage tone="success">{message}</FormMessage> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contratos ativos" value={stats.active} />
        <Stat label="Reajustam este mês" value={stats.thisMonth} tone={stats.thisMonth ? "warn" : undefined} />
        <Stat label="Atrasados" value={stats.overdue} tone={stats.overdue ? "danger" : undefined} />
        <Stat label="Dados para conferir" value={stats.review} tone={stats.review ? "warn" : undefined} />
      </div>

      <Card>
        <CardHeader
          title="Reajustes para conferir"
          description={`Aparecem ${45} dias antes. Nenhum valor muda sem a sua aprovação.${indexInfo.length ? ` Índices: ${indexInfo.join(", ")}.` : ""}`}
        />
        {pending.length === 0 ? (
          <p className="px-5 pb-6 pt-3 text-sm text-muted sm:px-6">Nada para conferir agora.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {pending.map((a) => {
              const c = byId.get(a.contractId)!;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.reference}</p>
                    <p className="truncate text-sm text-muted">
                      {c.partyName} · {INDEXES[a.indexCode].label} {formatPct(a.pct)} · {formatDate(a.dueOn)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {dueBadge(today, a.dueOn)}
                    {a.missing.length ? <Badge tone="warn">Estimado</Badge> : null}
                    {c.needsReview ? <Badge tone="warn">Conferir dados</Badge> : null}
                  </div>
                  <p className="text-sm tabular-nums">
                    {formatMoney(a.oldCents)} → <strong>{formatMoney(a.newCents)}</strong>
                  </p>
                  <Button size="sm" onClick={() => setReviewing(a)}>
                    Conferir
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {toSend.length ? (
        <Card>
          <CardHeader title="Cartas para enviar" description="Reajustes aprovados que ainda não foram comunicados ao cliente." />
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {toSend.map((a) => (
              <SendRow key={a.id} adjustment={a} contract={byId.get(a.contractId)!} orgName={orgName} />
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Todos os contratos"
          description={`${contracts.length} ${contracts.length === 1 ? "contrato" : "contratos"}`}
          action={contracts.length > 6 ? <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="h-9 w-44" /> : undefined}
        />
        {contracts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <ScrollText className="size-8 text-muted" />
            <p className="font-medium">Nenhum contrato ainda</p>
            <p className="max-w-sm text-sm text-muted">
              Envie os PDFs dos contratos de locação e venda. A leitura automática identifica a data-base, o índice e o valor; você confere e o Pulse cuida dos reajustes.
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {filtered.map((c) => (
              <ContractRow key={c.id} contract={c} today={today} onEdit={() => setDraft({ contract: c })} />
            ))}
          </ul>
        )}
      </Card>

      {uploading ? (
        <UploadDialog
          aiEnabled={aiEnabled}
          onClose={() => setUploading(false)}
          onSingle={(d) => {
            setUploading(false);
            setDraft(d);
          }}
        />
      ) : null}
      {draft ? <ContractDialog draft={draft} today={today} onClose={() => setDraft(null)} /> : null}
      {reviewing && byId.get(reviewing.contractId) ? (
        <ReviewDialog adjustment={reviewing} contract={byId.get(reviewing.contractId)!} orgName={orgName} onClose={() => setReviewing(null)} />
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" | "danger" }) {
  return (
    <Card className="p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={clsx("mt-1 font-display text-2xl font-semibold tabular-nums", tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</p>
    </Card>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className={clsx(
        "m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50",
        wide ? "w-[min(44rem,calc(100vw-2rem))]" : "w-[min(36rem,calc(100vw-2rem))]",
      )}
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

// Conferência do reajuste ---------------------------------------------------------

function ReviewDialog({ adjustment: a, contract: c, orgName, onClose }: { adjustment: Adjustment; contract: Contract; orgName: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(centsToInput(a.newCents));
  const [letterEdited, setLetterEdited] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [note, setNote] = useState("");
  const indexMonths = useMemo(() => [...a.months.map((m) => m.month), ...a.missing].sort(), [a]);
  const letterFor = (cents: number) =>
    buildLetter({
      orgName,
      kind: c.kind,
      reference: c.reference,
      partyName: c.partyName,
      dueOn: a.dueOn,
      indexCode: a.indexCode,
      months: indexMonths,
      pct: a.pct,
      oldCents: a.oldCents,
      newCents: cents,
    });
  const [letter, setLetter] = useState(() => letterFor(a.newCents));
  const finalCents = parseMoney(value);

  const changeValue = (raw: string) => {
    const masked = maskMoneyInput(raw);
    setValue(masked);
    const cents = parseMoney(masked);
    if (cents && !letterEdited) setLetter(letterFor(cents));
  };

  const approve = () =>
    start(async () => {
      const r = await approveAdjustment({ id: a.id, finalValue: value, letter });
      if ("error" in r) setError(r.error);
      else {
        router.refresh();
        onClose();
      }
    });
  const skip = () =>
    start(async () => {
      const r = await skipAdjustment(a.id, note);
      if ("error" in r) setError(r.error);
      else {
        router.refresh();
        onClose();
      }
    });

  return (
    <Modal title="Conferir reajuste" onClose={onClose} wide>
      <div>
        <p className="font-medium">{c.reference}</p>
        <p className="text-sm text-muted">
          {c.partyName} · {c.kind === "locacao" ? "Locação" : "Venda"} · reajuste em {formatDate(a.dueOn)}
        </p>
      </div>
      {error ? <FormMessage>{error}</FormMessage> : null}
      {c.needsReview ? (
        <p className="flex gap-2 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Os dados deste contrato foram lidos automaticamente e ainda não foram conferidos. Confira data-base, índice e valor antes de aprovar.
        </p>
      ) : null}
      {a.missing.length ? (
        <p className="flex gap-2 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {INDEXES[a.indexCode].label} de {a.missing.map(monthLabel).join(", ")} ainda não saiu. O valor é uma estimativa; o Pulse recalcula quando o índice for publicado.
        </p>
      ) : null}

      <div className="rounded-xl border border-line">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5 text-sm">
          <span className="font-medium">{INDEXES[a.indexCode].label} mês a mês</span>
          <span>
            Acumulado <strong>{formatPct(a.pct)}</strong>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-px bg-line text-sm sm:grid-cols-6">
          {indexMonths.map((m) => {
            const v = a.months.find((x) => x.month === m);
            return (
              <div key={m} className="bg-surface px-2.5 py-2">
                <p className="text-xs text-muted">{monthLabel(m)}</p>
                <p className={clsx("tabular-nums", !v && "text-warn")}>{v ? formatPct(v.pct) : "a sair"}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[13px] font-medium text-ink-2">Valor atual</p>
          <p className="mt-2 tabular-nums">{formatMoney(a.oldCents)}</p>
        </div>
        <div>
          <p className="text-[13px] font-medium text-ink-2">Calculado</p>
          <p className="mt-2 tabular-nums">{formatMoney(a.newCents)}</p>
          {a.pct < 0 && !c.allowDecrease ? <p className="text-xs text-muted">Índice negativo: o contrato não reduz o valor.</p> : null}
        </div>
        <Field label="Valor final (R$)" hint="Ajuste o arredondamento se precisar">
          <Input value={value} onChange={(e) => changeValue(e.target.value)} inputMode="decimal" />
        </Field>
      </div>

      <Field label="Carta para o cliente" hint={letterEdited ? "Editada por você" : "Atualiza sozinha com o valor final"}>
        <textarea
          value={letter}
          onChange={(e) => {
            setLetter(e.target.value);
            setLetterEdited(true);
          }}
          rows={12}
          maxLength={4000}
          className={textareaClass}
        />
      </Field>

      {skipping ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-3.5">
          <Field label="Por que não aplicar?" hint="Opcional. O valor fica igual e o próximo reajuste vai para o ano seguinte.">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ex.: negociado com o cliente" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSkipping(false)} disabled={pending}>
              Voltar
            </Button>
            <Button variant="danger" size="sm" onClick={skip} disabled={pending}>
              Não aplicar este reajuste
            </Button>
          </div>
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => setSkipping(true)} disabled={pending || skipping}>
          Não aplicar
        </Button>
        <Button onClick={approve} disabled={pending || !finalCents}>
          <Check className="size-4" />
          {pending ? "Salvando..." : `Aprovar ${finalCents ? formatMoney(finalCents) : ""}`}
        </Button>
      </footer>
    </Modal>
  );
}

function SendRow({ adjustment: a, contract: c, orgName }: { adjustment: Adjustment; contract: Contract; orgName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [emailed, setEmailed] = useState(false);
  const letter = a.letter ?? "";

  const run = (fn: () => Promise<{ error: string } | { ok: boolean }>) =>
    start(async () => {
      const r = await fn();
      if ("error" in r) setMsg({ text: r.error, ok: false });
      else router.refresh();
    });
  // Envia por e-mail e mostra o resultado (sucesso ou erro) sem tirar a linha,
  // para a pessoa ter certeza do que aconteceu e poder reenviar se falhar.
  const emailLetter = () =>
    start(async () => {
      setMsg(null);
      const r = await sendLetterEmail(a.id);
      if ("error" in r) setMsg({ text: `Não foi enviado: ${r.error} Tente de novo.`, ok: false });
      else {
        setEmailed(true);
        setMsg({ text: `E-mail enviado com sucesso para ${c.partyEmail}.`, ok: true });
      }
    });
  const copy = async () => {
    await navigator.clipboard.writeText(letter).catch(() => null);
    setMsg({ text: "Carta copiada.", ok: true });
  };
  // Abre a carta formatada numa janela e chama a impressão: a pessoa salva como PDF.
  const printLetter = () => {
    const esc = (s: string) => s.replace(/[&<>]/g, (ch) => (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : "&gt;"));
    const win = window.open("", "_blank", "width=820,height=920");
    if (!win) {
      setMsg({ text: "Libere os pop-ups do navegador para gerar o PDF.", ok: false });
      return;
    }
    win.document.write(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Carta de reajuste - ${esc(c.reference)}</title>` +
        `<style>@page{margin:2.5cm}body{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.7;margin:0}` +
        `.org{font-size:18px;font-weight:700;color:#0a1428;border-bottom:1px solid #e2e7f0;padding-bottom:12px;margin-bottom:24px}` +
        `.body{white-space:pre-wrap}</style></head>` +
        `<body><div class="org">${esc(orgName)}</div><div class="body">${esc(letter)}</div></body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => {
      try {
        win.print();
      } catch {
        // Se o navegador bloquear, a pessoa usa Ctrl+P e "Salvar como PDF".
      }
    }, 350);
  };

  return (
    <li className="flex flex-col gap-2 px-5 py-3.5 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{c.reference}</p>
          <p className="truncate text-sm text-muted">
            {c.partyName} · a partir de {formatDate(a.dueOn)} · {formatMoney(a.oldCents)} → <strong>{formatMoney(a.finalCents ?? a.newCents)}</strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={copy}>
            <Copy className="size-3.5" />
            Copiar
          </Button>
          <Button size="sm" variant="secondary" onClick={printLetter}>
            <FileText className="size-3.5" />
            PDF
          </Button>
          {c.partyPhone ? (
            <a
              href={whatsappUrl(c.partyPhone, letter)}
              target="_blank"
              rel="noreferrer"
              onClick={() => run(() => markLetterSent(a.id))}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium hover:bg-surface-2"
            >
              <MessageCircle className="size-3.5" />
              WhatsApp
            </a>
          ) : null}
          <Button size="sm" variant="secondary" onClick={emailLetter} disabled={pending || !c.partyEmail} title={c.partyEmail ? undefined : "Contrato sem e-mail do cliente"}>
            {emailed ? <Check className="size-3.5" /> : <Mail className="size-3.5" />}
            {emailed ? "Reenviar" : "E-mail"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => run(() => markLetterSent(a.id))} disabled={pending}>
            Já enviei
          </Button>
        </div>
      </div>
      {msg ? <p className={`text-xs ${msg.ok ? "text-brand-text" : "text-danger"}`}>{msg.text}</p> : null}
    </li>
  );
}

// Contratos -------------------------------------------------------------------

function ContractRow({ contract: c, today, onEdit }: { contract: Contract; today: string; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error: string } | { ok: boolean }>) =>
    start(async () => {
      const r = await fn();
      setError("error" in r ? r.error : null);
      if (!("error" in r)) router.refresh();
    });
  const openFile = () =>
    start(async () => {
      const r = await contractFileUrl(c.id);
      if ("error" in r) setError(r.error);
      else window.open(r.url, "_blank", "noopener");
    });

  return (
    <li className={clsx("flex flex-col gap-2 px-5 py-3.5 sm:px-6", c.status === "ended" && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{c.reference}</p>
          <p className="truncate text-sm text-muted">
            {c.partyName} · {c.kind === "locacao" ? "Locação" : "Venda"} · {INDEXES[c.indexCode].label} · {formatMoney(c.valueCents)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.needsReview ? (
            <Badge tone="warn">
              <Sparkles className="size-3" />
              Conferir dados
            </Badge>
          ) : null}
          {c.status === "ended" ? <Badge>Encerrado</Badge> : <span className="text-sm text-muted">Reajuste {formatDate(c.nextAdjustmentOn)}</span>}
          {c.status === "active" && c.nextAdjustmentOn < today ? <Badge tone="danger">Atrasado</Badge> : null}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={c.needsReview ? "secondary" : "ghost"} onClick={onEdit} disabled={pending}>
            <Pencil className="size-3.5" />
            {c.needsReview ? "Conferir" : "Editar"}
          </Button>
          {c.hasFile ? (
            <Button size="sm" variant="ghost" onClick={openFile} disabled={pending} aria-label="Abrir arquivo">
              <FileText className="size-3.5" />
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => run(() => setContractStatus(c.id, c.status === "active" ? "ended" : "active"))} disabled={pending}>
            {c.status === "active" ? "Encerrar" : "Reativar"}
          </Button>
          {confirmDel ? (
            <>
              <Button size="sm" variant="danger" onClick={() => run(() => deleteContract(c.id))} disabled={pending}>
                Apagar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDel(true)} disabled={pending} aria-label="Apagar contrato">
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </li>
  );
}

function ContractDialog({ draft, today, onClose }: { draft: Draft; today: string; onClose: () => void }) {
  const router = useRouter();
  const c = draft.contract;
  const ai = draft.ai;
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});
  const [value, setValue] = useState(centsToInput(c?.valueCents ?? ai?.valueCents ?? null));
  const [baseDate, setBaseDate] = useState(c?.baseDate ?? ai?.baseDate ?? "");
  const [last, setLast] = useState(c?.lastAdjustedOn ?? "");
  const [period, setPeriod] = useState(String(c?.periodMonths ?? ai?.periodMonths ?? 12));
  const extracted = c?.extracted ?? (ai ? { clause: ai.clause, notes: ai.notes, indexOther: ai.indexOther } : null);

  const next = /^\d{4}-\d{2}-\d{2}$/.test(baseDate) && Number(period) >= 1 ? nextDueDate(baseDate, Number(period), last || null) : null;
  let overdue = 0;
  for (let d = next; d && d < today && overdue < 50; d = nextDueDate(baseDate, Number(period), d)) overdue++;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveContract(c?.id ?? null, data);
      setState(r);
      if (r.success) {
        router.refresh();
        onClose();
      }
    });
  };
  const err = state.fieldErrors ?? {};

  return (
    <Modal title={c ? (c.needsReview ? "Conferir contrato" : "Editar contrato") : "Novo contrato"} onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
        {draft.aiError ? <FormMessage>{draft.aiError}</FormMessage> : null}
        {extracted && (extracted.clause || extracted.notes || extracted.indexOther) ? (
          <div className="flex flex-col gap-2 rounded-xl bg-brand-soft px-3.5 py-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-brand-text">
              <Sparkles className="size-4" />
              Leitura automática: confira cada campo antes de salvar
            </p>
            {extracted.indexOther ? (
              <p className="text-danger">O contrato usa {extracted.indexOther}, que o Pulse ainda não acompanha. Escolha o índice manualmente.</p>
            ) : null}
            {extracted.clause ? <p className="whitespace-pre-wrap text-ink-2">“{extracted.clause}”</p> : null}
            {extracted.notes ? <p className="text-ink-2">Atenção: {extracted.notes}</p> : null}
          </div>
        ) : null}

        <input type="hidden" name="filePath" value={draft.file?.path ?? ""} />
        <input type="hidden" name="fileName" value={draft.file?.name ?? ""} />
        <input type="hidden" name="extracted" value={!c && ai ? JSON.stringify({ clause: ai.clause, notes: ai.notes, indexOther: ai.indexOther, source: "ai" }) : ""} />

        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label="Tipo" error={err.kind}>
            <Select name="kind" defaultValue={c?.kind ?? ai?.kind ?? "locacao"}>
              <option value="locacao">Locação</option>
              <option value="venda">Venda</option>
            </Select>
          </Field>
          <Field label="Contrato" hint="Imóvel, unidade ou número" error={err.reference}>
            <Input name="reference" defaultValue={c?.reference ?? ai?.reference ?? ""} maxLength={160} placeholder="Ex.: Apto 42, Rua das Flores 100" />
          </Field>
        </div>
        <Field label="Cliente" hint={c?.kind === "venda" ? "Comprador" : "Locatário ou comprador"} error={err.partyName}>
          <Input name="partyName" defaultValue={c?.partyName ?? ai?.partyName ?? ""} maxLength={160} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="E-mail do cliente" hint="Opcional, para mandar a carta" error={err.partyEmail}>
            <Input name="partyEmail" type="email" defaultValue={c?.partyEmail ?? ai?.partyEmail ?? ""} maxLength={254} />
          </Field>
          <Field label="WhatsApp do cliente" hint="Opcional, com DDD" error={err.partyPhone}>
            <Input name="partyPhone" inputMode="tel" defaultValue={c?.partyPhone ?? ai?.partyPhone ?? ""} maxLength={30} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Índice" error={err.indexCode}>
            <Select name="indexCode" defaultValue={c?.indexCode ?? ai?.indexCode ?? ""}>
              <option value="" disabled>
                Escolha
              </option>
              {INDEX_CODES.map((code) => (
                <option key={code} value={code}>
                  {INDEXES[code].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valor atual (R$)" error={err.value}>
            <Input name="value" value={value} onChange={(e) => setValue(maskMoneyInput(e.target.value))} inputMode="decimal" placeholder="2.500,00" />
          </Field>
          <Field label="Reajusta a cada" error={err.periodMonths}>
            <Select name="periodMonths" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {[12, 6, 24, 1].map((m) => (
                <option key={m} value={m}>
                  {m === 1 ? "mês" : `${m} meses`}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Data-base" hint="Início do contrato ou data do último aniversário" error={err.baseDate}>
            <Input name="baseDate" type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} />
          </Field>
          <Field label="Último reajuste aplicado" hint="Em branco se o valor acima é o original" error={err.lastAdjustedOn}>
            <Input name="lastAdjustedOn" type="date" value={last} onChange={(e) => setLast(e.target.value)} />
          </Field>
        </div>

        {next ? (
          <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
            Próximo reajuste: <strong>{formatDate(next)}</strong>
            {overdue > 1 ? ` · ${overdue} reajustes atrasados; o Pulse calcula um de cada vez, em ordem, para você aprovar.` : ""}
          </p>
        ) : null}

        <details className="rounded-xl border border-line px-3.5 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium">Regras do índice</summary>
          <div className="mt-3 flex flex-col gap-3">
            <Field label="Defasagem do índice" hint="A maioria usa os 12 meses até o mês anterior ao reajuste">
              <Select name="lagMonths" defaultValue={String(c?.lagMonths ?? ai?.lagMonths ?? 1)}>
                <option value="0">Até o próprio mês do reajuste</option>
                <option value="1">Até o mês anterior</option>
                <option value="2">Até dois meses antes</option>
                <option value="3">Até três meses antes</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="allowDecrease" defaultChecked={c?.allowDecrease ?? ai?.allowDecrease ?? false} className="size-4" />
              Índice negativo reduz o valor
            </label>
          </div>
        </details>

        <Field label="Observações" hint="Opcional" error={err.notes}>
          <textarea name="notes" defaultValue={c?.notes ?? ""} rows={2} maxLength={2000} className={textareaClass} />
        </Field>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : c?.needsReview ? "Conferido, salvar" : c ? "Salvar" : "Cadastrar"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

// Envio de arquivos -------------------------------------------------------------

type FileResult = { name: string; state: "waiting" | "reading" | "ok" | "error"; detail?: string };

function UploadDialog({ aiEnabled, onClose, onSingle }: { aiEnabled: boolean; onClose: () => void; onSingle: (d: Draft) => void }) {
  const router = useRouter();
  const [results, setResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    const prepared = await prepareContractUpload({ name: file.name, size: file.size, type: file.type });
    if ("error" in prepared) return prepared;
    const { error } = await getBrowserClient().storage.from("contracts").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type });
    if (error) return { error: `${file.name}: o arquivo não subiu. Confira a internet.` };
    return { path: prepared.path };
  };

  const pick = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setError(null);
    setBusy(true);

    if (files.length === 1) {
      const file = files[0];
      const up = await upload(file);
      if ("error" in up) {
        setError(up.error);
        setBusy(false);
        return;
      }
      const draft: Draft = { file: { path: up.path, name: file.name } };
      if (aiEnabled) {
        setResults([{ name: file.name, state: "reading" }]);
        const r = await analyzeContract(up.path);
        if ("error" in r) draft.aiError = r.error;
        else draft.ai = r.data;
      }
      onSingle(draft);
      return;
    }

    setResults(files.map((f) => ({ name: f.name, state: "waiting" })));
    const set = (i: number, patch: Partial<FileResult>) => setResults((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    for (const [i, file] of files.entries()) {
      set(i, { state: "reading" });
      const up = await upload(file);
      if ("error" in up) {
        set(i, { state: "error", detail: up.error });
        continue;
      }
      const r = await importContract(up.path, file.name).catch(() => ({ error: "Falha de conexão." }));
      set(i, "error" in r ? { state: "error", detail: r.error } : { state: "ok", detail: r.reference });
    }
    setBusy(false);
    router.refresh();
  };

  const finished = results.length > 1 && !busy;

  return (
    <Modal title="Adicionar contratos" onClose={busy ? () => undefined : onClose}>
      {error ? <FormMessage>{error}</FormMessage> : null}
      {results.length === 0 ? (
        <>
          <label
            className={clsx(
              "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-6 py-10 text-center hover:border-line-strong",
              busy && "pointer-events-none opacity-60",
            )}
          >
            <Upload className="size-7 text-muted" />
            <span className="font-medium">{busy ? "Enviando..." : "Escolha os arquivos dos contratos"}</span>
            <span className="text-sm text-muted">
              PDF, JPG ou PNG, até 10 MB cada.{" "}
              {aiEnabled ? "Um arquivo abre para você conferir; vários entram de uma vez e ficam marcados para conferência." : "A leitura automática está desligada: preencha os dados à mão."}
            </span>
            <input type="file" accept="application/pdf,image/jpeg,image/png" multiple={aiEnabled} className="sr-only" onChange={(e) => pick(e.target.files)} disabled={busy} />
          </label>
          <button type="button" onClick={() => onSingle({})} className="self-center text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
            Cadastrar sem arquivo
          </button>
        </>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {results.map((r, i) => (
            <li key={i} className="flex items-start gap-3 px-3.5 py-2.5 text-sm">
              <span className="mt-0.5">
                {r.state === "ok" ? <Check className="size-4 text-brand-text" /> : r.state === "error" ? <AlertTriangle className="size-4 text-danger" /> : r.state === "reading" ? <RefreshCw className="size-4 animate-spin text-muted" /> : <FileText className="size-4 text-muted" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.name}</span>
                {r.state === "reading" ? <span className="text-muted">Lendo o contrato...</span> : null}
                {r.detail ? <span className={r.state === "error" ? "text-danger" : "text-muted"}>{r.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {finished ? (
        <footer className="flex justify-end border-t border-line pt-4">
          <Button onClick={onClose}>Conferir na lista</Button>
        </footer>
      ) : null}
    </Modal>
  );
}