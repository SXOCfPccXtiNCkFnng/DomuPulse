"use server";

import { after } from "next/server";
import { z } from "zod";
import { getCurrentMember, orgCanWrite } from "@/lib/auth";
import { geminiConfigured, interpretReport, REPORT_FIELDS, type ReportDeltas, type ReportField } from "@/lib/gemini";
import { describeError, logger } from "@/lib/logger";
import { notifyLeadersOf } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { slotLabel } from "@/lib/time";

// Cerca de 1 minuto e meio de áudio comprimido; cabe no limite de 1 MB das ações.
const AUDIO_MAX_BYTES = 900 * 1024;
const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav"];

export type QuickEntryResult = { heard: string; deltas: ReportDeltas; note: string | null } | { error: string };

/** Relatório rápido: transforma o que o corretor digitou ou falou em números para o rascunho. */
export async function interpretQuickEntry(formData: FormData): Promise<QuickEntryResult> {
  const me = await getCurrentMember();
  if (me.role !== "broker" || me.org.segment !== "brokers") return { error: "Disponível só para corretores." };
  if (!orgCanWrite(me.org)) return { error: "A assinatura está inativa. Fale com o administrador." };
  if (!geminiConfigured()) return { error: "O relatório por IA não está disponível agora. Preencha os números abaixo." };
  const limit = await rateLimit(`quick-report:${me.id}`, 60, 3600);
  if (!limit.ok) return { error: "Muitas mensagens seguidas. Espere alguns minutos ou preencha os números abaixo." };

  const text = String(formData.get("text") ?? "").trim().slice(0, 1000);
  const audio = formData.get("audio");
  let current = {} as Record<ReportField, number>;
  try {
    const parsed = JSON.parse(String(formData.get("current") ?? "{}")) as Record<string, unknown>;
    current = Object.fromEntries(REPORT_FIELDS.map((f) => [f, Math.max(0, Math.round(Number(parsed[f]) || 0))])) as Record<ReportField, number>;
  } catch {
    // Sem os números atuais a IA só não consegue aplicar correções.
  }

  let audioInput: { base64: string; mimeType: string } | undefined;
  if (audio instanceof File && audio.size > 0) {
    const mimeType = audio.type.split(";")[0];
    if (!AUDIO_TYPES.includes(mimeType)) return { error: "Formato de áudio não suportado. Digite o que fez." };
    if (audio.size > AUDIO_MAX_BYTES) return { error: "Áudio muito longo. Mande em partes de até 1 minuto." };
    audioInput = { base64: Buffer.from(await audio.arrayBuffer()).toString("base64"), mimeType };
  } else if (text.length < 2) {
    return { error: "Conte o que você fez." };
  }

  try {
    const r = await interpretReport({ text: audioInput ? undefined : text, audio: audioInput, current });
    if (!r.understood) return { error: audioInput ? "Não entendi o áudio. Tente de novo falando os números, ou digite." : "Não entendi. Conte o que fez, por exemplo: liguei para 5 leads e agendei 2 visitas." };
    return { heard: r.heard, deltas: r.deltas, note: r.note };
  } catch (e) {
    logger.error("report.quick", { message: describeError(e), orgId: me.org.id });
    return { error: "Não consegui entender agora. Tente de novo ou preencha os números abaixo." };
  }
}

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
        body: `${me.displayName} enviou: ${numbers}.${note}`,
        url: "/painel",
      },
    ),
  );
}
