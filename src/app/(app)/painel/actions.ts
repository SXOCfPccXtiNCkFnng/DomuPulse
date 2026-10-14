"use server";

import { after } from "next/server";
import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { notifyLeadersOf } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { slotLabel } from "@/lib/time";

/**
 * O corretor grava o relatório direto no banco; depois chama esta ação para a
 * liderança saber na hora (sininho e push). Um aviso por relatório: corrigir
 * os números depois não avisa de novo.
 */
export async function announceReport(reportId: string) {
  if (!z.uuid().safeParse(reportId).success) return;
  const me = await getCurrentMember();
  if (me.role !== "broker") return;

  // O RLS e o filtro garantem que o relatório é do próprio corretor.
  const supabase = await createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, report_slot, visits, sales, notes")
    .eq("id", reportId)
    .eq("member_id", me.id)
    .maybeSingle();
  if (!report) return;

  const first = await rateLimit(`report-notice:${report.id}`, 1, 2 * 86_400);
  if (!first.ok) return;

  const numbers = `${report.visits} ${report.visits === 1 ? "visita" : "visitas"}, ${report.sales} ${report.sales === 1 ? "venda" : "vendas"}`;
  const note = report.notes ? ` Obs.: ${String(report.notes).slice(0, 120)}` : "";

  after(() =>
    notifyLeadersOf(
      { orgId: me.org.id, teamId: me.teamId, divisionId: me.divisionId },
      {
        kind: "report_sent",
        title: `Relatório das ${slotLabel(report.report_slot)}`,
        body: `${me.fullName} enviou: ${numbers}.${note}`,
        url: "/painel",
      },
    ),
  );
}
