import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActivatedMember } from "@/lib/auth";
import { VisitsBoard } from "./visits-board";

export const metadata: Metadata = { title: "Visitas" };

export default async function VisitasPage() {
  const member = await requireActivatedMember();
  if (member.org.segment !== "brokers") redirect("/recrutamento");
  return <VisitsBoard member={member} />;
}
