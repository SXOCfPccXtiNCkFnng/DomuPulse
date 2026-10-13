import type { Metadata } from "next";
import { FirstSteps, type Step } from "@/components/first-steps";
import { BrokerToday } from "@/components/live/broker-today";
import { LiveBoard } from "@/components/live/live-board";
import { getCurrentMember, isLeader, type CurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Painel" };

export default async function PainelPage() {
  const member = await getCurrentMember();
  if (!isLeader(member.role)) return <BrokerToday member={member} />;

  return (
    <div className="flex flex-col gap-5">
      {member.role === "owner" ? <OwnerSteps member={member} /> : null}
      <LiveBoard member={member} />
    </div>
  );
}

async function OwnerSteps({ member }: { member: CurrentMember }) {
  const supabase = await createClient();
  const [teams, members, devices, reports] = await Promise.all([
    supabase.from("teams").select("id", { count: "exact", head: true }),
    supabase.from("members").select("id", { count: "exact", head: true }),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
    supabase.from("reports").select("id", { count: "exact", head: true }),
  ]);

  const steps: Step[] = [
    { id: "team", label: "Criar a primeira equipe", detail: "Na aba Equipe", href: "/equipe", done: (teams.count ?? 0) > 0 },
    { id: "invite", label: "Convidar a equipe", detail: "Gerente e corretores", href: "/equipe", done: (members.count ?? 0) > 1 },
    { id: "push", label: "Ativar notificações", detail: "Lembretes no seu celular", href: "/conta", done: (devices.count ?? 0) > 0 },
    { id: "report", label: "Receber o primeiro relatório", detail: "Enviado por um corretor", href: "/painel", done: (reports.count ?? 0) > 0 },
  ];

  return <FirstSteps orgId={member.org.id} steps={steps} />;
}
