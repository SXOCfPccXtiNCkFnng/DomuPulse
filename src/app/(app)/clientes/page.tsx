import type { Metadata } from "next";
import { ClientBoard } from "@/components/clients/client-board";
import { getCurrentMember } from "@/lib/auth";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const member = await getCurrentMember();
  return <ClientBoard member={member} />;
}
