"use client";

import clsx from "clsx";
import { Check, Copy, Download, ExternalLink, FileCheck2, FileText, Loader2, MessageCircle, Paperclip, Plus, Search, Settings2, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { INVOICE_FILE_TYPES, INVOICE_MAX_BYTES, INVOICE_STATUS, NEXT_STATUS, type Invoice, type InvoiceStatus } from "@/lib/invoices";
import { formatMoney } from "@/lib/metrics";
import { centsToInput, maskMoneyInput } from "@/lib/money";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/time";
import type { FormState } from "@/lib/validation";
import { createInvoice, deleteInvoice, invoiceFileLink, prepareInvoiceUpload, setInvoiceStatus } from "./actions";
import { cancelIssuedInvoice, syncInvoiceNow } from "./fiscal-actions";
import { FiscalProfileDialog, IssueDialog, type ProfileView } from "./fiscal";

type Commission = { id: string; amountCents: number; receivedOn: string; description: string | null };
type Tomador = { cnpj: string; name: string; serviceCode: string };

// Portal oficial e gratuito da NFS-e Nacional, onde o MEI emite com a conta gov.br.
const EMISSOR_NACIONAL_URL = "https://www.nfse.gov.br/EmissorNacional";

const STATUS_FILTERS: ("all" | InvoiceStatus)[] = ["all", "sent", "checked", "paid", "rejected", "error", "canceled"];

type Issuing = { enabled: boolean; orgReady: boolean; isOwner: boolean; profile: ProfileView | null };
const NEXT_LABEL: Partial<Record<InvoiceStatus, string>> = { sent: "Marcar como conferida", checked: "Marcar como paga" };

const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T12:00:00Z`));

export function InvoiceBoard({
  isBroker,
  invoices,
  names,
  brokers,
  commissions,
  openWithCommission,
  ownerWhatsapp,
  today,
  issuing,
  tomador,
}: {
  issuing: Issuing;
  isBroker: boolean;
  invoices: Invoice[];
  names: Record<string, string>;
  brokers: { id: string; name: string }[];
  commissions: Commission[];
  openWithCommission: string | null;
  ownerWhatsapp: string | null;
  today: string;
  tomador: Tomador | null;
}) {
  const router = useRouter();
  const profileActive = issuing.profile?.status === "active";
  const canIssue = isBroker && issuing.enabled && issuing.orgReady;
  const [issuingOpen, setIssuingOpen] = useState<boolean>(Boolean(openWithCommission) && canIssue && profileActive);
  const [guided, setGuided] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");
  const [broker, setBroker] = useState("all");
  const [month, setMonth] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<boolean>(Boolean(openWithCommission) && !(canIssue && profileActive));

  const months = useMemo(() => [...new Set(invoices.map((i) => i.issued_on.slice(0, 7)))].sort().reverse(), [invoices]);
  const q = query.trim().toLowerCase();
  const scoped = invoices.filter(
    (i) =>
      (broker === "all" || i.member_id === broker) &&
      (month === "all" || i.issued_on.startsWith(month)) &&
      (!q || i.number.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)),
  );
  const visible = scoped.filter((i) => status === "all" || i.status === status);
  const summary = (s: InvoiceStatus) => {
    const list = scoped.filter((i) => i.status === s);
    return { count: list.length, total: list.reduce((sum, i) => sum + i.amount_cents, 0) };
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted">{isBroker ? "Suas notas e pagamentos" : "Notas da equipe, da emissão ao pagamento"}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Notas fiscais</h1>
        </div>
        {isBroker ? (
          <div className="flex flex-wrap gap-2">
            {tomador ? (
              <Button onClick={() => setChoosing(true)}>
                <Plus className="size-4" />
                Emitir nota
              </Button>
            ) : null}
            <Button variant={tomador ? "secondary" : "primary"} onClick={() => setCreating(true)}>
              <Upload className="size-4" />
              Enviar nota pronta
            </Button>
          </div>
        ) : null}
      </header>

      {isBroker && canIssue ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <span className="flex items-center gap-3 text-sm">
            <FileCheck2 className={clsx("size-5 shrink-0", profileActive ? "text-brand-text" : "text-muted")} />
            {profileActive && issuing.profile ? (
              <span>
                <span className="font-medium">Emissão ativa</span> no CNPJ de {issuing.profile.legal_name}
                {issuing.profile.certificate_valid_until
                  ? `, certificado até ${formatDate(issuing.profile.certificate_valid_until.slice(0, 10))}`
                  : ""}
              </span>
            ) : issuing.profile?.status === "error" ? (
              <span className="text-danger">Cadastro fiscal recusado: {issuing.profile.last_error}</span>
            ) : (
              <span>Para emitir notas pelo Pulse, cadastre seus dados fiscais e o certificado digital (uma vez só).</span>
            )}
          </span>
          <Button size="sm" variant="secondary" onClick={() => setProfileOpen(true)}>
            <Settings2 className="size-4" />
            {issuing.profile ? "Dados fiscais" : "Cadastrar dados fiscais"}
          </Button>
        </div>
      ) : null}

      {issuing.enabled && !issuing.orgReady ? (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          {issuing.isOwner ? (
            <>
              Para os corretores emitirem notas pelo Pulse, cadastre os dados fiscais da imobiliária em{" "}
              <Link href="/conta?aba=imobiliaria" className="font-semibold underline underline-offset-4">
                Conta, aba Imobiliária
              </Link>
              .
            </>
          ) : (
            "A emissão de notas pelo Pulse fica disponível quando o administrador cadastrar os dados fiscais da imobiliária. Por enquanto, envie a nota pronta."
          )}
        </p>
      ) : null}

      {/* Resumo por situação: tocar filtra a lista. */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["sent", "checked", "paid", "rejected"] as InvoiceStatus[]).map((s) => {
          const { count, total } = summary(s);
          const active = status === s;
          return (
            <button
              key={s}
              onClick={() => setStatus(active ? "all" : s)}
              aria-pressed={active}
              className={clsx(
                "rounded-2xl border p-4 text-left transition-colors",
                active ? "border-brand-text bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <Badge tone={INVOICE_STATUS[s].tone}>{INVOICE_STATUS[s].label}</Badge>
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{count}</p>
              <p className="text-[13px] text-muted tabular-nums">{formatMoney(total)}</p>
            </button>
          );
        })}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:max-w-xs">
          <span className="sr-only">Buscar nota</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por número ou descrição"
            className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-ink"
          />
        </label>
        {!isBroker && brokers.length > 0 ? (
          <select value={broker} onChange={(e) => setBroker(e.target.value)} aria-label="Corretor" className="h-10 rounded-xl border border-line bg-surface px-3 text-sm">
            <option value="all">Todos os corretores</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : null}
        {months.length > 1 ? (
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês" className="h-10 rounded-xl border border-line bg-surface px-3 text-sm capitalize">
            <option value="all">Todos os meses</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        ) : null}
        <div role="tablist" aria-label="Situação" className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={clsx(
                "h-8 shrink-0 rounded-lg px-3 text-[13px] font-medium transition-colors",
                status === s ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
              )}
            >
              {s === "all" ? "Todas" : INVOICE_STATUS[s].label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <FileText className="size-8 text-muted" />
            <p className="font-medium">{invoices.length === 0 ? "Nenhuma nota ainda" : "Nenhuma nota com esses filtros"}</p>
            <p className="max-w-sm text-sm text-muted">
              {invoices.length === 0
                ? isBroker
                  ? "Emita a nota no portal da sua prefeitura e envie aqui. A liderança é avisada na hora."
                  : "Quando um corretor enviar uma nota, ela aparece aqui e você recebe um aviso."
                : "Tente outra situação, outro corretor ou outro mês."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                brokerName={names[invoice.member_id] ?? "Corretor"}
                isBroker={isBroker}
                ownerWhatsapp={ownerWhatsapp}
              />
            ))}
          </ul>
        )}
      </Card>

      {choosing ? (
        <MethodChooser
          onHasCertificate={() => {
            setChoosing(false);
            if (canIssue && profileActive) setIssuingOpen(true);
            else setProfileOpen(true);
          }}
          onNoCertificate={() => {
            setChoosing(false);
            setGuided(true);
          }}
          onClose={() => setChoosing(false)}
        />
      ) : null}
      {profileOpen ? <FiscalProfileDialog profile={issuing.profile} onClose={() => setProfileOpen(false)} /> : null}
      {issuingOpen ? (
        <IssueDialog
          commissions={commissions}
          initialCommission={openWithCommission}
          today={today}
          onIssued={() => router.refresh()}
          onClose={() => setIssuingOpen(false)}
        />
      ) : null}
      {creating || guided ? (
        <InvoiceDialog
          commissions={commissions}
          initialCommission={openWithCommission}
          today={today}
          guidance={guided ? tomador : null}
          onClose={() => {
            setCreating(false);
            setGuided(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** Pergunta antes de emitir: quem tem certificado emite num clique; quem não tem vai para o portal grátis. */
function MethodChooser({ onHasCertificate, onNoCertificate, onClose }: { onHasCertificate: () => void; onNoCertificate: () => void; onClose: () => void }) {
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
      className="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Emitir nota fiscal</h2>
            <p className="text-sm text-muted">Para emitir, você precisa de um certificado digital A1. Você já tem?</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </header>

        <button
          type="button"
          onClick={onNoCertificate}
          className="flex flex-col items-start gap-1 rounded-xl border border-line bg-surface-2 p-4 text-left transition-colors hover:border-ink"
        >
          <span className="flex items-center gap-2 font-medium">
            Não tenho certificado
            <Badge tone="brand">Grátis</Badge>
          </span>
          <span className="text-sm text-muted">Emita no portal do governo com a sua conta gov.br. Indicado para MEI. O Pulse te guia e organiza a nota.</span>
        </button>

        <button
          type="button"
          onClick={onHasCertificate}
          className="flex flex-col items-start gap-1 rounded-xl border border-line bg-surface-2 p-4 text-left transition-colors hover:border-ink"
        >
          <span className="font-medium">Já tenho o certificado A1</span>
          <span className="text-sm text-muted">Cadastre uma vez e emita aqui em um clique, sem sair do Pulse.</span>
        </button>
      </div>
    </dialog>
  );
}

/** Campo com botão de copiar, para o corretor colar os dados no portal do governo. */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2">
      <span className="min-w-0">
        <span className="block text-[11px] text-muted">{label}</span>
        <span className="block truncate text-sm font-medium tabular-nums">{value}</span>
      </span>
      <button
        type="button"
        aria-label={`Copiar ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Alguns navegadores bloqueiam a cópia: a pessoa seleciona na mão.
          }
        }}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2"
      >
        {copied ? <Check className="size-4 text-brand-text" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

function InvoiceRow({
  invoice,
  brokerName,
  isBroker,
  ownerWhatsapp,
}: {
  invoice: Invoice;
  brokerName: string;
  isBroker: boolean;
  ownerWhatsapp: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const status = INVOICE_STATUS[invoice.status];
  const next = NEXT_STATUS[invoice.status];
  const issued = invoice.source !== "upload";
  const [canceling, setCanceling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Nota na fila (sistema da NFS-e fora do ar): confere de tempos em tempos
  // se a rotina de reenvio já conseguiu a autorização.
  useEffect(() => {
    if (invoice.status !== "processing") return;
    let tries = 0;
    let stopped = false;
    const tick = async () => {
      if (stopped || tries++ > 20) return;
      const { status } = await syncInvoiceNow(invoice.id);
      if (stopped) return;
      if (status !== "processing") router.refresh();
      else timer = setTimeout(tick, 30_000);
    };
    let timer = setTimeout(tick, 30_000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [invoice.id, invoice.status, router]);

  function run(task: () => Promise<{ error?: string } | { ok: boolean }>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if ("error" in result && result.error) setError(result.error);
      else router.refresh();
    });
  }

  async function open(purpose: "download" | "share") {
    // Abre a aba antes de esperar o link: o navegador bloqueia abas abertas
    // depois. Sem "noopener" aqui (ele faria open() devolver null); o vínculo
    // com esta página é cortado logo em seguida.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    const result = await invoiceFileLink(invoice.id, purpose);
    if (!result.url) {
      tab?.close();
      setError(result.error ?? "Não foi possível abrir o arquivo.");
      return;
    }
    if (purpose === "download") {
      if (tab) tab.location.href = result.url;
      return;
    }
    const text = [
      `Nota fiscal nº ${invoice.number}${isBroker ? "" : ` de ${brokerName}`}`,
      `Valor: ${formatMoney(invoice.amount_cents)}`,
      `Referente a: ${invoice.description}`,
      `Emitida em ${formatDate(invoice.issued_on)}`,
      `Arquivo: ${result.url}`,
    ].join("\n");
    const phone = isBroker && ownerWhatsapp ? (ownerWhatsapp.length <= 11 ? `55${ownerWhatsapp}` : ownerWhatsapp) : "";
    const wa = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    if (tab) tab.location.href = wa;
  }

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{invoice.status === "processing" || invoice.status === "error" ? "Nota fiscal" : `Nota nº ${invoice.number}`}</span>
            <Badge tone={status.tone}>
              {invoice.status === "processing" ? <Loader2 className="size-3 animate-spin" /> : null}
              {status.label}
            </Badge>
            {issued ? <Badge>Emitida pelo Pulse</Badge> : null}
            {invoice.commission_id ? <Badge>Comissão</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-ink-2">{invoice.description}</p>
          <p className="mt-0.5 text-xs text-muted">
            {isBroker ? "" : `${brokerName}, `}emitida em {formatDate(invoice.issued_on)}
            {invoice.paid_at ? `, paga em ${formatDate(invoice.paid_at.slice(0, 10))}` : ""}
          </p>
          {invoice.notes ? <p className="mt-1 text-xs text-muted">Obs.: {invoice.notes}</p> : null}
          {invoice.status === "error" && invoice.issue_error ? (
            <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">Motivo: {invoice.issue_error}</p>
          ) : null}
          {invoice.status === "canceled" && invoice.review_note ? (
            <p className="mt-1 text-xs text-muted">Cancelada: {invoice.review_note}</p>
          ) : null}
          {invoice.status === "rejected" && invoice.review_note ? (
            <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">Motivo da recusa: {invoice.review_note}</p>
          ) : null}
        </div>
        <span className="font-display text-xl font-semibold tabular-nums">{formatMoney(invoice.amount_cents)}</span>
      </div>

      {error ? <p className="text-[13px] text-danger">{error}</p> : null}

      {canceling ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Motivo do cancelamento (aparece na prefeitura)" maxLength={255} autoFocus />
          <div className="flex gap-2">
            <Button variant="danger" disabled={pending || cancelReason.trim().length < 15} onClick={() => run(() => cancelIssuedInvoice(invoice.id, cancelReason))}>
              Cancelar nota
            </Button>
            <Button variant="ghost" onClick={() => setCanceling(false)}>
              Voltar
            </Button>
          </div>
        </div>
      ) : invoice.status === "processing" ? (
        <p className="text-[13px] text-muted">Aguardando a autorização. A página atualiza sozinha.</p>
      ) : invoice.status === "error" ? (
        isBroker ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteInvoice(invoice.id))}>
              <Trash2 className="size-4" />
              Remover da lista
            </Button>
          </div>
        ) : null
      ) : rejecting ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo: valor errado, falta CNPJ, outro mês..." maxLength={300} autoFocus />
          <div className="flex gap-2">
            <Button variant="danger" disabled={pending || reason.trim().length < 3} onClick={() => run(() => setInvoiceStatus(invoice.id, "rejected", reason))}>
              Recusar nota
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => open("download")}>
            <Download className="size-4" />
            {issued ? "Ver nota" : "Ver arquivo"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => open("share")}>
            <MessageCircle className="size-4" />
            Enviar por WhatsApp
          </Button>
          {!isBroker && next ? (
            <Button size="sm" disabled={pending} onClick={() => run(() => setInvoiceStatus(invoice.id, next))}>
              {NEXT_LABEL[invoice.status]}
            </Button>
          ) : null}
          {!isBroker && ["sent", "checked"].includes(invoice.status) ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(true)}>
              Recusar
            </Button>
          ) : null}
          {!isBroker && invoice.status === "paid" ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setInvoiceStatus(invoice.id, "checked"))}>
              Desfazer pagamento
            </Button>
          ) : null}
          {isBroker && issued && ["sent", "checked", "rejected"].includes(invoice.status) ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setCanceling(true)}>
              Cancelar nota
            </Button>
          ) : null}
          {isBroker && !issued && (invoice.status === "sent" || invoice.status === "rejected") ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteInvoice(invoice.id))}>
              <Trash2 className="size-4" />
              Excluir
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
}

