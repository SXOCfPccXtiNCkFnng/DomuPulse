"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Report } from "@/lib/metrics";
import { getBrowserClient } from "@/lib/supabase/client";
import { minutesNowIn, todayIn } from "@/lib/time";

export type LiveMember = {
  id: string;
  full_name: string;
  role: "owner" | "director" | "manager" | "broker";
  team_id: string | null;
  active: boolean;
};

export type LiveTeam = { id: string; name: string };

export type DailyStatus = {
  member_id: string;
  status_date: string;
  online: boolean;
};

export type ConnectionState = "connecting" | "live" | "reconnecting";

const REPORT_COLUMNS =
  "id, member_id, report_date, report_slot, leads, interactions, negotiations, appointments, visits, proposals, presales, sales, notes, updated_at";

const reportKey = (r: Pick<Report, "member_id" | "report_slot">) => `${r.member_id}|${r.report_slot.slice(0, 5)}`;

// Relógio no fuso da organização. Atualiza a cada 20 segundos para virar a
// janela de horário (e o dia) sem recarregar a página.
export function useOrgClock(timezone: string) {
  const [now, setNow] = useState(() => ({
    today: todayIn(timezone),
    minutes: minutesNowIn(timezone),
  }));
  useEffect(() => {
    const tick = () => setNow({ today: todayIn(timezone), minutes: minutesNowIn(timezone) });
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, [timezone]);
  return now;
}

/**
 * Dados do dia com atualização ao vivo pelo Supabase Realtime.
 *
 * O RLS decide o que chega aqui: o corretor recebe só os próprios dados,
 * o gerente os da equipe, e assim por diante. Ao reconectar ou voltar para
 * a aba, recarrega tudo para não perder eventos que aconteceram offline.
 */
export function useLiveDay({ orgId, timezone }: { orgId: string; timezone: string }) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const clock = useOrgClock(timezone);
  const today = clock.today;

  const [members, setMembers] = useState<LiveMember[]>([]);
  const [teams, setTeams] = useState<LiveTeam[]>([]);
  const [reports, setReports] = useState<Map<string, Report>>(new Map());
  const [statuses, setStatuses] = useState<Map<string, DailyStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [pulse, setPulse] = useState<{ memberId: string; at: number } | null>(null);
  const todayRef = useRef(today);

  const fetchMembers = useCallback(async () => {
    const [{ data: m }, { data: t }] = await Promise.all([
      supabase.from("members").select("id, full_name, role, team_id, active").eq("active", true).order("full_name"),
      supabase.from("teams").select("id, name").order("name"),
    ]);
    return { members: (m ?? []) as LiveMember[], teams: (t ?? []) as LiveTeam[] };
  }, [supabase]);

  const fetchDay = useCallback(
    async (date: string) => {
      const [{ data: r }, { data: s }] = await Promise.all([
        supabase.from("reports").select(REPORT_COLUMNS).eq("report_date", date),
        supabase.from("daily_status").select("member_id, status_date, online").eq("status_date", date),
      ]);
      return {
        reports: new Map(((r ?? []) as Report[]).map((x) => [reportKey(x), x])),
        statuses: new Map(((s ?? []) as DailyStatus[]).map((x) => [x.member_id, x])),
      };
    },
    [supabase],
  );

  type Snapshot = Awaited<ReturnType<typeof fetchMembers>> & Awaited<ReturnType<typeof fetchDay>>;

  const apply = useCallback((data: Snapshot) => {
    setMembers(data.members);
    setTeams(data.teams);
    setReports(data.reports);
    setStatuses(data.statuses);
    setLoading(false);
  }, []);

  const fetchAll = useCallback(
    async (date: string): Promise<Snapshot> => ({ ...(await fetchMembers()), ...(await fetchDay(date)) }),
    [fetchMembers, fetchDay],
  );

  const reloadAll = useCallback(async () => apply(await fetchAll(todayRef.current)), [apply, fetchAll]);

  const loadMembers = useCallback(async () => {
    const data = await fetchMembers();
    setMembers(data.members);
    setTeams(data.teams);
  }, [fetchMembers]);

  // Carga inicial e virada do dia.
  useEffect(() => {
    todayRef.current = today;
    let cancelled = false;
    void fetchAll(today).then((data) => {
      if (!cancelled) apply(data);
    });
    return () => {
      cancelled = true;
    };
  }, [today, fetchAll, apply]);

  useEffect(() => {
    const onReport = (payload: RealtimePostgresChangesPayload<Report>) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<Report>).id;
        setReports((prev) => {
          const next = new Map(prev);
          for (const [k, v] of next) if (v.id === id) next.delete(k);
          return next;
        });
        return;
      }
      const row = payload.new;
      if (row.report_date !== todayRef.current) return;
      setReports((prev) => new Map(prev).set(reportKey(row), row));
      setPulse({ memberId: row.member_id, at: Date.now() });
    };

    const onStatus = (payload: RealtimePostgresChangesPayload<DailyStatus>) => {
      if (payload.eventType === "DELETE") return;
      const row = payload.new;
      if (row.status_date !== todayRef.current) return;
      setStatuses((prev) => new Map(prev).set(row.member_id, row));
    };

    let wasLive = false;
    const channel = supabase
      .channel(`org-${orgId}-day`)
      .on<Report>("postgres_changes", { event: "*", schema: "public", table: "reports", filter: `org_id=eq.${orgId}` }, onReport)
      .on<DailyStatus>("postgres_changes", { event: "*", schema: "public", table: "daily_status", filter: `org_id=eq.${orgId}` }, onStatus)
      .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `org_id=eq.${orgId}` }, () => void loadMembers())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
          // Reconexão: busca o que pode ter mudado enquanto estava fora.
          if (wasLive) void reloadAll();
          wasLive = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("reconnecting");
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadAll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase, orgId, loadMembers, reloadAll]);

  const upsertLocalReport = useCallback((row: Report) => {
    setReports((prev) => new Map(prev).set(reportKey(row), row));
  }, []);

  const upsertLocalStatus = useCallback((row: DailyStatus) => {
    setStatuses((prev) => new Map(prev).set(row.member_id, row));
  }, []);

  return {
    supabase,
    clock,
    members,
    teams,
    reports,
    statuses,
    loading,
    connection,
    pulse,
    upsertLocalReport,
    upsertLocalStatus,
    reportFor: (memberId: string, slot: string) => reports.get(`${memberId}|${slot.slice(0, 5)}`),
  };
}

export const REPORT_SELECT = REPORT_COLUMNS;
