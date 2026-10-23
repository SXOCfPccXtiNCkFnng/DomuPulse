"use client";

import { CalendarPlus, MessageCircle, Phone, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { CLIENT_COLUMNS, SOURCES, STAGES, whatsappLink, type Client, type Stage } from "@/lib/clients";
import type { LiveMember } from "@/lib/live/use-live-day";
import { centsToInput, maskMoneyInput, parseMoney } from "@/lib/money";
import { formatPhoneBR } from "@/lib/phone";
import { getBrowserClient } from "@/lib/supabase/client";
import { todayIn, zonedToIso } from "@/lib/time";

const EARLY: Stage[] = ["lead", "talking"];
// Agendar visita só faz sentido antes de o cliente visitar.
const CAN_SCHEDULE: Stage[] = ["lead", "talking", "scheduled"];

export function ClientDialog({
  client,
  brokers,
  readOnly = false,
  selfId,
  timezone,
  onClose,
  onSaved,
  onDeleted,
}: {
  client: Client | null;
  brokers: LiveMember[] | null;
  /** Liderança vendo a carteira de um corretor: abre só para leitura. */
  readOnly?: boolean;
  selfId: string;
  timezone: string;
  onClose: () => void;
  onSaved: (client: Client) => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({
    name: client?.name ?? "",
    phone: formatPhoneBR(client?.phone ?? ""),
    email: client?.email ?? "",
    source: client?.source ?? "",
    interest: client?.interest ?? "",
    value: centsToInput(client?.value_cents ?? null),
    notes: client?.notes ?? "",
    stage: (client?.stage ?? "lead") as Stage,
    lostReason: client?.lost_reason ?? "",
    memberId: client?.member_id ?? (brokers?.[0]?.id ?? selfId),
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [visit, setVisit] = useState({ date: todayIn(timezone), time: "", message: "" });

  // <dialog> nativo: foco preso dentro, Esc fecha, leitores de tela entendem.
  // Sem close() na limpeza: o React (modo estrito) desmonta e remonta o efeito,
  // e o close() disparava onClose, fechando a janela logo depois de abrir. Ao
  // sair da tela, o navegador já tira o <dialog> da camada de cima sozinho.
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!form.name.trim()) return setError("Informe o nome do cliente.");
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits && phoneDigits.length < 10) return setError("Telefone incompleto: inclua o DDD.");
    setPending(true);
    setError(null);

    const row = {
      member_id: form.memberId,
      name: form.name.trim().slice(0, 120),
      phone: phoneDigits ? form.phone : null,
      email: form.email.trim() || null,
      source: form.source || null,
      interest: form.interest.trim().slice(0, 200) || null,
      value_cents: parseMoney(form.value),
      notes: form.notes.trim().slice(0, 2000) || null,
      stage: form.stage,
      lost_reason: form.stage === "lost" ? form.lostReason.trim().slice(0, 200) || null : null,
    };

    const query = client
      ? supabase.from("clients").update(row).eq("id", client.id).select(CLIENT_COLUMNS).single<Client>()
      : supabase.from("clients").insert(row).select(CLIENT_COLUMNS).single<Client>();
    const { data, error } = await query;
    setPending(false);
    if (error || !data) {
      return setError(error?.code === "23514" ? "Confira o telefone e o e-mail." : "Não foi possível salvar. Verifique a assinatura ou tente de novo.");
    }
    onSaved(data);
    onClose();
  }

  async function remove() {
    if (!client) return;
    setPending(true);
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    setPending(false);
    if (error) return setError("Não foi possível excluir.");
    onDeleted(client.id);
    onClose();
  }

  async function scheduleVisit() {
    if (!client || !visit.date || !visit.time) return setVisit((v) => ({ ...v, message: "Escolha data e horário." }));
    setPending(true);
    const { error } = await supabase.from("appointments").insert({
      member_id: client.member_id,
      client_id: client.id,
      client_name: client.name,
      client_phone: client.phone,
      scheduled_at: zonedToIso(visit.date, visit.time, timezone),
    });
    // Cliente no começo do funil avança para "Visita agendada".
    if (!error && EARLY.includes(client.stage)) {
      const { data } = await supabase.from("clients").update({ stage: "scheduled" }).eq("id", client.id).select(CLIENT_COLUMNS).single<Client>();
      if (data) {
        onSaved(data);
        set("stage", "scheduled");
      }
    }
    setPending(false);
    setVisit((v) => ({ ...v, time: "", message: error ? "Não foi possível agendar." : "Visita agendada. Ela já aparece na Agenda." }));
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
    >
      <form onSubmit={save} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
        <header className="flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">{client ? client.name : "Novo cliente"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </header>

        {client?.phone ? (
          <div className="flex flex-wrap gap-2">
            <a href={whatsappLink(client.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm font-medium hover:bg-surface-3">
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
            <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex h-9 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm font-medium hover:bg-surface-3">
              <Phone className="size-4" />
              Ligar
            </a>
          </div>
        ) : null}

        {error ? <FormMessage>{error}</FormMessage> : null}

        {/* Liderança só lê: os campos ficam travados (o banco também recusa). */}
        <fieldset disabled={readOnly} className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2">
          <Field label="Nome" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} autoFocus={!client} />
          </Field>
          <Field label="Telefone">
            <Input value={form.phone} onChange={(e) => set("phone", formatPhoneBR(e.target.value))} inputMode="tel" placeholder="(11) 99999 0000" />
          </Field>
          <Field label="E-mail">
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" inputMode="email" maxLength={254} />
          </Field>
          <Field label="Origem">
            <Select value={form.source} onChange={(e) => set("source", e.target.value)}>
              <option value="">Não informada</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Etapa">
            <Select value={form.stage} onChange={(e) => set("stage", e.target.value as Stage)}>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Interesse" hint="Imóvel, bairro, tipo" className="sm:col-span-2">
            <Input value={form.interest} onChange={(e) => set("interest", e.target.value)} maxLength={200} placeholder="Apartamento 2 quartos no Centro" />
          </Field>
          <Field label="Valor do negócio">
            <span className="relative block">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-muted">R$</span>
              <Input
                value={form.value}
                onChange={(e) => set("value", maskMoneyInput(e.target.value))}
                inputMode="decimal"
                placeholder="450.000"
                className="pl-11"
              />
            </span>
          </Field>
          {brokers ? (
            <Field label="Corretor responsável">
              <Select value={form.memberId} onChange={(e) => set("memberId", e.target.value)}>
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.full_name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {form.stage === "lost" ? (
            <Field label="Motivo da perda" className="sm:col-span-2">
              <Input value={form.lostReason} onChange={(e) => set("lostReason", e.target.value)} maxLength={200} placeholder="Comprou com outra empresa, desistiu, sem crédito..." />
            </Field>
          ) : null}
          <Field label="Anotações" className="sm:col-span-2">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] outline-none hover:border-line-strong focus:border-ink"
            />
          </Field>
        </fieldset>

        {client && !readOnly && CAN_SCHEDULE.includes(form.stage) ? (
          <fieldset className="rounded-xl bg-surface-2 p-4">
            <legend className="sr-only">Agendar visita</legend>
            <p className="flex items-center gap-2 text-sm font-medium">
              <CalendarPlus className="size-4" />
              Agendar visita
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Input type="date" value={visit.date} min={todayIn(timezone)} onChange={(e) => setVisit((v) => ({ ...v, date: e.target.value }))} className="h-10 w-auto" aria-label="Data da visita" />
              <Input type="time" value={visit.time} step={900} onChange={(e) => setVisit((v) => ({ ...v, time: e.target.value }))} className="h-10 w-auto" aria-label="Horário da visita" />
              <Button size="md" variant="secondary" onClick={scheduleVisit} disabled={pending}>
                Agendar
              </Button>
            </div>
            {visit.message ? <p className="mt-2 text-xs text-ink-2">{visit.message}</p> : null}
          </fieldset>
        ) : null}

        {readOnly ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-muted">Só o corretor responsável altera este cliente.</p>
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </footer>
        ) : (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            {client ? (
              confirmDelete ? (
                <span className="flex gap-2">
                  <Button size="sm" variant="danger" onClick={remove} disabled={pending}>
                    Confirmar exclusão
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                  Excluir cliente
                </Button>
              )
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : client ? "Salvar" : "Cadastrar cliente"}
            </Button>
          </footer>
        )}
      </form>
    </dialog>
  );
}
