import type { Metadata } from "next";
import { AgendaView } from "@/components/agenda-view";
import { requireActivatedMember } from "@/lib/auth";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const member = await requireActivatedMember();
  return <AgendaView member={member} />;
}
