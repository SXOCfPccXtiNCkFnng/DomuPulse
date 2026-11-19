import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHEET_PLACEHOLDER_NAME } from "@/lib/visits";

type Admin = ReturnType<typeof createAdminClient>;
type Stage = "lead" | "talking" | "scheduled" | "visited" | "proposal" | "presale" | "won" | "lost";
type VisitStatus = "scheduled" | "done" | "no_show" | "canceled";

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const phoneOk = (p: string) => /^[0-9+() -]{8,20}$/.test(p);

function stageFromStatus(status: string): Stage {
  if (status === "done") return "visited";
  if (status === "scheduled") return "scheduled";
  return "talking";
}

/** Só avança o funil; proposta/pré-venda/venda nunca rebaixam. */
function nextStage(current: Stage, status: VisitStatus): Stage | null {
  if (status === "done" && (current === "lead" || current === "talking" || current === "scheduled")) return "visited";
  if (status === "scheduled" && (current === "lead" || current === "talking")) return "scheduled";
  return null;
}

/**
 * Acha ou cria o cliente do corretor para a visita da planilha (por telefone,
 * ou por nome se não houver telefone). Devolve o id para gravar em client_id.
 */
export async function ensureClientForVisit(
  admin: Admin,
  input: {
    orgId: string;
    memberId: string;
    name: string;
    phone: string | null;
    status?: string;
    source?: string;
  },
): Promise<string | null> {
  const name = input.name.trim().slice(0, 120);
  if (!name || name === SHEET_PLACEHOLDER_NAME) return null;
  const phone = input.phone && phoneOk(input.phone) ? input.phone.trim() : null;
  const digits = onlyDigits(phone);
  const desired = stageFromStatus(input.status ?? "scheduled");

  const { data: existing } = await admin
    .from("clients")
    .select("id, name, phone, stage")
    .eq("org_id", input.orgId)
    .eq("member_id", input.memberId)
    .limit(500);
  const rows = (existing ?? []) as { id: string; name: string; phone: string | null; stage: Stage }[];

  const match = digits.length >= 8
    ? rows.find((c) => onlyDigits(c.phone) === digits)
    : rows.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());

  if (match) {
    const patch: Record<string, unknown> = {};
    if (match.name !== name) patch.name = name;
    if (phone && onlyDigits(match.phone) !== digits) patch.phone = phone;
    const advanced = nextStage(match.stage, (input.status as VisitStatus) ?? "scheduled");
    if (advanced) patch.stage = advanced;
    else if ((match.stage === "lead" || match.stage === "talking") && desired === "scheduled") patch.stage = "scheduled";
    if (Object.keys(patch).length) await admin.from("clients").update(patch).eq("id", match.id);
    return match.id;
  }

  const { data: created, error } = await admin
    .from("clients")
    .insert({
      org_id: input.orgId,
      member_id: input.memberId,
      name,
      phone,
      stage: desired,
      source: input.source ?? "Planilha",
    })
    .select("id")
    .single();
  if (error || !created) return null;
  return created.id as string;
}

/** Atualiza o cliente ligado à visita (nome, telefone, corretor, etapa). */
export async function syncLinkedClient(
  admin: Admin,
  input: {
    orgId: string;
    clientId: string | null | undefined;
    memberId?: string;
    name?: string;
    phone?: string | null;
    status?: VisitStatus;
  },
) {
  if (!input.clientId) return;
  const { data: c } = await admin
    .from("clients")
    .select("id, stage, member_id")
    .eq("id", input.clientId)
    .eq("org_id", input.orgId)
    .maybeSingle();
  if (!c) return;

  const patch: Record<string, unknown> = {};
  if (input.name?.trim()) patch.name = input.name.trim().slice(0, 120);
  if (input.phone !== undefined) {
    patch.phone = input.phone && phoneOk(input.phone) ? input.phone : null;
  }
  if (input.memberId && input.memberId !== c.member_id) patch.member_id = input.memberId;
  if (input.status) {
    const next = nextStage(c.stage as Stage, input.status);
    if (next) patch.stage = next;
  }
  if (Object.keys(patch).length) await admin.from("clients").update(patch).eq("id", input.clientId);
}

/**
 * Visitas da empresa ainda sem cliente (ex.: import antigo do Sheets): cria o
 * cadastro na carteira e liga. Idempotente.
 */
export async function linkOrphanVisitsToClients(orgId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: orphans } = await admin
    .from("appointments")
    .select("id, member_id, client_name, client_phone, status")
    .eq("org_id", orgId)
    .is("client_id", null)
    .neq("client_name", SHEET_PLACEHOLDER_NAME)
    .limit(1000);
  if (!orphans?.length) return 0;

  let linked = 0;
  for (const a of orphans) {
    const clientId = await ensureClientForVisit(admin, {
      orgId,
      memberId: a.member_id as string,
      name: a.client_name as string,
      phone: (a.client_phone as string | null) ?? null,
      status: a.status as string,
      source: "Planilha",
    });
    if (!clientId) continue;
    const { error } = await admin.from("appointments").update({ client_id: clientId }).eq("id", a.id).eq("org_id", orgId);
    if (!error) linked++;
  }
  return linked;
}
