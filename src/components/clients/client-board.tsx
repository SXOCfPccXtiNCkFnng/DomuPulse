"use client";

import clsx from "clsx";
import { Eye, Phone, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientMember } from "@/components/live/types";
import { Button } from "@/components/ui/button";
import { CLIENT_COLUMNS, STAGES, VALUE_STAGES, type Client, type Stage } from "@/lib/clients";
import type { LiveMember } from "@/lib/live/use-live-day";
import { formatMoney } from "@/lib/metrics";
import { getBrowserClient } from "@/lib/supabase/client";
import { ClientDialog } from "./client-dialog";

function daysSince(iso: string) {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d === 0 ? "hoje" : d === 1 ? "1 dia" : `${d} dias`;
}

/**
 * Carteira de clientes em colunas por etapa. As gravações vão direto ao
 * banco com a sessão da pessoa: o RLS decide o que ela pode ver e mexer.
 */
export function ClientBoard({ member }: { member: ClientMember }) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const leader = member.role !== "broker";
  const [clients, setClients] = useState<Client[]>([]);
  const [brokers, setBrokers] = useState<LiveMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("all");
  const [showLost, setShowLost] = useState(false);
  const [open, setOpen] = useState<Client | "new" | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from("clients").select(CLIENT_COLUMNS).order("stage_changed_at", { ascending: false }).limit(1000),
      supabase.from("members").select("id, full_name, role, team_id, active").eq("role", "broker").eq("active", true).order("full_name"),
    ]);
    return { clients: (c ?? []) as Client[], brokers: (m ?? []) as LiveMember[] };
  }, [supabase]);

  const reload = useCallback(async () => {
    const data = await fetchAll();
    setClients(data.clients);
    setBrokers(data.brokers);
    setLoading(false);
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    void fetchAll().then((data) => {
      if (cancelled) return;
      setClients(data.clients);
      setBrokers(data.brokers);
      setLoading(false);
    });
    const channel = supabase
      .channel(`org-${member.org.id}-clients`)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients", filter: `org_id=eq.${member.org.id}` }, () => void reload())
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, fetchAll, reload, member.org.id]);

  const brokerName = useMemo(() => new Map(brokers.map((b) => [b.id, b.full_name])), [brokers]);
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const matches = (c: Client) =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    (c.interest ?? "").toLowerCase().includes(q) ||
    (qDigits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(qDigits));
  const visible = clients.filter((c) => (owner === "all" || c.member_id === owner) && matches(c));
  const columns = STAGES.filter((s) => showLost || s.id !== "lost");

  async function moveTo(id: string, stage: Stage) {
    const client = clients.find((c) => c.id === id);
    if (!client || client.stage === stage) return;
    setError(null);
    const previous = clients;
    setClients((list) => list.map((c) => (c.id === id ? { ...c, stage, stage_changed_at: new Date().toISOString() } : c)));
    const { error } = await supabase.from("clients").update({ stage }).eq("id", id);
    if (error) {
      setClients(previous);
      setError("Não foi possível mover. Verifique sua conexão ou a assinatura.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted">{loading ? "Carregando" : `${visible.filter((c) => c.stage !== "lost").length} clientes em andamento`}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Clientes</h1>
        </div>
        {/* A carteira é do corretor: a liderança acompanha, mas não cadastra nem altera. */}
        {leader ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Eye className="size-4" />
            Só visualização: cada corretor cuida da própria carteira
          </p>
        ) : (
          <Button onClick={() => setOpen("new")}>
            <Plus className="size-4" />
            Novo cliente
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full max-w-xs">
          <span className="sr-only">Buscar cliente</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, telefone ou interesse"
            className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-ink"
          />
        </label>
        {leader && brokers.length > 0 ? (
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            aria-label="Corretor"
            className="h-10 rounded-xl border border-line bg-surface px-3 text-sm"
          >
            <option value="all">Todos os corretores</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.full_name}
              </option>
            ))}
          </select>
        ) : null}
        <label className="flex cursor-pointer items-center gap-2 px-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} className="size-4 accent-[var(--brand)]" />
          Mostrar perdidos
        </label>
      </div>

      {error ? <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}

      <div className="-mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:snap-none lg:px-0">
        <div className="flex gap-3">
          {columns.map((col) => {
            const items = visible.filter((c) => c.stage === col.id);
            const total = VALUE_STAGES.includes(col.id) ? items.reduce((s, c) => s + (c.value_cents ?? 0), 0) : 0;
            return (
              <section
                key={col.id}
                aria-label={col.label}
                onDragOver={(e) => {
                  if (leader) return;
                  e.preventDefault();
                  setOver(col.id);
                }}
                onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  // O card muda de coluna e é recriado lá: o onDragEnd do original
                  // não chega, e sem isto ele ficava transparente.
                  setDragging(null);
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) void moveTo(id, col.id);
                }}
                className={clsx(
                  "flex w-[78vw] max-w-[264px] shrink-0 snap-start flex-col rounded-2xl border p-2 transition-colors sm:w-[264px]",
                  over === col.id ? "border-brand-text bg-brand-soft" : "border-line bg-surface-2/60",
                  col.id === "lost" && "opacity-80",
                )}
              >
                <header className="flex items-baseline justify-between gap-2 px-2 pt-1 pb-2">
                  <h2 className="text-sm font-semibold">{col.label}</h2>
                  <span className="text-xs text-muted tabular-nums">
                    {items.length}
                    {total ? `, ${formatMoney(total)}` : ""}
                  </span>
                </header>
                <ul className="flex min-h-24 flex-col gap-2">
                  {items.map((c) => (
                    <li key={c.id}>
                      <button
                        draggable={!leader}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", c.id);
                          setDragging(c.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => setOpen(c)}
                        className={clsx(
                          "w-full rounded-xl border border-line bg-surface p-3 text-left shadow-card transition-opacity hover:border-line-strong",
                          dragging === c.id && "opacity-40",
                        )}
                      >
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        {c.interest ? <span className="mt-0.5 block truncate text-xs text-ink-2">{c.interest}</span> : null}
                        <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                          <span className="truncate">{leader ? (brokerName.get(c.member_id) ?? "Corretor") : (c.source ?? "")}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            {c.phone ? <Phone className="size-3" aria-label="tem telefone" /> : null}
                            {daysSince(c.stage_changed_at)}
                          </span>
                        </span>
                        {c.value_cents ? <span className="mt-1 block text-xs font-semibold tabular-nums">{formatMoney(c.value_cents)}</span> : null}
                      </button>
                    </li>
                  ))}
                  {!loading && items.length === 0 ? <li className="px-2 py-6 text-center text-xs text-muted">{leader ? "Nenhum cliente" : "Arraste um cliente para cá"}</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {open ? (
        <ClientDialog
          client={open === "new" ? null : open}
          brokers={leader ? brokers : null}
          readOnly={leader}
          selfId={member.id}
          timezone={member.org.timezone}
          onClose={() => setOpen(null)}
          onSaved={(saved) => {
            setClients((list) => (list.some((c) => c.id === saved.id) ? list.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...list]));
          }}
          onDeleted={(id) => setClients((list) => list.filter((c) => c.id !== id))}
        />
      ) : null}
    </div>
  );
}
