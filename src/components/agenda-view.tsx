"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, MapPin, Pencil, Phone, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteVisit, scheduleVisit, setVisitStatus, updateVisit } from "@/app/(app)/agenda/actions";
import type { ClientMember } from "@/components/live/types";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { useOrgClock, type LiveMember } from "@/lib/live/use-live-day";
import { propertyLabel, type Property } from "@/lib/properties";
import { getBrowserClient } from "@/lib/supabase/client";
import { addDays, dateIn, formatLongDate, formatTimeIn, zonedToIso } from "@/lib/time";
import { RegionSelect } from "@/components/region-select";

type Status = "scheduled" | "done" | "canceled" | "no_show";

type Appointment = {
  id: string;
  member_id: string;
  client_id: string | null;
  client_name: string;
  client_phone: string | null;
  scheduled_at: string;
  status: Status;
  notes: string | null;
  region?: string | null;
};

const APPOINTMENT_COLUMNS = "id, member_id, client_id, client_name, client_phone, scheduled_at, status, notes";

type ClientOption = { id: string; member_id: string; name: string; phone: string | null; stage: string };
type PropertyOption = Pick<Property, "id" | "title" | "code" | "kind" | "neighborhood" | "status">;

const STATUS: Record<Status, { label: string; tone: "neutral" | "brand" | "danger" | "warn" }> = {
  scheduled: { label: "Agendada", tone: "neutral" },
  done: { label: "Realizada", tone: "brand" },
  no_show: { label: "Não compareceu", tone: "warn" },
  canceled: { label: "Cancelada", tone: "danger" },
};

const UPCOMING_LIMIT = 1000;

type Counts = Record<Status, number>;
const emptyCounts = (): Counts => ({ scheduled: 0, done: 0, no_show: 0, canceled: 0 });

