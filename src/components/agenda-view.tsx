"use client";

import clsx from "clsx";
import { Phone } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const from = zonedToIso(today, "00:00", tz);
    const to = zonedToIso(addDays(today, DAYS_AHEAD), "00:00", tz);
    const [{ data: a }, { data: m }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, member_id, client_name, client_phone, scheduled_at, status, notes")
        .gte("scheduled_at", from)
        .lt("scheduled_at", to)
        .order("scheduled_at"),
      supabase.from("members").select("id, full_name, role, team_id, active").eq("role", "broker").eq("active", true).order("full_name"),
    ]);
    return { items: (a ?? []) as Appointment[], brokers: (m ?? []) as LiveMember[] };
  }, [supabase, today, tz]);

  const reload = useCallback(async () => {
    const data = await load();
    setItems(data.items);
    setBrokers(data.brokers);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void load().then((data) => {
      if (cancelled) return;
      setItems(data.items);
      setBrokers(data.brokers);
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
  const byDay = new Map<string, Appointment[]>();
  for (const item of items) {
    const day = dateIn(item.scheduled_at, tz);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }

  async function setStatus(id: string, status: Status) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, status } : i)));
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    if (error) void reload();
  }

  const upcoming = items.filter((i) => i.status === "scheduled").length;

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
          <div className="flex flex-col gap-6 p-5 sm:p-6">
            {!loading && items.length === 0 ? (
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
                        <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                          {member.role !== "broker" ? <span>{names.get(a.member_id) ?? "Corretor"}</span> : null}
                          {a.client_phone ? (
                            <a href={`tel:${a.client_phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-ink">
                              <Phone className="size-3" />
                              {a.client_phone}
                            </a>
                          ) : null}
                        </span>
                      </span>
                      {a.status === "scheduled" ? (
                        <span className="flex gap-1">
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
            onCreate={async (input) => {
              const { error } = await supabase.from("appointments").insert(input);
              if (error) return error.code === "23514" ? "Confira o telefone informado." : "Não foi possível salvar. Tente de novo.";
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
  brokers,
  selfId,
  timezone,
  onCreate,
}: {
  today: string;
  brokers: LiveMember[] | null;
  selfId: string;
  timezone: string;
  onCreate: (input: {
    member_id: string;
    client_name: string;
    client_phone: string | null;
    scheduled_at: string;
  }) => Promise<string | null>;
}) {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="flex flex-col gap-4 p-5 sm:p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const name = String(data.get("client") ?? "").trim();
        const phone = String(data.get("phone") ?? "").trim();
        const date = String(data.get("date") ?? "");
        const time = String(data.get("time") ?? "");
        const memberId = brokers ? String(data.get("member") ?? "") : selfId;

        if (!name || !date || !time || !memberId) {
          setMessage({ tone: "error", text: "Preencha cliente, data e horário." });
          return;
        }
        setPending(true);
        const error = await onCreate({
          member_id: memberId,
          client_name: name.slice(0, 120),
          client_phone: phone || null,
          scheduled_at: zonedToIso(date, time, timezone),
        });
        setPending(false);
        if (error) setMessage({ tone: "error", text: error });
        else {
          form.reset();
          setMessage({ tone: "success", text: "Visita agendada." });
        }
      }}
    >
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      {brokers ? (
        <Field label="Corretor">
          <Select name="member" required>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.full_name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Cliente">
        <Input name="client" required maxLength={120} autoComplete="off" />
      </Field>
      <Field label="Telefone" hint="Opcional">
        <Input name="phone" type="tel" inputMode="tel" maxLength={20} placeholder="(11) 99999 0000" autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">
          <Input name="date" type="date" required defaultValue={today} min={today} />
        </Field>
        <Field label="Horário">
          <Input name="time" type="time" required step={900} />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Agendar visita"}
      </Button>
    </form>
  );
}
