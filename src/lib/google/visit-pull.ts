import "server-only";
import { getGoogleAccessToken } from "@/lib/google/connection";
import { getAllValues } from "@/lib/google/sheets";
import { autoMapHeaders, locateHeader, PULSE_ID_HEADER } from "@/lib/google/visit-sheet";
import { normalize } from "@/lib/google/visit-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { VISIT_STAGES, type VisitStage } from "@/lib/visits";

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const phoneOk = (p: string) => /^[0-9+() -]{8,20}$/.test(p);

// Rótulo da situação (ex.: "Mensagem enviada") -> estágio.
const LABEL_TO_STAGE = new Map<string, VisitStage>();
(Object.keys(VISIT_STAGES) as VisitStage[]).forEach((k) => LABEL_TO_STAGE.set(normalize(VISIT_STAGES[k].label), k));

type Snap = { status: string; region: string; name: string; phone: string };

/**
 * Puxa as edições feitas NA PLANILHA de volta para o sistema. Só mexe em linhas
 * que têm "ID Pulse" (já ligadas a uma visita). Compara com a foto da última
 * sincronização: só aplica o que mudou na planilha, então não desfaz o que foi
 * editado no sistema. Não cria nem apaga visitas aqui (isso é import/push).
 */
export async function pullEditsFromSheet(orgId: string, opts?: { force?: boolean }): Promise<{ updated: number } | { error: string }> {
  const force = opts?.force === true;
  const admin = createAdminClient();
  const { data: conn } = await admin.from("sheet_connections").select("spreadsheet_id, sheet_title, enabled").eq("org_id", orgId).maybeSingle();
  if (!conn?.spreadsheet_id || !conn.enabled) return { error: "sem-planilha" };

  const token = await getGoogleAccessToken(orgId);
  if (!token) return { error: "sem-token" };

  const grid = await getAllValues(token, conn.spreadsheet_id as string, (conn.sheet_title as string) || "Página1");
  const found = locateHeader(grid);
  if (!found) return { error: "sem-cabecalho" };

  const colMap = autoMapHeaders(found.headers);
  const pulseCol = found.headers.findIndex((h) => h.trim() === PULSE_ID_HEADER);
  if (pulseCol < 0) return { updated: 0 }; // nada ligado ainda
  const statusCol = colMap.status ?? found.headers.findIndex((h) => ["situacao", "status"].includes(normalize(h)));

  const cell = (row: string[], idx: number | undefined) => (idx != null && idx >= 0 ? (row[idx] ?? "").trim() : "");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const bySheet = new Map<string, Snap>();
  for (const row of grid.slice(found.index + 1)) {
    const pid = (row[pulseCol] ?? "").trim();
    if (!pid || !uuid.test(pid)) continue;
    bySheet.set(pid, {
      status: statusCol >= 0 ? (row[statusCol] ?? "").trim() : "",
      region: cell(row, colMap.region),
      name: cell(row, colMap.client_name),
      phone: onlyDigits(cell(row, colMap.client_phone)),
    });
  }
  if (bySheet.size === 0) return { updated: 0 };

  const ids = [...bySheet.keys()];
  const [{ data: snapData }, { data: apptData }] = await Promise.all([
    admin.from("sheet_sync_state").select("appointment_id, snapshot").in("appointment_id", ids),
    admin.from("appointments").select("id").eq("org_id", orgId).in("id", ids),
  ]);
  const snapById = new Map((snapData ?? []).map((s) => [s.appointment_id as string, s.snapshot as Snap]));
  const ours = new Set((apptData ?? []).map((a) => a.id as string));

  const now = new Date().toISOString();
  let updated = 0;

  for (const [id, sv] of bySheet) {
    if (!ours.has(id)) continue; // não é desta empresa ou foi apagada
    const snap = snapById.get(id);
    // Modo normal: precisa de foto base e só age se a planilha mudou.
    // Modo forçado ("a planilha manda"): ignora a foto e aplica o que a planilha tem.
    if (!force) {
      if (!snap) continue;
      if (sv.status === snap.status && sv.region === snap.region && sv.name === snap.name && sv.phone === snap.phone) continue;
    }
    const changed = (f: keyof Snap) => force || !snap || sv[f] !== snap[f];

    const patch: Record<string, unknown> = {};
    if (changed("status")) {
      if (sv.status) {
        const stage = LABEL_TO_STAGE.get(normalize(sv.status));
        if (stage) {
          patch.visit_stage = stage;
          patch.status = VISIT_STAGES[stage].status;
        }
      } else if (!force) {
        // No forçado, planilha vazia não apaga a situação (só preenche o que tem).
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

    if (Object.keys(patch).length) {
      const { error } = await admin.from("appointments").update(patch).eq("id", id).eq("org_id", orgId);
      if (!error) updated++;
    }
    // Atualiza a foto para o estado atual da planilha.
    await admin.from("sheet_sync_state").upsert({ appointment_id: id, org_id: orgId, snapshot: sv, updated_at: now }, { onConflict: "appointment_id" });
  }

  return { updated };
}
