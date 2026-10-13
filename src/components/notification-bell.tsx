"use client";

import clsx from "clsx";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

type Notice = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

const COLUMNS = "id, kind, title, body, url, read_at, created_at";

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/** Sininho com os avisos da pessoa. Novos chegam ao vivo pelo Realtime. */
export function NotificationBell({ userId, align = "left" }: { userId: string; align?: "left" | "right" }) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const router = useRouter();
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // O sininho existe na barra lateral e no topo do celular: canal único por instância.
  const instance = useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("notifications")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled) setItems((data ?? []) as Notice[]);
      });

    const channel = supabase
      .channel(`notices-${userId}-${instance}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) =>
        setItems((list) => [payload.new as Notice, ...list].slice(0, 20)),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, instance]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  }

  function openNotice(n: Notice) {
    void markRead([n.id]);
    setOpen(false);
    if (n.url) router.push(n.url);
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Avisos, ${unread} não lidos` : "Avisos"}
        aria-expanded={open}
        className="relative grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Bell className="size-[18px]" />
        {unread ? (
          <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Avisos"
          className={clsx(
            "absolute top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-card animate-rise",
            align === "left" ? "left-0" : "right-0",
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-display font-semibold">Avisos</p>
            {unread ? (
              <button
                onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
              >
                <CheckCheck className="size-3.5" />
                Marcar todos como lidos
              </button>
            ) : null}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? <li className="px-4 py-10 text-center text-sm text-muted">Nenhum aviso por enquanto.</li> : null}
            {items.map((n) => (
              <li key={n.id} className="border-b border-line last:border-0">
                <button onClick={() => openNotice(n)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2">
                  <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-text")} />
                  <span className="min-w-0">
                    <span className={clsx("block text-sm", n.read_at ? "text-ink-2" : "font-semibold")}>{n.title}</span>
                    {n.body ? <span className="block text-[13px] text-muted">{n.body}</span> : null}
                    <span className="mt-0.5 block text-xs text-muted">{ago(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
