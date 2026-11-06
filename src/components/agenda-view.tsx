"use client";

import clsx from "clsx";
import { Phone } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { scheduleVisit, setVisitStatus } from "@/app/(app)/agenda/actions";
import type { ClientMember } from "@/components/live/types";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { useOrgClock, type LiveMember } from "@/lib/live/use-live-day";
import { getBrowserClient } from "@/lib/supabase/client";
import { addDays, dateIn, formatLongDate, formatTimeIn, zonedToIso } from "@/lib/time";

type Status = "scheduled" | "done" | "canceled" | "no_show";

type Appointment = {
  id: string;
  member_id: string;
  client_name: string;
  client_phone: string | null;
  scheduled_at: string;
  status: Status;
  notes: string | null;
};

type ClientOption = { id: string; member_id: string; name: string; phone: string | null; stage: string };

const STATUS: Record<Status, { label: string; tone: "neutral" | "brand" | "danger" | "warn" }> = {
  scheduled: { label: "Agendada", tone: "neutral" },
  done: { label: "Realizada", tone: "brand" },
  no_show: { label: "Não compareceu", tone: "warn" },
  canceled: { label: "Cancelada", tone: "danger" },
};

const DAYS_AHEAD = 14;

export function AgendaView({ member }: { member: ClientMember }) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const tz = member.org.timezone;
  const { today } = useOrgClock(tz);
  const [items, setItems] = useState<Appointment[]>([]);
  const [brokers, setBrokers] = useState<LiveMember[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [broker, setBroker] = useState("all");

  const load = useCallback(async () => {
    const from = zonedToIso(today, "00:00", tz);
    const to = zonedToIso(addDays(today, DAYS_AHEAD), "00:00", tz);
    const [{ data: a }, { data: m }, { data: cl }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, member_id, client_name, client_phone, scheduled_at, status, notes")
        .gte("scheduled_at", from)
        .lt("scheduled_at", to)
        .order("scheduled_at"),
      supabase.from("members").select("id, full_name, role, team_id, active").eq("role", "broker").eq("active", true).order("full_name"),
      supabase.from("clients").select("id, member_id, name, phone, stage").order("name"),
    ]);
    return { items: (a ?? []) as Appointment[], brokers: (m ?? []) as LiveMember[], clients: (cl ?? []) as ClientOption[] };
  }, [supabase, today, tz]);

  const reload = useCallback(async () => {
    const data = await load();
    setItems(data.items);
    setBrokers(data.brokers);
    setClients(data.clients);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void load().then((data) => {
      if (cancelled) return;
      setItems(data.items);
      setBrokers(data.brokers);
      setClients(data.clients);
      setLoading(false);
    });
    const channel = supabase
      .channel(`org-${member.org.id}-agenda`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `org_id=eq.${member.org.id}` }, () => void reload())
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, load, reload, member.org.id]);

  const names = new Map(brokers.map((b) => [b.id, b.full_name]));
  const isLeader = member.role !== "broker";
  const visible = broker === "all" ? items : items.filter((i) => i.member_id === broker);
  const byDay = new Map<string, Appointment[]>();
  for (const item of visible) {
    const day = dateIn(item.scheduled_at, tz);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }

  async function setStatus(id: string, status: Status) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, status } : i)));
    const r = await setVisitStatus(id, status);
    // "Realizada" também pode mover o cliente no funil: recarrega pra refletir.
    if ("error" in r || status === "done") void reload();
  }

  const upcoming = visible.filter((i) => i.status === "scheduled").length;

  return (
    <div className="flex flex-col gap-5">
      <header className="animate-rise">
        <p className="text-sm text-muted">Próximos {DAYS_AHEAD} dias</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Agenda</h1>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0">
          <CardHeader
            title="Visitas agendadas"
            description={loading ? "Carregando" : `${upcoming} ${upcoming === 1 ? "visita pendente" : "visitas pendentes"}`}
          />
          {isLeader && brokers.length > 0 ? (
            <div className="px-5 pt-5 sm:px-6">
              <select
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                aria-label="Filtrar por corretor"
                className="h-10 w-full max-w-xs rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
              >
                <option value="all">Todos os corretores</option>
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.full_name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-col gap-6 p-5 sm:p-6">
            {!loading && visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Nenhuma visita nos próximos dias.</p>
            ) : null}
            {[...byDay.entries()].map(([day, list]) => (
              <section key={day}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                  {day === today ? "Hoje" : day === addDays(today, 1) ? "Amanhã" : formatLongDate(day)}
                </h3>
                <ul className="flex flex-col gap-2">
                  {list.map((a) => (
                    <li
                      key={a.id}
                      className={clsx(
                        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line p-3.5",
                        a.status !== "scheduled" && "opacity-70",
                      )}
                    >
                      <span className="w-14 font-display text-lg font-semibold tabular-nums">{formatTimeIn(a.scheduled_at, tz)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{a.client_name}</span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                          {isLeader ? (
                            <span className="inline-flex items-center rounded-md bg-brand-soft px-1.5 py-0.5 font-semibold text-brand-text">
                              {names.get(a.member_id) ?? "Corretor"}
                            </span>
                          ) : null}
                          {a.client_phone ? (
                            <a href={`tel:${a.client_phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-ink">
                              <Phone className="size-3" />
                              {a.client_phone}
                            </a>
                          ) : null}
                        </span>
                      </span>
                      {a.status === "scheduled" ? (
                        <span className="flex w-full gap-1 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
                          <Button size="sm" variant="secondary" onClick={() => setStatus(a.id, "done")}>
                            Realizada
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setStatus(a.id, "no_show")}>
                            Faltou
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setStatus(a.id, "canceled")}>
                            Cancelar
                          </Button>
                        </span>
                      ) : (
                        <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Card>

        <Card className="self-start">
          <CardHeader title="Nova visita" />
          <NewAppointment
            today={today}
            clients={clients}
            onCreate={async (input) => {
              const r = await scheduleVisit(input);
              if ("error" in r) return r.error;
              void reload();
              return null;
            }}
            brokers={member.role === "broker" ? null : brokers}
            selfId={member.id}
            timezone={tz}
          />
        </Card>
      </div>
    </div>
  );
}

function NewAppointment({
  today,
  clients,
  brokers,
  selfId,
  timezone,
  onCreate,
}: {
  today: string;
  clients: ClientOption[];
  brokers: LiveMember[] | null;
  selfId: string;
  timezone: string;
  onCreate: (input: {
    memberId: string;
    clientId: string | null;
    clientName: string;
    clientPhone: string | null;
    scheduledAt: string;
  }) => Promise<string | null>;
}) {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [memberId, setMemberId] = useState(brokers ? (brokers[0]?.id ?? "") : selfId);
  const [clientId, setClientId] = useState("new");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");

  // Só os clientes do corretor escolhido (pra não ligar visita ao cliente de outro).
  const mineClients = clients.filter((c) => c.member_id === memberId);
  const isNew = clientId === "new";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const finalName = isNew ? name.trim() : (mineClients.find((c) => c.id === clientId)?.name ?? "");
    if (!memberId || !date || !time || (isNew && !finalName)) {
      setMessage({ tone: "error", text: "Preencha corretor, cliente, data e horário." });
      return;
    }
    setPending(true);
    const error = await onCreate({
      memberId,
      clientId: isNew ? null : clientId,
      clientName: finalName.slice(0, 120),
      clientPhone: isNew ? phone.trim() || null : null,
      scheduledAt: zonedToIso(date, time, timezone),
    });
    setPending(false);
    if (error) setMessage({ tone: "error", text: error });
    else {
      setClientId("new");
      setName("");
      setPhone("");
      setTime("");
      setMessage({ tone: "success", text: "Visita agendada." });
    }
  }

  return (
    <form className="flex flex-col gap-4 p-5 sm:p-6" onSubmit={submit}>
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      {brokers ? (
        <Field label="Corretor">
          <Select
            value={memberId}
            onChange={(e) => {
              setMemberId(e.target.value);
              setClientId("new");
            }}
            required
          >
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.full_name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Cliente" hint="Escolha um cliente ou crie um novo. Ele entra sozinho no funil, sem cadastrar duas vezes.">
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="new">+ Novo cliente</option>
          {mineClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      {isNew ? (
        <>
          <Field label="Nome do cliente">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Telefone" hint="Opcional">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" maxLength={20} placeholder="(11) 99999 0000" autoComplete="off" />
          </Field>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">
          <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" required min={today} />
        </Field>
        <Field label="Horário">
          <Input value={time} onChange={(e) => setTime(e.target.value)} type="time" required step={900} />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Agendar visita"}
      </Button>
    </form>
  );
}
