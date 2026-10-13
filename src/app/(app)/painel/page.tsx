import type { Metadata } from "next";
import { BrokerToday } from "@/components/live/broker-today";
import { LiveBoard } from "@/components/live/live-board";
import { getCurrentMember, isLeader } from "@/lib/auth";

export const metadata: Metadata = { title: "Painel" };

export default async function PainelPage() {
  const member = await getCurrentMember();
  return isLeader(member.role) ? <LiveBoard member={member} /> : <BrokerToday member={member} />;
}