function InvoiceDialog({
  commissions,
  initialCommission,
  today,
  guidance,
  onClose,
}: {
  commissions: Commission[];
  initialCommission: string | null;
  today: string;
  guidance: Tomador | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initial = commissions.find((c) => c.id === initialCommission) ?? null;
  const [state, formAction, saving] = useActionState(createInvoice, {} as FormState);
  const [uploading, startUpload] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [commissionId, setCommissionId] = useState(initial?.id ?? "");
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amountCents) : "");
  const [description, setDescription] = useState(initial ? (initial.description ? `Comissão: ${initial.description}` : "Comissão") : "");

  // Mesmo cuidado da ficha do cliente: sem close() na limpeza do efeito.
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);
  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  function pickCommission(id: string) {
    setCommissionId(id);
    const c = commissions.find((x) => x.id === id);
    if (c) {
      setAmount(centsToInput(c.amountCents));
      setDescription(c.description ? `Comissão: ${c.description}` : "Comissão");
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFileError(null);
    if (!file) return setFileError("Anexe o arquivo da nota.");
    const data = new FormData(e.currentTarget);
    startUpload(async () => {
      const prepared = await prepareInvoiceUpload({ name: file.name, size: file.size, type: file.type });
      if (!("path" in prepared) || !prepared.path || !prepared.token) {
        setFileError(("error" in prepared && prepared.error) || "Não foi possível enviar o arquivo.");
        return;
      }
      const { error } = await getBrowserClient().storage.from("invoices").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type });
      if (error) {
        setFileError("O arquivo não subiu. Confira a internet e tente de novo.");
        return;
      }
      data.set("filePath", prepared.path);
      data.set("fileName", file.name.slice(0, 200));
      // Depois de um await, o React precisa de uma nova transição para a ação.
      startUpload(() => formAction(data));
    });
  }

  const busy = uploading || saving;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">{guidance ? "Emitir no portal do governo" : "Enviar nota fiscal"}</h2>
            <p className="text-sm text-muted">
              {guidance
                ? "Grátis, sem certificado. Emita no Emissor Nacional com a sua conta gov.br e traga a nota para cá."
                : "Emita no portal da prefeitura e anexe aqui. A liderança é avisada na hora."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </header>

        {state.error ? <FormMessage>{state.error}</FormMessage> : null}

        {guidance ? (
          <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
            <div className="flex items-start gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-text">1</span>
              <p className="text-sm">
                Abra o Emissor Nacional e entre com a sua conta <strong>gov.br</strong>. Como MEI, você não precisa de certificado.
              </p>
            </div>
            <a
              href={EMISSOR_NACIONAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink hover:opacity-90"
            >
              <ExternalLink className="size-4" />
              Abrir Emissor Nacional
            </a>
            <div className="flex items-start gap-2 pt-1">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-text">2</span>
              <p className="text-sm">
                No portal, informe o <strong>tomador</strong> com estes dados (toque para copiar) e o valor e a descrição do serviço:
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <CopyField label="CNPJ do tomador" value={guidance.cnpj} />
              <CopyField label="Razão social" value={guidance.name} />
              <CopyField label="Código do serviço" value={guidance.serviceCode} />
            </div>
            <div className="flex items-start gap-2 pt-1">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-text">3</span>
              <p className="text-sm">
                Emita e baixe a nota. Depois, traga o arquivo (de preferência o <strong>XML</strong>) e os dados abaixo.
              </p>
            </div>
          </div>
        ) : null}

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 p-5 text-center hover:border-ink">
          <Paperclip className="size-5 text-muted" />
          <span className="text-sm font-medium">{file ? file.name : "Anexar a nota (PDF, XML, JPG ou PNG)"}</span>
          <span className="text-xs text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "Até 5 MB"}</span>
          <input
            type="file"
            accept={Object.keys(INVOICE_FILE_TYPES).join(",")}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFileError(null);
              if (f && !INVOICE_FILE_TYPES[f.type]) return setFileError("Envie a nota em PDF, XML, JPG ou PNG.");
              if (f && f.size > INVOICE_MAX_BYTES) return setFileError("O arquivo precisa ter até 5 MB.");
              setFile(f);
            }}
          />
        </label>
        {fileError || state.fieldErrors?.filePath ? <p className="-mt-2 text-[13px] text-danger">{fileError ?? state.fieldErrors?.filePath}</p> : null}

        {commissions.length > 0 ? (
          <Field label="Ligar a uma comissão" hint="Opcional. Preenche o valor e a descrição." error={state.fieldErrors?.commissionId}>
            <Select name="commissionId" value={commissionId} onChange={(e) => pickCommission(e.target.value)}>
              <option value="">Nenhuma, é outro valor</option>
              {commissions.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatDate(c.receivedOn)}, {formatMoney(c.amountCents)}
                  {c.description ? `, ${c.description}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Número da nota" error={state.fieldErrors?.number}>
            <Input name="number" required maxLength={40} inputMode="numeric" />
          </Field>
          <Field label="Data de emissão" error={state.fieldErrors?.issuedOn}>
            <Input name="issuedOn" type="date" defaultValue={today} max={today} required />
          </Field>
          <Field label="Valor" error={state.fieldErrors?.amount}>
            <span className="relative block">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-muted">R$</span>
              <Input name="amount" value={amount} onChange={(e) => setAmount(maskMoneyInput(e.target.value))} inputMode="decimal" placeholder="5.000" className="pl-11" required />
            </span>
          </Field>
          <Field label="Referente a" error={state.fieldErrors?.description}>
            <Input name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Comissão, valor mensal, serviço..." required />
          </Field>
        </div>
        <Field label="Observação" hint="Opcional" error={state.fieldErrors?.notes}>
          <Input name="notes" maxLength={500} />
        </Field>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {uploading ? "Enviando arquivo..." : saving ? "Registrando..." : "Enviar nota"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
