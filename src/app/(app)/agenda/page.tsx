import type { Metadata } from "next";
import { AgendaView } from "@/components/agenda-view";
import { getCurrentMember } from "@/lib/auth";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const member = await getCurrentMember();
  return <AgendaView member={member} />;
}
