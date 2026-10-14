import type { Metadata } from "next";
import { ClientBoard } from "@/components/clients/client-board";
import { requireActivatedMember } from "@/lib/auth";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const member = await requireActivatedMember();
  return <ClientBoard member={member} />;
}
