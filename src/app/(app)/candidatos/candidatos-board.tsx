"use client";

import clsx from "clsx";
import { Download, Eye, ListChecks, Paperclip, Plus, Search, Trash2, UserSearch, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/time";
import type { FormState } from "@/lib/validation";
import {
  addCandidate,
  type CandidateDetail,
  deleteCandidate,
  getCandidateDetail,
  prepareResumeUpload,
  resumeLink,
  saveCandidateNotes,
  sendChecklist,
  setCandidaturaStatus,
} from "./actions";

export type CandidaturaStatus = "novo" | "triagem" | "entrevista" | "aprovado" | "reprovado" | "contratado";
export type Row = {
  id: string;
  candidatoId: string;
  name: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  source: "manual" | "whatsapp";
  hasResume: boolean;
  vagaId: string;
  vagaTitle: string;
  score: number | null;
  scoreReason: string | null;
  status: CandidaturaStatus;
  createdAt: string;
  /** Dia da candidatura no fuso da empresa (AAAA-MM-DD). */
  appliedOn: string;
  checklistSentOn: string | null;
};
export type VagaOption = { id: string; title: string; open: boolean };

const STATUS: Record<CandidaturaStatus, { label: string; tone: "neutral" | "brand" | "warn" | "danger" }> = {
  novo: { label: "Novo", tone: "neutral" },
  triagem: { label: "Em triagem", tone: "neutral" },
  entrevista: { label: "Entrevista", tone: "warn" },
  aprovado: { label: "Aprovado", tone: "brand" },
  reprovado: { label: "Recusado", tone: "danger" },
  contratado: { label: "Contratado", tone: "brand" },
};
const STATUS_KEYS = Object.keys(STATUS) as CandidaturaStatus[];
const RESUME_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png";
const RESUME_MAX = 10 * 1024 * 1024;

// Excel executa células que começam com = + - @ como fórmula.
function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Baixa a lista filtrada como planilha (abre no Excel com acentos). */
function exportCsv(rows: Row[], from: string, to: string) {
  const header = ["Data da candidatura", "Nome", "Telefone", "E-mail", "Cidade", "Vaga", "Situação", "Nota da IA", "Origem"];
  const lines = rows.map((r) =>
    [
      formatDate(r.appliedOn),
      r.name,
      r.phone ?? "",
      r.email ?? "",
      r.city ?? "",
      r.vagaTitle,
      STATUS[r.status].label,
      r.score ?? "",
      r.source === "whatsapp" ? "WhatsApp" : "Manual",
    ]
      .map(csvCell)
      .join(";"),
  );
  const csv = `\uFEFF${[header.map(csvCell).join(";"), ...lines].join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `pulse-candidatos${from || to ? `-${from || "inicio"}-a-${to || "hoje"}` : ""}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** O link assinado já vem como anexo com o nome do candidato; navegar até ele só dispara o download. */
function downloadFile(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.click();
}

function ScoreBadge({ score }: { score: number | null }) {
  return (
    <span
      title={score != null ? `Nota da IA: ${score} de 100` : "Ainda sem nota da IA"}
      className={clsx(
        "grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums",
        score == null ? "bg-surface-2 text-muted" : score >= 70 ? "bg-brand-soft text-brand-text" : score >= 40 ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2",
      )}
    >
      {score ?? "-"}
    </span>
  );
}

type BoardCtx = { checklist: string[]; canDelete: boolean; timezone: string };

export function CandidatosBoard({
  rows,
  vagas,
  checklist,
  canDelete,
  timezone,
}: {
  rows: Row[];
  vagas: VagaOption[];
  checklist: string[];
  canDelete: boolean;
  timezone: string;
}) {
  const [vaga, setVaga] = useState("all");
  const [status, setStatus] = useState<"all" | CandidaturaStatus>("all");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"score" | "recent" | "oldest">("score");
  const [adding, setAdding] = useState(false);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = rows.filter(
      (r) =>
        (vaga === "all" || r.vagaId === vaga) &&
        (status === "all" || r.status === status) &&
        (!q || r.name.toLowerCase().includes(q)) &&
        (!from || r.appliedOn >= from) &&
        (!to || r.appliedOn <= to),
    );
    if (sort === "recent") return [...list].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    if (sort === "oldest") return [...list].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    return list;
  }, [rows, vaga, status, q, from, to, sort]);

  const counts = useMemo(() => {
    const c: Partial<Record<"all" | CandidaturaStatus, number>> = { all: 0 };
    for (const r of rows) {
      if (vaga !== "all" && r.vagaId !== vaga) continue;
      c.all = (c.all ?? 0) + 1;
      c[r.status] = (c[r.status] ?? 0) + 1;
    }
    return c;
  }, [rows, vaga]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted">Recrutamento</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Candidatos</h1>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button variant="secondary" onClick={() => exportCsv(visible, from, to)} disabled={visible.length === 0}>
            <Download className="size-4" />
            <span className="sm:hidden">Planilha</span>
            <span className="hidden sm:inline">Exportar planilha</span>
          </Button>
          <Button onClick={() => setAdding(true)} disabled={vagas.length === 0}>
            <Plus className="size-4" />
            <span className="sm:hidden">Adicionar</span>
            <span className="hidden sm:inline">Adicionar candidato</span>
          </Button>
        </div>
      </header>

      {vagas.length === 0 ? (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Crie uma vaga antes de adicionar candidatos.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <label className="relative col-span-2 w-full sm:max-w-xs">
          <span className="sr-only">Buscar candidato</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome"
            className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-ink"
          />
        </label>
        <select value={vaga} onChange={(e) => setVaga(e.target.value)} aria-label="Vaga" className="h-10 min-w-0 rounded-xl border border-line bg-surface px-3 text-sm">
          <option value="all">Todas as vagas</option>
          {vagas.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Ordenar" className="h-10 min-w-0 rounded-xl border border-line bg-surface px-3 text-sm sm:order-last">
          <option value="score">Maior nota</option>
          <option value="recent">Mais recentes</option>
          <option value="oldest">Mais antigos</option>
        </select>
        <label className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-muted">
          De
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="Candidatou-se a partir de" className="min-w-0 flex-1 bg-transparent text-ink outline-none" />
        </label>
        <label className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-muted">
          Até
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="Candidatou-se até" className="min-w-0 flex-1 bg-transparent text-ink outline-none" />
        </label>
        {from || to ? (
          <Button
            size="sm"
            variant="ghost"
            className="col-span-2 sm:col-span-1"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Limpar datas
          </Button>
        ) : null}
      </div>

      <div role="tablist" aria-label="Situação" className="flex max-w-full gap-1 self-stretch overflow-x-auto rounded-xl bg-surface-2 p-1 [scrollbar-width:none] sm:self-start">
        {(["all", ...STATUS_KEYS] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={clsx(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
              status === s ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
            )}
          >
            {s === "all" ? "Todos" : STATUS[s].label}
            <span className="text-xs tabular-nums text-muted">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <p className="-mt-2 text-sm text-muted">
        {visible.length} {visible.length === 1 ? "candidatura" : "candidaturas"}
        {from || to ? ` de ${from ? formatDate(from) : "o início"} até ${to ? formatDate(to) : "hoje"}` : ""}
      </p>

      <Card>
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <UserSearch className="size-8 text-muted" />
            <p className="font-medium">{rows.length === 0 ? "Nenhum candidato ainda" : "Nenhum candidato com esses filtros"}</p>
            <p className="max-w-sm text-sm text-muted">Adicione um candidato ou aguarde as inscrições chegarem.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            <li
              aria-hidden
              className="hidden px-6 py-2.5 text-xs font-medium tracking-wide text-muted uppercase lg:grid lg:grid-cols-[3rem_minmax(0,1.7fr)_minmax(0,1fr)_9rem_auto] lg:gap-5"
            >
              <span>Nota</span>
              <span>Candidato e avaliação da IA</span>
              <span>Vaga</span>
              <span>Situação</span>
              <span className="text-right">Ações</span>
            </li>
            {visible.map((r) => (
              <CandidateRow key={r.id} row={r} ctx={{ checklist, canDelete, timezone }} />
            ))}
          </ul>
        )}
      </Card>

      {adding ? <AddDialog vagas={vagas} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function CandidateRow({ row, ctx }: { row: Row; ctx: BoardCtx }) {
  const { checklist } = ctx;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [sendingDocs, setSendingDocs] = useState(false);
  const [viewing, setViewing] = useState(false);
  const canSendDocs = (row.status === "aprovado" || row.status === "contratado") && Boolean(row.phone);

  const change = (status: CandidaturaStatus, note?: string) =>
    start(async () => {
      const r = await setCandidaturaStatus(row.id, status, note);
      if ("error" in r) setError(r.error);
      else router.refresh();
    });

  const openResume = () =>
    start(async () => {
      const r = await resumeLink(row.candidatoId);
      if ("url" in r && r.url) downloadFile(r.url);
      else if ("error" in r) setError(r.error ?? null);
    });

  // Clique em qualquer parte da linha abre a ficha; botões e campos fazem só a própria ação.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <li
      onClick={() => setViewing(true)}
      className="group cursor-pointer px-4 py-4 transition-colors hover:bg-surface-2/60 active:bg-surface-2/60 sm:px-6 lg:grid lg:grid-cols-[3rem_minmax(0,1.7fr)_minmax(0,1fr)_9rem_auto] lg:items-center lg:gap-5"
    >
      <div className="flex items-start gap-3 lg:contents">
        <ScoreBadge score={row.score} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate font-medium group-hover:underline">{row.name}</span>
            {row.source === "whatsapp" ? <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">WhatsApp</span> : null}
          </p>
          <p className="truncate text-xs text-muted lg:hidden">
            {row.vagaTitle} · {formatDate(row.appliedOn)}
          </p>
          {row.scoreReason ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-2 lg:line-clamp-1">
              <span className="font-medium text-muted">IA: </span>
              {row.scoreReason}
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-muted">{row.city ?? "Sem avaliação da IA"}</p>
          )}
        </div>
      </div>

      <div className="hidden min-w-0 lg:block">
        <p className="truncate text-sm">{row.vagaTitle}</p>
        <p className="truncate text-xs text-muted">
          {formatDate(row.appliedOn)}
          {row.city ? ` · ${row.city}` : ""}
          {row.checklistSentOn ? ` · Checklist ${formatDate(row.checklistSentOn)}` : ""}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2 lg:contents" onClick={stop}>
        <div className="min-w-0 flex-1 lg:flex-none" onClick={stop}>
          <select
            value={row.status}
            onChange={(e) => change(e.target.value as CandidaturaStatus)}
            disabled={pending}
            aria-label={`Situação de ${row.name}`}
            className={clsx(
              "h-9 w-full rounded-lg border px-2 text-sm font-medium lg:w-36",
              row.status === "novo" ? "border-brand/40 bg-brand-soft text-brand-text" : "border-line bg-surface",
            )}
          >
            {STATUS_KEYS.map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex shrink-0 items-center gap-1 lg:flex-wrap lg:justify-end lg:gap-1.5" onClick={stop}>
          <Button size="sm" variant="ghost" onClick={() => setViewing(true)} className="hidden lg:inline-flex">
            <Eye className="size-4" />
            Ver ficha
          </Button>
          {row.hasResume ? (
            <Button size="sm" variant="ghost" onClick={openResume} disabled={pending} title="Baixar currículo" aria-label="Baixar currículo">
              <Download className="size-4" />
              <span className="hidden xl:inline">Currículo</span>
            </Button>
          ) : null}
          {canSendDocs ? (
            <Button size="sm" variant="ghost" onClick={() => setSendingDocs(true)} disabled={pending} title="Checklist de documentos" aria-label="Checklist de documentos">
              <ListChecks className="size-4" />
              <span className="hidden sm:inline">{row.checklistSentOn ? "Reenviar" : "Checklist"}</span>
            </Button>
          ) : null}
        {row.status !== "aprovado" && row.status !== "reprovado" && row.status !== "contratado" ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => change("aprovado")} disabled={pending}>
              Aprovar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(true)} disabled={pending}>
              Recusar
            </Button>
          </>
        ) : null}
        </div>
      </div>

      {error ? (
        <span className="mt-2 block text-xs text-danger lg:col-span-5" onClick={stop}>
          {error}
        </span>
      ) : null}

      <div className="contents" onClick={stop}>
      {rejecting ? (
        <RejectDialog
          name={row.name}
          onClose={() => setRejecting(false)}
          onConfirm={(note) => {
            setRejecting(false);
            change("reprovado", note);
          }}
        />
      ) : null}

      {viewing ? (
        <CandidateSheet
          candidatoId={row.candidatoId}
          ctx={ctx}
          onClose={() => setViewing(false)}
          onDeleted={() => {
            setViewing(false);
            router.refresh();
          }}
        />
      ) : null}

      {sendingDocs ? (
        <ChecklistDialog
          row={row}
          items={checklist}
          onClose={() => setSendingDocs(false)}
          onSent={() => {
            setSendingDocs(false);
            router.refresh();
          }}
        />
      ) : null}
      </div>
    </li>
  );
}

const dateTimeFmt = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dateFmt = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
}

/** Ficha do candidato num painel lateral: dados, resumo da IA, vagas, entrevistas e anotações. */
function CandidateSheet({ candidatoId, ctx, onClose, onDeleted }: { candidatoId: string; ctx: BoardCtx; onClose: () => void; onDeleted: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesState, setNotesState] = useState<"idle" | "saved" | "error">("idle");
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    let cancelled = false;
    void getCandidateDetail(candidatoId).then((r) => {
      if (cancelled) return;
      if ("error" in r) setLoadError(r.error);
      else {
        setDetail(r.detail);
        setNotes(r.detail.notes);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [candidatoId]);

  const saveNotes = () =>
    start(async () => {
      const r = await saveCandidateNotes(candidatoId, notes);
      setNotesState("error" in r ? "error" : "saved");
    });

  const openResume = () =>
    start(async () => {
      const r = await resumeLink(candidatoId);
      if ("url" in r && r.url) downloadFile(r.url);
      else if ("error" in r) setError(r.error ?? null);
    });

  const remove = () =>
    start(async () => {
      setError(null);
      const r = await deleteCandidate(candidatoId);
      if ("error" in r) setError(r.error ?? "Não foi possível apagar.");
      else onDeleted();
    });

  const tz = ctx.timezone;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-0 ml-auto h-dvh max-h-dvh w-[min(40rem,100vw)] max-w-none overflow-y-auto border-l border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
    >
      <div className="flex min-h-full flex-col gap-6 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted">Ficha do candidato</p>
            <h2 className="mt-0.5 truncate font-display text-2xl font-semibold tracking-tight">{detail?.name ?? "Carregando..."}</h2>
            {detail ? (
              <p className="mt-1 text-xs text-muted">
                No banco de talentos desde {dateFmt(detail.createdAt, tz)} · {detail.source === "whatsapp" ? "chegou pelo WhatsApp" : "cadastrado pela equipe"}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 sm:size-8">
            <X className="size-4" />
          </button>
        </header>

        {loadError ? <FormMessage>{loadError}</FormMessage> : null}
        {error ? <FormMessage>{error}</FormMessage> : null}

        {detail ? (
          <>
            <section className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
                <p className="text-xs text-muted">WhatsApp</p>
                {detail.phone ? (
                  <a href={waLink(detail.phone)} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                    {detail.phone}
                  </a>
                ) : (
                  <p className="text-muted">-</p>
                )}
              </div>
              <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
                <p className="text-xs text-muted">E-mail</p>
                {detail.email ? (
                  <a href={`mailto:${detail.email}`} className="block truncate font-medium hover:underline">
                    {detail.email}
                  </a>
                ) : (
                  <p className="text-muted">-</p>
                )}
              </div>
              <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
                <p className="text-xs text-muted">Cidade</p>
                <p className="font-medium">{detail.city ?? "-"}</p>
              </div>
              <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
                <p className="text-xs text-muted">Currículo</p>
                {detail.hasResume ? (
                  <button type="button" onClick={openResume} disabled={pending} className="flex max-w-full items-center gap-1.5 font-medium hover:underline">
                    <Download className="size-4 shrink-0" />
                    <span className="truncate">Baixar currículo</span>
                  </button>
                ) : (
                  <p className="text-muted">Não enviado</p>
                )}
              </div>
            </section>

            {detail.summary ? (
              <section>
                <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Resumo da IA</h3>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{detail.summary}</p>
              </section>
            ) : null}

            <section>
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Vagas ({detail.candidaturas.length})</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {detail.candidaturas.map((c) => {
                  const st = STATUS[c.status as CandidaturaStatus];
                  return (
                    <li key={c.id} className="rounded-xl border border-line p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">{c.vagaTitle}</span>
                        {c.score != null ? <span className="text-sm font-semibold tabular-nums">Nota {c.score}</span> : null}
                        {st ? <Badge tone={st.tone}>{st.label}</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">Candidatou-se em {dateFmt(c.createdAt, tz)}</p>
                      {c.scoreReason ? <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{c.scoreReason}</p> : null}
                      {c.reviewNote ? <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">Retorno enviado: {c.reviewNote}</p> : null}
                    </li>
                  );
                })}
              </ul>
            </section>

            {detail.chat.length ? (
              <section>
                <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Conversa no WhatsApp</h3>
                <ul className="mt-2 flex max-h-80 flex-col gap-1.5 overflow-y-auto rounded-xl bg-surface-2 p-3">
                  {detail.chat.map((t, i) => (
                    <li
                      key={i}
                      className={clsx(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug whitespace-pre-line",
                        t.role === "bot" ? "self-end rounded-br-md bg-brand-soft text-ink" : "self-start rounded-bl-md bg-surface",
                      )}
                    >
                      <span className="mb-0.5 block text-[11px] font-medium text-muted">{t.role === "bot" ? "Atendimento automático" : detail.name.split(" ")[0]}</span>
                      {t.text}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {detail.entrevistas.length ? (
              <section>
                <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Entrevistas</h3>
                <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                  {detail.entrevistas.map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-x-2">
                      <span className="font-medium tabular-nums">{dateTimeFmt(e.at, tz)}</span>
                      <span className="text-muted">
                        · {e.duration} min · {e.vagaTitle}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <Field label="Anotações da equipe" hint={notesState === "saved" ? "Salvo." : notesState === "error" ? "Não foi possível salvar." : "Só a equipe vê. Ex.: impressões da entrevista, pretensão salarial."}>
                <textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setNotesState("idle");
                  }}
                  rows={4}
                  maxLength={2000}
                  className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] hover:border-line-strong focus:border-ink focus:outline-none"
                />
              </Field>
              <Button size="sm" variant="secondary" onClick={saveNotes} disabled={pending || notes === detail.notes} className="mt-2">
                Salvar anotações
              </Button>
            </section>

            {ctx.canDelete ? (
              <section className="mt-auto border-t border-line pt-5">
                {confirmDel ? (
                  <div className="rounded-xl border border-danger/40 p-4 text-sm">
                    <p className="font-semibold text-danger">Apagar {detail.name.split(" ")[0]} de vez?</p>
                    <p className="mt-1 text-ink-2">
                      Some o cadastro, o currículo, as {detail.candidaturas.length} candidaturas, as entrevistas e a conversa guardada pelo atendimento automático.
                      Não dá para desfazer. Use quando o candidato pedir a exclusão dos dados.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="danger" onClick={remove} disabled={pending}>
                        {pending ? "Apagando..." : "Apagar de vez"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)} disabled={pending}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => setConfirmDel(true)}>
                    <Trash2 className="size-4" />
                    Apagar candidato e dados
                  </Button>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </dialog>
  );
}

function ChecklistDialog({ row, items, onClose, onSent }: { row: Row; items: string[]; onClose: () => void; onSent: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState(() => new Set(items));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const toggle = (item: string) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  const send = () =>
    start(async () => {
      setError(null);
      const r = await sendChecklist(
        row.id,
        items.filter((i) => checked.has(i)),
        note,
      );
      if ("error" in r) setError(r.error ?? "Não foi possível enviar.");
      else onSent();
    });

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="mx-auto mt-auto mb-0 w-full max-w-none max-h-[90dvh] overflow-y-auto rounded-t-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50 sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-card sm:w-[min(32rem,calc(100vw-2rem))]"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-tight">Enviar checklist</h2>
            <p className="mt-0.5 truncate text-sm text-muted">
              Para {row.name} pelo WhatsApp {row.phone}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 sm:size-8">
            <X className="size-4" />
          </button>
        </header>
        {error ? <FormMessage>{error}</FormMessage> : null}

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Documentos ({checked.size})</legend>
          {items.map((item) => (
            <label key={item} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
              <input type="checkbox" checked={checked.has(item)} onChange={() => toggle(item)} className="mt-0.5 size-4 accent-[var(--brand)]" />
              {item}
            </label>
          ))}
        </fieldset>

        <Field label="Observação" hint="Opcional. Ex.: prazo para enviar, data de início, endereço para entregar os originais.">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] hover:border-line-strong focus:border-ink focus:outline-none"
          />
        </Field>

        <p className="text-[13px] text-muted">
          Os documentos chegam direto no WhatsApp da empresa. O atendimento automático fica pausado nessa conversa.
        </p>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={pending || checked.size === 0}>
            {pending ? "Enviando..." : "Enviar pelo WhatsApp"}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}

function RejectDialog({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: (note: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="mx-auto mt-auto mb-0 w-full max-w-none max-h-[90dvh] overflow-y-auto rounded-t-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50 sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-card sm:w-[min(32rem,calc(100vw-2rem))]"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-semibold tracking-tight">Recusar {name.split(" ")[0]}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 sm:size-8">
            <X className="size-4" />
          </button>
        </header>
        <Field label="Retorno ao candidato" hint="Opcional. Vai junto com o aviso. O candidato é avisado no dia seguinte, não na hora.">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Ex.: buscamos mais experiência com atendimento. Seu currículo fica no nosso banco de talentos."
            className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] hover:border-line-strong focus:border-ink focus:outline-none"
          />
        </Field>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => onConfirm(note)}>
            Confirmar recusa
          </Button>
        </footer>
      </div>
    </dialog>
  );
}

function AddDialog({ vagas, onClose }: { vagas: VagaOption[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [state, formAction, saving] = useActionState(addCandidate, {} as FormState);
  const [uploading, startUpload] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);
  useEffect(() => {
    if (state.success) {
      router.refresh();
      onClose();
    }
  }, [state.success, router, onClose]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFileError(null);
    const data = new FormData(e.currentTarget);
    startUpload(async () => {
      if (file) {
        const prepared = await prepareResumeUpload({ name: file.name, size: file.size, type: file.type });
        if (!("path" in prepared) || !prepared.path || !prepared.token) {
          setFileError(("error" in prepared && prepared.error) || "Não foi possível enviar o currículo.");
          return;
        }
        const { error } = await getBrowserClient().storage.from("resumes").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type });
        if (error) {
          setFileError("O arquivo não subiu. Confira a internet e tente de novo.");
          return;
        }
        data.set("resumePath", prepared.path);
        data.set("resumeName", file.name.slice(0, 200));
      }
      startUpload(() => formAction(data));
    });
  }

  const busy = uploading || saving;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="mx-auto mt-auto mb-0 w-full max-w-none max-h-[90dvh] overflow-y-auto rounded-t-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50 sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-card sm:w-[min(34rem,calc(100vw-2rem))]"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
        <header className="flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">Adicionar candidato</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 sm:size-8">
            <X className="size-4" />
          </button>
        </header>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}

        <Field label="Vaga" error={state.fieldErrors?.vagaId}>
          <Select name="vagaId" defaultValue={vagas[0]?.id ?? ""} required>
            {vagas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
                {v.open ? "" : " (fechada)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome" error={state.fieldErrors?.name}>
          <Input name="name" maxLength={120} required autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="WhatsApp" hint="Opcional" error={state.fieldErrors?.phone}>
            <Input name="phone" inputMode="tel" maxLength={20} placeholder="(11) 99999 0000" />
          </Field>
          <Field label="Cidade" hint="Opcional" error={state.fieldErrors?.city}>
            <Input name="city" maxLength={120} />
          </Field>
        </div>
        <Field label="E-mail" hint="Opcional" error={state.fieldErrors?.email}>
          <Input name="email" type="email" maxLength={254} />
        </Field>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 p-5 text-center hover:border-ink">
          <Paperclip className="size-5 text-muted" />
          <span className="text-sm font-medium">{file ? file.name : "Anexar currículo (opcional)"}</span>
          <span className="text-xs text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "PDF, Word, JPG ou PNG, até 10 MB"}</span>
          <input
            type="file"
            accept={RESUME_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFileError(null);
              if (f && f.size > RESUME_MAX) return setFileError("O arquivo precisa ter até 10 MB.");
              setFile(f);
            }}
          />
        </label>
        {fileError ? <p className="-mt-2 text-[13px] text-danger">{fileError}</p> : null}

        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {uploading ? "Enviando..." : saving ? "Salvando..." : "Adicionar"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
