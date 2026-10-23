"use client";

import { Briefcase, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, FormMessage, Input } from "@/components/ui/field";
import type { FormState } from "@/lib/validation";
import { createVaga, deleteVaga, setVagaStatus, updateVaga } from "./actions";

export type Vaga = {
  id: string;
  title: string;
  location: string | null;
  description: string | null;
  criteria: string | null;
  status: "open" | "closed";
  candidateCount: number;
};

export function VagasBoard({ vagas }: { vagas: Vaga[] }) {
  const [editing, setEditing] = useState<Vaga | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted">Recrutamento</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Vagas</h1>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Nova vaga
        </Button>
      </header>

      {vagas.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Briefcase className="size-8 text-muted" />
          <p className="font-medium">Nenhuma vaga ainda</p>
          <p className="max-w-sm text-sm text-muted">Crie a primeira vaga. É por ela que os candidatos entram e são pontuados.</p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {vagas.map((vaga) => (
            <VagaCard key={vaga.id} vaga={vaga} onEdit={() => setEditing(vaga)} />
          ))}
        </ul>
      )}

      {creating ? <VagaDialog onClose={() => setCreating(false)} /> : null}
      {editing ? <VagaDialog vaga={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function VagaCard({ vaga, onEdit }: { vaga: Vaga; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = () =>
    start(async () => {
      const r = await setVagaStatus(vaga.id, vaga.status === "open" ? "closed" : "open");
      setError("error" in r ? r.error : null);
      if (!("error" in r)) router.refresh();
    });
  const remove = () =>
    start(async () => {
      const r = await deleteVaga(vaga.id);
      if ("error" in r) {
        setError(r.error);
        setConfirmDel(false);
      } else router.refresh();
    });

  return (
    <li>
      <Card className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-semibold">{vaga.title}</h2>
            {vaga.location ? <p className="truncate text-sm text-muted">{vaga.location}</p> : null}
          </div>
          <Badge tone={vaga.status === "open" ? "brand" : "neutral"}>{vaga.status === "open" ? "Aberta" : "Fechada"}</Badge>
        </div>

        {vaga.description ? <p className="line-clamp-2 text-sm text-ink-2">{vaga.description}</p> : null}

        <p className="text-sm text-muted">
          {vaga.candidateCount} {vaga.candidateCount === 1 ? "candidato" : "candidatos"}
        </p>

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line pt-3">
          <Button size="sm" variant="ghost" onClick={onEdit} disabled={pending}>
            <Pencil className="size-3.5" />
            Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={toggle} disabled={pending}>
            {vaga.status === "open" ? "Fechar" : "Reabrir"}
          </Button>
          {confirmDel ? (
            <span className="flex items-center gap-1.5">
              <Button size="sm" variant="danger" onClick={remove} disabled={pending}>
                Confirmar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
                Cancelar
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDel(true)} disabled={pending} aria-label="Apagar vaga">
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </Card>
    </li>
  );
}

function VagaDialog({ vaga, onClose }: { vaga?: Vaga; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const action = vaga ? updateVaga.bind(null, vaga.id) : createVaga;
  const [state, formAction, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const r = await action(prev, data);
    if (r.success) {
      router.refresh();
      onClose();
    }
    return r;
  }, {} as FormState);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
    >
      <form action={formAction} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
        <header className="flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">{vaga ? "Editar vaga" : "Nova vaga"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </header>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}

        <Field label="Nome da vaga" error={state.fieldErrors?.title}>
          <Input name="title" defaultValue={vaga?.title} maxLength={120} placeholder="Ex.: Corretor de imóveis" required autoFocus />
        </Field>
        <Field label="Local" hint="Opcional" error={state.fieldErrors?.location}>
          <Input name="location" defaultValue={vaga?.location ?? ""} maxLength={120} placeholder="Cidade, bairro ou remoto" />
        </Field>
        <Field label="Descrição" hint="Opcional" error={state.fieldErrors?.description}>
          <textarea
            name="description"
            defaultValue={vaga?.description ?? ""}
            rows={3}
            maxLength={4000}
            className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] hover:border-line-strong focus:border-ink focus:outline-none"
          />
        </Field>
        <Field label="Critérios para ranquear" hint="O que conta para esta vaga, usado na nota do candidato" error={state.fieldErrors?.criteria}>
          <textarea
            name="criteria"
            defaultValue={vaga?.criteria ?? ""}
            rows={3}
            maxLength={2000}
            placeholder="Ex.: experiência em vendas, CNH, disponibilidade comercial..."
            className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] hover:border-line-strong focus:border-ink focus:outline-none"
          />
        </Field>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : vaga ? "Salvar" : "Criar vaga"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
