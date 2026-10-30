import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isLeader, requireActivatedMember } from "@/lib/auth";
import { INDEX_CODES, type IndexCode } from "@/lib/contract-math";
import { geminiConfigured } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/time";
import { type Adjustment, type Contract, ContractsBoard } from "./board";

export const metadata: Metadata = { title: "Contratos" };
// A leitura de um contrato pela IA pode levar até meio minuto.
export const maxDuration = 60;

export default async function ContratosPage() {
  const member = await requireActivatedMember();
  if (member.org.segment !== "brokers" || !isLeader(member.role)) redirect("/painel");

  const supabase = await createClient();
  const [{ data: contracts }, { data: adjustments }, latest] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        "id, kind, reference, party_name, party_email, party_phone, index_code, base_date, period_months, lag_months, allow_decrease, current_value_cents, last_adjusted_on, next_adjustment_on, status, file_name, file_path, extracted, needs_review, notes",
      )
      .order("next_adjustment_on"),
    supabase
      .from("contract_adjustments")
      .select("id, contract_id, due_on, index_code, months, missing_months, accumulated_pct, old_value_cents, new_value_cents, final_value_cents, status, letter_text, sent_at")
      .or("status.eq.pending,and(status.eq.approved,sent_at.is.null)")
      .order("due_on"),
    Promise.all(
      INDEX_CODES.map(async (code) => {
        const { data } = await supabase.from("index_values").select("ref_month").eq("index_code", code).order("ref_month", { ascending: false }).limit(1).maybeSingle();
        return [code, data ? (data.ref_month as string).slice(0, 7) : null] as const;
      }),
    ),
  ]);

  const list: Contract[] = (contracts ?? []).map((c) => ({
    id: c.id as string,
    kind: c.kind as Contract["kind"],
    reference: c.reference as string,
    partyName: c.party_name as string,
    partyEmail: (c.party_email as string | null) ?? null,
    partyPhone: (c.party_phone as string | null) ?? null,
    indexCode: c.index_code as IndexCode,
    baseDate: c.base_date as string,
    periodMonths: c.period_months as number,
    lagMonths: c.lag_months as number,
    allowDecrease: c.allow_decrease as boolean,
    valueCents: Number(c.current_value_cents),
    lastAdjustedOn: (c.last_adjusted_on as string | null) ?? null,
    nextAdjustmentOn: c.next_adjustment_on as string,
    status: c.status as Contract["status"],
    fileName: (c.file_name as string | null) ?? null,
    hasFile: Boolean(c.file_path),
    extracted: (c.extracted as Contract["extracted"]) ?? null,
    needsReview: c.needs_review as boolean,
    notes: (c.notes as string | null) ?? null,
  }));

  const adj: Adjustment[] = (adjustments ?? []).map((a) => ({
    id: a.id as string,
    contractId: a.contract_id as string,
    dueOn: a.due_on as string,
    indexCode: a.index_code as IndexCode,
    months: (a.months as { month: string; pct: number }[]) ?? [],
    missing: (a.missing_months as string[]) ?? [],
    pct: Number(a.accumulated_pct),
    oldCents: Number(a.old_value_cents),
    newCents: Number(a.new_value_cents),
    finalCents: a.final_value_cents === null ? null : Number(a.final_value_cents),
    status: a.status as Adjustment["status"],
    letter: (a.letter_text as string | null) ?? null,
    sentAt: (a.sent_at as string | null) ?? null,
  }));

  return (
    <ContractsBoard
      contracts={list}
      adjustments={adj}
      orgName={member.org.name}
      today={todayIn(member.org.timezone)}
      latestIndex={Object.fromEntries(latest) as Record<IndexCode, string | null>}
      aiEnabled={geminiConfigured()}
    />
  );
}
