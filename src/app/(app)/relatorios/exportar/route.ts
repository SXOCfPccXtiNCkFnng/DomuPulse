import { NextResponse, type NextRequest } from "next/server";
import { METRICS } from "@/lib/metrics";
import { resolvePeriod } from "@/lib/period";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE, formatDate, normalizeSlot } from "@/lib/time";

type Row = {
  report_date: string;
  report_slot: string;
  members: { full_name: string; team_id: string | null } | null;
} & Record<string, unknown>;

// Excel executa células que começam com = + - @ como fórmula. Um nome
// cadastrado como "=HYPERLINK(...)" viraria um link malicioso na planilha.
function cell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Planilha com cada relatório do período. O RLS decide o que entra. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = await rateLimit(`export:${userId}`, 20, 60 * 60);
  if (!limit.ok) return NextResponse.json({ error: "Muitas exportações. Tente mais tarde." }, { status: 429 });

  const { data: org } = await supabase.from("organizations").select("timezone").maybeSingle();
  const q = request.nextUrl.searchParams;
  const period = resolvePeriod(
    { periodo: q.get("periodo") ?? undefined, de: q.get("de") ?? undefined, ate: q.get("ate") ?? undefined },
    org?.timezone ?? DEFAULT_TIMEZONE,
  );
  const teamId = q.get("equipe");
  // Mesmo filtro da tela: um corretor só. O RLS continua decidindo o que a pessoa vê.
  const brokerId = q.get("corretor");
  const brokerFilter = brokerId && /^[0-9a-f-]{36}$/i.test(brokerId) ? brokerId : null;

  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));

  // O Supabase devolve no máximo 1.000 linhas por vez: busca em páginas.
  const rows: Row[] = [];
  for (let page = 0; page < 200; page++) {
    let query = supabase
      .from("reports")
      .select(`report_date, report_slot, ${METRICS.map((m) => m.key).join(", ")}, notes, members!inner (full_name, team_id)`)
      .gte("report_date", period.from)
      .lte("report_date", period.to)
      .order("report_date")
      .order("report_slot")
      .range(page * 1000, page * 1000 + 999);
    if (brokerFilter) query = query.eq("member_id", brokerFilter);
    else if (teamId) query = query.eq("members.team_id", teamId);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Não foi possível exportar." }, { status: 500 });
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }

  const header = ["Data", "Horário", "Corretor", "Equipe", ...METRICS.map((m) => m.label), "Observação"];
  const lines = rows.map((r) =>
    [
      formatDate(r.report_date),
      normalizeSlot(r.report_slot),
      r.members?.full_name ?? "",
      (r.members?.team_id && teamName.get(r.members.team_id)) || "",
      ...METRICS.map((m) => Number(r[m.key] ?? 0)),
      String(r.notes ?? ""),
    ]
      .map(cell)
      .join(";"),
  );

  // BOM no começo: o Excel abre os acentos corretamente.
  const csv = `﻿${[header.map(cell).join(";"), ...lines].join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pulse-relatorios-${period.from}-a-${period.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
