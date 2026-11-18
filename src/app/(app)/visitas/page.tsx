import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isLeader, requireActivatedMember } from "@/lib/auth";
import { getSheetConnection } from "@/lib/google/connection";
import { VisitsBoard } from "./visits-board";

export const metadata: Metadata = { title: "Visitas" };

export default async function VisitasPage() {
  const member = await requireActivatedMember();
  if (member.org.segment !== "brokers") redirect("/recrutamento");
  // Botão "Atualizar" (sincroniza com a planilha) só aparece para a liderança com planilha conectada.
  const conn = isLeader(member.role) ? await getSheetConnection(member.org.id) : null;
  return <VisitsBoard member={member} canSync={Boolean(conn)} />;
}
