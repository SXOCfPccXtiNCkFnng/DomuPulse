import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isLeader, requireActivatedMember } from "@/lib/auth";
import { getSheetConnection } from "@/lib/google/connection";
import { IntegrationsBoard } from "./board";

export const metadata: Metadata = { title: "Integrações" };

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function IntegracoesPage({ searchParams }: Props) {
  const member = await requireActivatedMember();
  if (member.org.segment !== "brokers") redirect("/recrutamento");
  if (!isLeader(member.role)) redirect("/painel");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const connection = await getSheetConnection(member.org.id);

  return (
    <IntegrationsBoard
      connected={Boolean(connection)}
      spreadsheetUrl={connection?.spreadsheet_url ?? null}
      sheetReady={connection?.status === "connected"}
      ok={one(sp.ok)}
      erro={one(sp.erro)}
    />
  );
}
