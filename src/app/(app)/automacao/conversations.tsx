"use client";

import clsx from "clsx";
import { MessageCircle, Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { setBotPaused } from "./actions";

export type Conversation = {
  id: string;
  phone: string;
  name: string;
  stage: "awaiting_vaga" | "awaiting_resume" | "done" | "human";
  vagaTitle: string | null;
  updatedAt: string;
};

const STAGE: Record<Conversation["stage"], { label: string; tone: "neutral" | "brand" | "warn" }> = {
  awaiting_vaga: { label: "Escolhendo a vaga", tone: "neutral" },
  awaiting_resume: { label: "Aguardando currículo", tone: "neutral" },
  done: { label: "Currículo recebido", tone: "brand" },
  human: { label: "Com a equipe", tone: "warn" },
};

const formatPhone = (p: string) => (p.length === 13 ? `(${p.slice(2, 4)}) ${p.slice(4, 9)}-${p.slice(9)}` : p);

export function ConversationsList({ conversations }: { conversations: Conversation[] }) {
  const [filter, setFilter] = useState<"all" | "human">("all");
  const visible = filter === "all" ? conversations : conversations.filter((c) => c.stage === "human");
  const paused = conversations.filter((c) => c.stage === "human").length;

  return (
    <div className="flex flex-col">
      <div role="tablist" aria-label="Filtro" className="mx-5 mt-1 mb-3 flex w-fit gap-1 rounded-xl bg-surface-2 p-1 sm:mx-6">
        {(
          [
            ["all", `Todas (${conversations.length})`],
            ["human", `Com a equipe (${paused})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={clsx("h-8 rounded-lg px-3 text-[13px] font-medium transition-colors", filter === id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="px-5 pb-8 pt-4 text-center text-sm text-muted sm:px-6">
          {conversations.length === 0 ? "Nenhuma conversa no WhatsApp ainda." : "Nenhuma conversa com a equipe agora."}
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {visible.map((c) => (
            <ConversationRow key={c.id} conv={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ConversationRow({ conv }: { conv: Conversation }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isPaused = conv.stage === "human";

  const toggle = () =>
    start(async () => {
      setError(null);
      const r = await setBotPaused(conv.id, !isPaused);
      if ("error" in r) setError(r.error ?? "Não foi possível atualizar.");
      else router.refresh();
    });

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{conv.name}</span>
        <span className="block truncate text-xs text-muted">
          {formatPhone(conv.phone)}
          {conv.vagaTitle ? ` · ${conv.vagaTitle}` : ""}
          {` · ${conv.updatedAt}`}
        </span>
      </span>
      <Badge tone={STAGE[conv.stage].tone}>{STAGE[conv.stage].label}</Badge>
      <a
        href={`https://wa.me/${conv.phone}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Abrir conversa com ${conv.name} no WhatsApp`}
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
      >
        <MessageCircle className="size-4" />
      </a>
      <Button size="sm" variant={isPaused ? "secondary" : "ghost"} onClick={toggle} disabled={pending}>
        {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
        {isPaused ? "Devolver ao atendimento automático" : "Pausar atendimento automático"}
      </Button>
      {error ? <span className="w-full text-xs text-danger">{error}</span> : null}
    </li>
  );
}