export function AgendaView({ member }: { member: ClientMember }) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const tz = member.org.timezone;
  const { today } = useOrgClock(tz);
  const [items, setItems] = useState<Appointment[]>([]);
  // Inclui inativos para dar nome às visitas antigas; o agendamento usa só os ativos.
  const [allBrokers, setAllBrokers] = useState<LiveMember[]>([]);
  const brokers = useMemo(() => allBrokers.filter((b) => b.active), [allBrokers]);
  const [view, setView] = useState<"upcoming" | "day">("upcoming");
  const [day, setDay] = useState("");
  const selectedDay = day || today;
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  // Imóvel de interesse de cada cliente (id do cliente -> id do imóvel).
  const [clientProperty, setClientProperty] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [broker, setBroker] = useState("all");

  const load = useCallback(async () => {
    const query = (columns: string) => {
      const appointments = supabase.from("appointments").select(columns).order("scheduled_at");
      return view === "day"
        ? appointments.gte("scheduled_at", zonedToIso(selectedDay, "00:00", tz)).lt("scheduled_at", zonedToIso(addDays(selectedDay, 1), "00:00", tz))
        : appointments.gte("scheduled_at", zonedToIso(today, "00:00", tz)).limit(UPCOMING_LIMIT);
    };
    const range = async () => {
      const r = await query(`${APPOINTMENT_COLUMNS}, region`);
      // Sem a atualização do banco (região), a agenda segue sem esse campo.
      return r.error?.code === "42703" ? query(APPOINTMENT_COLUMNS) : r;
    };
    const [{ data: a }, { data: m }, { data: cl }, { data: pr }, { data: links }] = await Promise.all([
      range(),
      supabase.from("members").select("id, full_name:display_name, role, team_id, active").eq("role", "broker").order("display_name"),
      supabase.from("clients").select("id, member_id, name, phone, stage").order("name"),
      // Sem a tabela de imóveis (migração ainda não rodada), o campo só não aparece.
      supabase.from("properties").select("id, title, code, kind, neighborhood, status").in("status", ["available", "reserved"]).order("title"),
      supabase.from("clients").select("id, property_id").not("property_id", "is", null),
    ]);
    const clientProperty: Record<string, string> = {};
    for (const l of (links ?? []) as { id: string; property_id: string }[]) clientProperty[l.id] = l.property_id;
    return {
      clientProperty,
      items: (a ?? []) as unknown as Appointment[],
      brokers: (m ?? []) as LiveMember[],
      clients: (cl ?? []) as ClientOption[],
      properties: (pr ?? []) as PropertyOption[],
    };
  }, [supabase, today, tz, view, selectedDay]);

  const reload = useCallback(async () => {
    const data = await load();
    setItems(data.items);
    setAllBrokers(data.brokers);
    setClients(data.clients);
    setProperties(data.properties);
    setClientProperty(data.clientProperty);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void load().then((data) => {
      if (cancelled) return;
      setItems(data.items);
      setAllBrokers(data.brokers);
      setClients(data.clients);
      setProperties(data.properties);
      setClientProperty(data.clientProperty);
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

  const names = new Map(allBrokers.map((b) => [b.id, b.full_name]));
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
    if ("error" in r) void reload();
  }

  const upcoming = visible.filter((i) => i.status === "scheduled").length;

  const totals = emptyCounts();
  const perBroker = new Map<string, Counts>();
  for (const item of visible) {
    totals[item.status] += 1;
    const c = perBroker.get(item.member_id) ?? emptyCounts();
    c[item.status] += 1;
    perBroker.set(item.member_id, c);
  }
  const brokerRows = [...perBroker.entries()]
    .map(([id, c]) => ({ id, name: names.get(id) ?? "Corretor", c }))
    .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));

  const dayLabel = selectedDay === today ? "Hoje" : selectedDay === addDays(today, 1) ? "Amanhã" : formatLongDate(selectedDay);
  const description = loading
    ? "Carregando"
    : view === "day"
      ? `${visible.length} ${visible.length === 1 ? "visita" : "visitas"} no dia`
      : `${upcoming} ${upcoming === 1 ? "visita pendente" : "visitas pendentes"}`;

  return (
    <div className="flex flex-col gap-5">
      <header className="animate-rise">
        <p className="text-sm text-muted">{view === "day" ? dayLabel : "Todas as próximas visitas"}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Agenda</h1>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0">
          <CardHeader title={view === "day" ? "Visitas do dia" : "Visitas agendadas"} description={description} />
          <div className="flex flex-wrap items-center gap-2 px-5 pt-5 sm:px-6">
            <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Período">
              {(
                [
                  ["upcoming", "Próximas"],
                  ["day", "Dia específico"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={view === key}
                  onClick={() => setView(key)}
                  className={clsx(
                    "h-8 rounded-lg px-3 text-[13px] font-medium transition-colors",
                    view === key ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {view === "day" ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setDay(addDays(selectedDay, -1))} aria-label="Dia anterior">
                  <ChevronLeft className="size-4" />
                </Button>
                <Input
                  type="date"
                  value={selectedDay}
                  onChange={(e) => setDay(e.target.value)}
                  aria-label="Escolher dia"
                  className="h-10 w-auto"
                />
                <Button size="sm" variant="ghost" onClick={() => setDay(addDays(selectedDay, 1))} aria-label="Próximo dia">
                  <ChevronRight className="size-4" />
                </Button>
                {selectedDay !== today ? (
                  <Button size="sm" variant="ghost" onClick={() => setDay(today)}>
                    Hoje
                  </Button>
                ) : null}
              </div>
            ) : null}
            {isLeader && allBrokers.length > 0 ? (
              <select
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                aria-label="Filtrar por corretor"
                className="h-10 w-full max-w-xs rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
              >
                <option value="all">Todos os corretores</option>
                {(view === "day" ? allBrokers : brokers).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.full_name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {view === "day" && !loading && visible.length > 0 ? (
            <div className="px-5 pt-5 sm:px-6">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["scheduled", "done", "no_show", "canceled"] as const).map((s) => (
                  <div key={s} className="rounded-xl border border-line px-3 py-2">
                    <p className="text-xs text-muted">{STATUS[s].label}</p>
                    <p className="font-display text-xl font-semibold tabular-nums">{totals[s]}</p>
                  </div>
                ))}
              </div>
              {isLeader && brokerRows.length > 1 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted">
                      <tr className="text-left">
                        <th className="py-1.5 pr-3 font-medium">Corretor</th>
                        {(["scheduled", "done", "no_show", "canceled"] as const).map((s) => (
                          <th key={s} className="px-2 py-1.5 text-right font-medium">
                            {STATUS[s].label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {brokerRows.map((r) => (
                        <tr key={r.id} className="border-t border-line">
                          <td className="py-1.5 pr-3 font-medium">{r.name}</td>
                          {(["scheduled", "done", "no_show", "canceled"] as const).map((s) => (
                            <td key={s} className="px-2 py-1.5 text-right tabular-nums">
                              {r.c[s]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-6 p-5 sm:p-6">
            {!loading && visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                {view === "day" ? "Nenhuma visita neste dia." : "Nenhuma visita marcada daqui para frente."}
              </p>
            ) : null}
            {[...byDay.entries()].map(([day, list]) => (
              <section key={day}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                  {day === today ? "Hoje" : day === addDays(today, 1) ? "Amanhã" : formatLongDate(day)}
                </h3>
                <ul className="flex flex-col gap-2">
                  {list.map((a) => (
                    <VisitRow
                      key={a.id}
                      visit={a}
                      timezone={tz}
                      today={today}
                      brokerName={isLeader ? (names.get(a.member_id) ?? "Corretor") : null}
                      properties={properties}
                      propertyId={a.client_id ? (clientProperty[a.client_id] ?? "") : ""}
                      onStatus={(status) => setStatus(a.id, status)}
                      onChanged={() => void reload()}
                    />
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
            properties={properties}
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

function VisitRow({
  visit: a,
  timezone,
  today,
  brokerName,
  properties,
  propertyId,
  onStatus,
  onChanged,
}: {
  visit: Appointment;
  timezone: string;
  today: string;
  brokerName: string | null;
  properties: PropertyOption[];
  propertyId: string;
  onStatus: (status: Status) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const origDate = dateIn(a.scheduled_at, timezone);
  const origTime = formatTimeIn(a.scheduled_at, timezone);
  const [date, setDate] = useState(origDate);
  const [time, setTime] = useState(origTime);
  const [property, setProperty] = useState(propertyId);
  const [region, setRegion] = useState(a.region ?? "");
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const linkedTitle = properties.find((p) => p.id === propertyId);

  function open() {
    setEditing((v) => !v);
    setDate(origDate);
    setTime(origTime);
    setProperty(propertyId);
    setRegion(a.region ?? "");
    setError(null);
  }

  async function save() {
    if (!date || !time) return setError("Escolha data e horário.");
    const moved = date !== origDate || time !== origTime;
    const relinked = property !== propertyId;
    const reregioned = region !== (a.region ?? "");
    if (!moved && !relinked && !reregioned) return setEditing(false);
    setPending(true);
    setError(null);
    const r = await updateVisit(a.id, {
      ...(moved ? { scheduledAt: zonedToIso(date, time, timezone) } : {}),
      ...(relinked ? { propertyId: property || null } : {}),
      ...(reregioned ? { region: region || null } : {}),
    });
    setPending(false);
    if ("error" in r) return setError(r.error);
    setEditing(false);
    onChanged();
  }

  async function remove() {
    setPending(true);
    const r = await deleteVisit(a.id);
    setPending(false);
    if ("error" in r) {
      setConfirmDel(false);
      return setError(r.error);
    }
    onChanged();
  }

  return (
    <li className="rounded-2xl border border-line p-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={clsx("w-14 font-display text-lg font-semibold tabular-nums", a.status !== "scheduled" && "text-muted")}>
          {formatTimeIn(a.scheduled_at, timezone)}
        </span>
        <span className={clsx("min-w-0 flex-1", a.status !== "scheduled" && "opacity-70")}>
          <span className="block truncate font-medium">{a.client_name}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {brokerName ? (
              <span className="inline-flex items-center rounded-md bg-brand-soft px-1.5 py-0.5 font-semibold text-brand-text">{brokerName}</span>
            ) : null}
            {a.client_phone ? (
              <a href={`tel:${a.client_phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-ink">
                <Phone className="size-3" />
                {a.client_phone}
              </a>
            ) : null}
            {a.region ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {a.region}
              </span>
            ) : null}
            {linkedTitle ? <span className="truncate">{propertyLabel(linkedTitle)}</span> : null}
          </span>
        </span>

        <span className="flex w-full flex-wrap items-center gap-1 sm:w-auto">
          {a.status === "scheduled" ? (
            <span className="flex flex-1 gap-1 sm:flex-none [&>button]:flex-1 sm:[&>button]:flex-none">
              <Button size="sm" variant="secondary" onClick={() => onStatus("done")}>
                Realizada
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onStatus("no_show")}>
                Faltou
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onStatus("canceled")}>
                Cancelar
              </Button>
            </span>
          ) : (
            <>
              <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
              <Button size="sm" variant="ghost" onClick={() => onStatus("scheduled")} title="Voltar para agendada">
                <RotateCcw className="size-3.5" />
                Reabrir
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={open} aria-label="Editar visita" title="Editar, remarcar ou excluir">
            <Pencil className="size-3.5" />
          </Button>
        </span>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Data">
              <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="h-10 w-auto" />
            </Field>
            <Field label="Horário">
              <Input type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} className="h-10 w-auto" />
            </Field>
            <Field label="Região">
              <RegionSelect value={region} onChange={setRegion} className="h-10 w-auto" />
            </Field>
            {properties.length ? (
              <Field label="Imóvel">
                <Select value={property} onChange={(e) => setProperty(e.target.value)} disabled={!a.client_id} className="h-10 min-w-56">
                  <option value="">Sem imóvel definido</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {propertyLabel(p)}
                      {p.status === "reserved" ? " (reservado)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Button onClick={save} disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              Fechar
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {confirmDel ? (
              <>
                <span className="text-sm text-ink-2">Excluir esta visita?</span>
                <Button size="sm" variant="danger" onClick={remove} disabled={pending}>
                  Confirmar exclusão
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDel(true)} disabled={pending}>
                <Trash2 className="size-3.5" />
                Excluir visita
              </Button>
            )}
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </li>
  );
}

function NewAppointment({
  today,
  clients,
  properties,
  brokers,
  selfId,
  timezone,
  onCreate,
}: {
  today: string;
  clients: ClientOption[];
  properties: PropertyOption[];
  brokers: LiveMember[] | null;
  selfId: string;
  timezone: string;
  onCreate: (input: {
    memberId: string;
    clientId: string | null;
    clientName: string;
    clientPhone: string | null;
    propertyId: string | null;
    scheduledAt: string;
    region: string | null;
  }) => Promise<string | null>;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [region, setRegion] = useState("");
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
      propertyId: propertyId || null,
      scheduledAt: zonedToIso(date, time, timezone),
      region: region || null,
    });
    setPending(false);
    if (error) setMessage({ tone: "error", text: error });
    else {
      setClientId("new");
      setPropertyId("");
      setRegion("");
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
      {properties.length ? (
        <Field label="Imóvel" hint="Opcional. Fica ligado ao cliente como imóvel de interesse.">
          <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">Sem imóvel definido</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {propertyLabel(p)}
                {p.status === "reserved" ? " (reservado)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">
          <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" required min={today} />
        </Field>
        <Field label="Horário">
          <Input value={time} onChange={(e) => setTime(e.target.value)} type="time" required step={900} />
        </Field>
      </div>
      <Field label="Região" hint="Opcional. Aparece na tela de Visitas.">
        <RegionSelect value={region} onChange={setRegion} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Agendar visita"}
      </Button>
    </form>
  );
}
