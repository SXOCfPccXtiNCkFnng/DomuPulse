import type { Metadata } from "next";
import { requireActivatedMember } from "@/lib/auth";
import { MontarPdfBoard } from "./board";

export const metadata: Metadata = { title: "Montar PDF" };

export default async function MontarPdfPage() {
  await requireActivatedMember();
  return <MontarPdfBoard />;
}
