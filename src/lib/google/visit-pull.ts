import "server-only";
import { getGoogleAccessToken } from "@/lib/google/connection";
import { ensureClientForVisit, syncLinkedClient } from "@/lib/google/visit-clients";
import { getAllValues } from "@/lib/google/sheets";
import { autoMapHeaders, locateHeader, PULSE_ID_HEADER } from "@/lib/google/visit-sheet";
import { matchMember, normalize } from "@/lib/google/visit-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { VISIT_STAGES, type VisitStage } from "@/lib/visits";

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const phoneOk = (p: string) => /^[0-9+() -]{8,20}$/.test(p);

// Rótulo da situação (ex.: "Mensagem enviada") -> estágio.
const LABEL_TO_STAGE = new Map<string, VisitStage>();
(Object.keys(VISIT_STAGES) as VisitStage[]).forEach((k) => LABEL_TO_STAGE.set(normalize(VISIT_STAGES[k].label), k));

type SheetVals = { status: string; region: string; name: string; phone: string; broker: string };
type Snap = { status: string; region: string; name: string; phone: string };

/**
 * Puxa as edições feitas NA PLANILHA de volta para o sistema. Só mexe em linhas
 * com "ID Pulse" (já ligadas a uma visita). Situação/região/nome/telefone só
 * mudam quando a planilha mudou em relação à última foto (não desfaz o que foi
 * editado no sistema). O corretor é sempre reconciliado com a planilha (ela é a
 * dona do corretor). Não cria nem apaga visitas aqui.
 */
export async function pullEditsFromSheet(orgId: string, opts?: { force?: boolean }): Promise<{ updated: number } | { error: string }> {
  const force = opts?.force === true;
  const admin = createAdminClient();
  const { data: conn } = await admin.from("sheet_connections").select("spreadsheet_id, sheet_title, enabled, broker_map").eq("org_id", orgId).maybeSingle();
  if (!conn?.spreadsheet_id || !conn.enabled) return { error: "sem-planilha" };

  const token = await getGoogleAccessToken(orgId);
  if (!token) return { error: "sem-token" };

  const grid = await getAllValues(token, conn.spreadsheet_id as string, (conn.sheet_title as string) || "Página1");
  const found = locateHeader(grid);
  if (!found) return { error: "sem-cabecalho" };

  const colMap = autoMapHeaders(found.headers);
  const pulseCol = found.headers.findIndex((h) => h.trim() === PULSE_ID_HEADER);
  if (pulseCol < 0) return { updated: 0 };
  const statusCol = colMap.status ?? found.headers.findIndex((h) => ["situacao", "status"].includes(normalize(h)));

  const cell = (row: string[], idx: number | undefined) => (idx != null && idx >= 0 ? (row[idx] ?? "").trim() : "");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const bySheet = new Map<string, SheetVals>();
  for (const row of grid.slice(found.index + 1)) {
    const pid = (row[pulseCol] ?? "").trim();
    if (!pid || !uuid.test(pid)) continue;
    bySheet.set(pid, {
      status: statusCol >= 0 ? (row[statusCol] ?? "").trim() : "",
      region: cell(row, colMap.region),
      name: cell(row, colMap.client_name),
      phone: onlyDigits(cell(row, colMap.client_phone)),
      broker: cell(row, colMap.broker),
    });
  }
  if (bySheet.size === 0) return { updated: 0 };

  const ids = [...bySheet.keys()];
  const [{ data: snapData }, { data: apptData }, { data: memberData }] = await Promise.all([
    admin.from("sheet_sync_state").select("appointment_id, snapshot").in("appointment_id", ids),
    admin.from("appointments").select("id, member_id, client_id, client_name, client_phone, status").eq("org_id", orgId).in("id", ids),
    admin.from("members").select("id, display_name").eq("org_id", orgId).eq("active", true),
  ]);
  type ApptRow = {
    id: string;
    member_id: string;
    client_id: string | null;
    client_name: string;
    client_phone: string | null;
    status: string;
  };
  const snapById = new Map((snapData ?? []).map((s) => [s.appointment_id as string, s.snapshot as Snap]));
  const apptById = new Map((apptData ?? []).map((a) => [a.id as string, a as ApptRow]));
  const members = (memberData ?? []) as { id: string; display_name: string }[];
  const memberIds = new Set(members.map((m) => m.id));
  const brokerMap = (conn.broker_map ?? {}) as Record<string, string>;
  const resolveMember = (name: string) => {
    const auto = matchMember(name, members);
    if (auto) return auto;
    const mapped = brokerMap[normalize(name)];
    return mapped && memberIds.has(mapped) ? mapped : null;
  };

  const now = new Date().toISOString();
  let updated = 0;

  for (const [id, sv] of bySheet) {
    const appt = apptById.get(id);
    if (!appt) continue; // não é desta empresa ou foi apagada
    const snap = snapById.get(id);
    const patch: Record<string, unknown> = {};

    // Corretor: sempre segue a planilha (quando dá para reconhecer o nome).
    if (sv.broker) {
      const want = resolveMember(sv.broker);
      if (want && want !== appt.member_id) patch.member_id = want;
    }

    // Demais campos: só quando a planilha mudou em relação à foto.
    const fieldsChanged = force || !snap || sv.status !== snap.status || sv.region !== snap.region || sv.name !== snap.name || sv.phone !== snap.phone;
    if (fieldsChanged) {
      const changed = (f: keyof Snap) => force || !snap || sv[f] !== snap[f];
      if (changed("status")) {
        if (sv.status) {
          const stage = LABEL_TO_STAGE.get(normalize(sv.status));
          if (stage) {
            patch.visit_stage = stage;
            patch.status = VISIT_STAGES[stage].status;
          }
        } else if (!force) {
          patch.visit_stage = null;
          patch.status = "scheduled";
        }
      }
      if (changed("region")) {
        if (sv.region) patch.region = sv.region.slice(0, 40);
        else if (!force) patch.region = null;
      }
      if (changed("name") && sv.name) patch.client_name = sv.name.slice(0, 120);
      if (changed("phone")) {
        if (sv.phone && phoneOk(sv.phone)) patch.client_phone = sv.phone;
        else if (!force) patch.client_phone = null;
      }
    }

    if (Object.keys(patch).length) {
      const { error } = await admin.from("appointments").update(patch).eq("id", id).eq("org_id", orgId);
      if (!error) updated++;
    }

    const memberId = (patch.member_id as string | undefined) ?? appt.member_id;
    const clientName = (patch.client_name as string | undefined) ?? appt.client_name;
    const clientPhone =
      patch.client_phone !== undefined ? (patch.client_phone as string | null) : appt.client_phone;
    const status = (patch.status as string | undefined) ?? appt.status;

    let clientId = appt.client_id;
    if (!clientId) {
      clientId = await ensureClientForVisit(admin, {
        orgId,
        memberId,
        name: clientName,
        phone: clientPhone,
        status,
        source: "Planilha",
      });
      if (clientId) await admin.from("appointments").update({ client_id: clientId }).eq("id", id).eq("org_id", orgId);
    } else {
      await syncLinkedClient(admin, {
        orgId,
        clientId,
        memberId,
        name: clientName,
        phone: clientPhone,
        status: status as "scheduled" | "done" | "no_show" | "canceled",
      });
    }

    await admin
      .from("sheet_sync_state")
      .upsert({ appointment_id: id, org_id: orgId, snapshot: { status: sv.status, region: sv.region, name: sv.name, phone: sv.phone }, updated_at: now }, { onConflict: "appointment_id" });
  }

  return { updated };
}
