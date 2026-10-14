import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth";
import { LEGAL_DOCS_VERSION } from "@/lib/legal";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/time";

/**
 * "Baixar meus dados" (LGPD, art. 18): tudo o que o Pulse guarda sobre a
 * pessoa logada, num arquivo JSON. Usa o cliente do usuário, então o RLS
 * garante que nada de outra pessoa entra no arquivo.
 */
export async function GET() {
  const me = await getCurrentMember();

  const limit = await rateLimit(`my-data:${me.userId}`, 10, 60 * 60);
  if (!limit.ok) return NextResponse.json({ error: "Muitos pedidos. Tente de novo em alguns minutos." }, { status: 429 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const byMember = (table: string) => supabase.from(table).select("*").eq("member_id", me.id);

  const [member, reports, presence, appointments, clients, goals, commissions, notifications, devices, org] = await Promise.all([
    supabase.from("members").select("full_name, role, active, created_at, terms_accepted_at, terms_version, weekly_digest, digest_email").eq("id", me.id).single(),
    byMember("reports").order("report_date"),
    byMember("daily_status").order("status_date"),
    byMember("appointments").order("scheduled_at"),
    byMember("clients").order("created_at"),
    byMember("goals").order("month"),
    byMember("commissions").order("received_on"),
    supabase.from("notifications").select("kind, title, body, created_at, read_at").order("created_at"),
    supabase.from("push_subscriptions").select("user_agent, created_at").eq("user_id", me.userId),
    me.role === "owner"
      ? supabase.from("organizations").select("name, timezone, report_slots, status, contact_phone, price_cents, created_at").single()
      : Promise.resolve({ data: null }),
  ]);

  const payload = {
    gerado_em: new Date().toISOString(),
    versao_dos_termos_vigente: LEGAL_DOCS_VERSION,
    conta: {
      email: auth?.claims?.email ?? null,
      nome: me.fullName,
      cargo: me.role,
      imobiliaria: me.org.name,
      ...member.data,
    },
    imobiliaria: org.data,
    relatorios: reports.data ?? [],
    presenca: presence.data ?? [],
    visitas_agendadas: appointments.data ?? [],
    clientes: clients.data ?? [],
    metas: goals.data ?? [],
    comissoes: commissions.data ?? [],
    avisos: notifications.data ?? [],
    aparelhos_com_notificacao: devices.data ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pulse-meus-dados-${todayIn(me.org.timezone)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
