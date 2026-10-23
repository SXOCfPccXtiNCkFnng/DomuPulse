import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/lib/heartbeat";
import { sendInterviewReminders } from "@/lib/interview-notify";
import { describeError, logger } from "@/lib/logger";
import { sendToUsers } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { minutesNowIn, normalizeSlot, SLOT_LATE_AFTER, SLOT_OPENS_BEFORE, slotLabel, slotMinutes, todayIn } from "@/lib/time";

type Kind = "checkin" | "reminder" | "overdue" | "team_overdue";

type Member = { id: string; user_id: string; full_name: string; role: string; team_id: string | null };

// Janela em que cada aviso pode sair, em minutos relativos ao horário do
// relatório. O agendador roda a cada 5 minutos e o notification_log garante
// que cada aviso saia uma vez só.
const WINDOWS: Record<Exclude<Kind, "team_overdue">, [number, number]> = {
  checkin: [-60, -SLOT_OPENS_BEFORE],
  reminder: [-SLOT_OPENS_BEFORE, 0],
  overdue: [SLOT_LATE_AFTER, 60],
};

// O cron-job.org chama com GET por padrão; POST também é aceito.
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const sent = await run();
    // Lembretes de entrevista para candidatos (RH), no horário escolhido em cada entrevista.
    const interviews = await sendInterviewReminders().catch((err) => {
      logger.error("cron.interview_reminders", { message: describeError(err) });
      return 0;
    });
    await recordHeartbeat("cron.reminders", { ok: true, result: { sent, interviews } });
    return NextResponse.json({ ok: true, sent, interviews });
  } catch (error) {
    const message = describeError(error);
    logger.error("cron.reminders", { message });
    await recordHeartbeat("cron.reminders", { ok: false, error: message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const POST = GET;

async function run() {
  const admin = createAdminClient();
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, timezone, report_slots, status, trial_ends_at")
    .in("status", ["trialing", "active", "past_due"]);

  let sent = 0;

  for (const org of orgs ?? []) {
    if (org.status === "trialing" && new Date(org.trial_ends_at) <= new Date()) continue;

    const today = todayIn(org.timezone);
    const now = minutesNowIn(org.timezone);
    const slots = (org.report_slots as string[]).map(normalizeSlot);

    const due: { slot: string; kind: Kind }[] = [];
    slots.forEach((slot, i) => {
      const delta = now - slotMinutes(slot);
      const inWindow = ([from, to]: [number, number]) => delta >= from && delta < to;
      if (i === 0 && inWindow(WINDOWS.checkin)) due.push({ slot, kind: "checkin" });
      if (inWindow(WINDOWS.reminder)) due.push({ slot, kind: "reminder" });
      if (inWindow(WINDOWS.overdue)) due.push({ slot, kind: "overdue" });
    });
    if (due.length === 0) continue;

    const [{ data: members }, { data: statuses }, { data: reports }] = await Promise.all([
      admin.from("members").select("id, user_id, full_name, role, team_id").eq("org_id", org.id).eq("active", true),
      admin.from("daily_status").select("member_id, online").eq("org_id", org.id).eq("status_date", today),
      admin.from("reports").select("member_id, report_slot").eq("org_id", org.id).eq("report_date", today),
    ]);

    const all = (members ?? []) as Member[];
    const brokers = all.filter((m) => m.role === "broker");
    const online = new Map((statuses ?? []).map((s) => [s.member_id, s.online as boolean]));
    const delivered = new Set((reports ?? []).map((r) => `${r.member_id}|${normalizeSlot(r.report_slot)}`));

    for (const { slot, kind } of due) {
      const label = slotLabel(slot);

      if (kind === "checkin") {
        const targets = brokers.filter((b) => !online.has(b.id));
        sent += await notifyOnce(admin, targets, kind, today, slot, {
          title: "Bom dia",
          body: "Marque sua presença de hoje para entrar nos lembretes de relatório.",
          url: "/painel",
          tag: `checkin-${today}`,
        });
        continue;
      }

      const pending = brokers.filter((b) => online.get(b.id) === true && !delivered.has(`${b.id}|${slot}`));

      if (kind === "reminder") {
        sent += await notifyOnce(admin, pending, kind, today, slot, {
          title: `Relatório das ${label}`,
          body: "Faltam 10 minutos. Envie seus números pelo Pulse.",
          url: "/painel",
          tag: `slot-${today}-${slot}`,
        });
        continue;
      }

      // Atrasado: avisa o corretor e manda um resumo para o gerente da equipe.
      sent += await notifyOnce(admin, pending, kind, today, slot, {
        title: `Relatório das ${label} pendente`,
        body: "Sua liderança está aguardando. Leva menos de um minuto.",
        url: "/painel",
        tag: `slot-${today}-${slot}`,
      });

      const byTeam = new Map<string, Member[]>();
      for (const b of pending) if (b.team_id) byTeam.set(b.team_id, [...(byTeam.get(b.team_id) ?? []), b]);

      for (const [teamId, list] of byTeam) {
        const managers = all.filter((m) => m.role === "manager" && m.team_id === teamId);
        const names = list.slice(0, 3).map((b) => b.full_name.split(" ")[0]).join(", ");
        const more = list.length > 3 ? ` e mais ${list.length - 3}` : "";
        sent += await notifyOnce(admin, managers, "team_overdue", today, slot, {
          title: `${list.length} ${list.length === 1 ? "pendente" : "pendentes"} no relatório das ${label}`,
          body: `${names}${more}.`,
          url: "/painel",
          tag: `team-${today}-${slot}`,
        });
      }
    }
  }

  return sent;
}

async function notifyOnce(
  admin: ReturnType<typeof createAdminClient>,
  targets: Member[],
  kind: Kind,
  date: string,
  slot: string,
  payload: { title: string; body: string; url: string; tag: string },
) {
  if (targets.length === 0) return 0;

  // ON CONFLICT DO NOTHING: só voltam as linhas inseridas agora, ou seja,
  // quem ainda não recebeu este aviso.
  const { data: fresh } = await admin
    .from("notification_log")
    .upsert(
      targets.map((t) => ({ member_id: t.id, kind, ref_date: date, ref_slot: slot })),
      { onConflict: "member_id,kind,ref_date,ref_slot", ignoreDuplicates: true },
    )
    .select("member_id");

  const ids = new Set((fresh ?? []).map((f) => f.member_id));
  const userIds = targets.filter((t) => ids.has(t.id)).map((t) => t.user_id);
  const { sent } = await sendToUsers(userIds, payload);
  return sent;
}
