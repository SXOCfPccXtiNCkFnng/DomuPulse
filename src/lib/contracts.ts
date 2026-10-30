import "server-only";
import { type CurrentMember, getCurrentMember, isLeader, orgCanWrite } from "@/lib/auth";
import {
  accumulate,
  addMonths,
  adjustedValue,
  INDEX_CODES,
  INDEXES,
  indexWindow,
  type IndexCode,
  monthOf,
} from "@/lib/contract-math";
import { sendContractsReportEmail, type ContractReportRow } from "@/lib/email-templates";
import { describeError, logger } from "@/lib/logger";
import { notifyRoles, notifyUsers } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, formatDate, minutesNowIn, startOfMonth, todayIn } from "@/lib/time";
import { fetchAll } from "@/lib/weekly-digest";

export const CONTRACTS_BUCKET = "contracts";
export const CONTRACT_FILE_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
export const CONTRACT_MAX_BYTES = 10 * 1024 * 1024;

/** Contratos são da liderança de contas de imobiliária/construtora. */
export async function requireContracts(): Promise<CurrentMember | { error: string }> {
  const me = await getCurrentMember();
  if (me.org.segment !== "brokers" || !isLeader(me.role)) return { error: "Disponível só para a liderança." };
  if (!orgCanWrite(me.org)) return { error: "A assinatura está inativa. Fale com o administrador." };
  return me;
}

/** Quantos dias antes do vencimento o reajuste aparece para conferência. */
export const ADVANCE_DAYS = 45;

export type ContractRow = {
  id: string;
  org_id: string;
  kind: "locacao" | "venda";
  reference: string;
  party_name: string;
  index_code: IndexCode;
  base_date: string;
  period_months: number;
  lag_months: number;
  allow_decrease: boolean;
  current_value_cents: number;
  next_adjustment_on: string;
};

const CONTRACT_COLUMNS =
  "id, org_id, kind, reference, party_name, index_code, base_date, period_months, lag_months, allow_decrease, current_value_cents, next_adjustment_on";

// Índices do Banco Central (SGS) ------------------------------------------------

const SYNC_EVERY_MS = 12 * 60 * 60 * 1000;
const bcbDate = (date: string) => date.split("-").reverse().join("/");

async function fetchSeries(code: IndexCode, from: string, to: string) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${INDEXES[code].sgs}/dados?formato=json&dataInicial=${bcbDate(from)}&dataFinal=${bcbDate(to)}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
  // Sem dado novo no intervalo o SGS responde 404.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`BCB ${res.status} na série ${INDEXES[code].sgs}`);
  const rows = (await res.json()) as { data: string; valor: string }[];
  return rows
    .map((r) => {
      const [, m, y] = r.data.split("/");
      return { index_code: code, ref_month: `${y}-${m}-01`, pct: Number(r.valor) };
    })
    .filter((r) => Number.isFinite(r.pct));
}

/**
 * Atualiza os índices mensais. Na primeira vez traz 10 anos (o máximo que o
 * SGS devolve numa consulta); depois só os meses recentes, que o IBGE/FGV
 * ainda podem revisar. Roda no máximo a cada 12 horas.
 */
export async function syncIndexes() {
  const admin = createAdminClient();
  const today = todayIn("America/Sao_Paulo");
  let saved = 0;
  for (const code of INDEX_CODES) {
    try {
      const { data: last } = await admin
        .from("index_values")
        .select("ref_month, fetched_at")
        .eq("index_code", code)
        .order("ref_month", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last && Date.now() - Date.parse(last.fetched_at) < SYNC_EVERY_MS) continue;
      const from = last ? addMonths(last.ref_month, -6) : addMonths(startOfMonth(today), -119);
      const rows = await fetchSeries(code, from, today);
      const fetched_at = new Date().toISOString();
      if (rows.length) {
        const { error } = await admin.from("index_values").upsert(rows.map((r) => ({ ...r, fetched_at })), { onConflict: "index_code,ref_month" });
        if (error) throw error;
        saved += rows.length;
      } else if (last) {
        await admin.from("index_values").update({ fetched_at }).eq("index_code", code).eq("ref_month", last.ref_month);
      }
    } catch (error) {
      logger.warn("contracts.indexes", { message: describeError(error), index: code });
    }
  }
  return saved;
}

/** Variações mensais por índice a partir de um mês ("AAAA-MM"). */
async function loadIndexValues(codes: IndexCode[], fromMonth: string) {
  const rows = await fetchAll<{ index_code: IndexCode; ref_month: string; pct: number }>((from, to) =>
    createAdminClient()
      .from("index_values")
      .select("index_code, ref_month, pct")
      .in("index_code", codes)
      .gte("ref_month", `${fromMonth}-01`)
      .range(from, to),
  );
  const map = new Map<IndexCode, Map<string, number>>();
  for (const r of rows) {
    if (!map.has(r.index_code)) map.set(r.index_code, new Map());
    map.get(r.index_code)!.set(monthOf(r.ref_month), Number(r.pct));
  }
  return map;
}

export function computeAdjustment(c: ContractRow, values: Map<IndexCode, Map<string, number>>) {
  const window = indexWindow(c.next_adjustment_on, c.period_months, c.lag_months);
  const acc = accumulate(window, values.get(c.index_code) ?? new Map());
  return {
    window,
    ...acc,
    newCents: adjustedValue(Number(c.current_value_cents), acc.pct, c.allow_decrease),
  };
}

// Reajustes pendentes -----------------------------------------------------------

/**
 * Cria (ou recalcula) o reajuste pendente de cada contrato que vence nos
 * próximos ADVANCE_DAYS dias, incluindo os atrasados. Pendente sempre é
 * recalculado: o índice do último mês pode ter saído desde ontem. Aprovado
 * ou pulado nunca muda. Devolve quantos reajustes novos apareceram.
 */
export async function planAdjustments(org: { id: string; timezone: string }, contractId?: string) {
  const admin = createAdminClient();
  const horizon = addDays(todayIn(org.timezone), ADVANCE_DAYS);
  let query = admin.from("contracts").select(CONTRACT_COLUMNS).eq("org_id", org.id).eq("status", "active").lte("next_adjustment_on", horizon);
  if (contractId) query = query.eq("id", contractId);
  const { data, error } = await query;
  if (error) throw error;
  const contracts = (data ?? []) as ContractRow[];
  if (contracts.length === 0) return 0;

  const ids = contracts.map((c) => c.id);
  const { data: existingRows } = await admin.from("contract_adjustments").select("id, contract_id, due_on, status").eq("org_id", org.id).in("contract_id", ids);
  const existing = existingRows ?? [];

  // Data mudou (contrato editado): o pendente antigo não vale mais.
  const stale = existing.filter((a) => a.status === "pending" && contracts.some((c) => c.id === a.contract_id && c.next_adjustment_on !== a.due_on));
  if (stale.length) await admin.from("contract_adjustments").delete().in("id", stale.map((a) => a.id));

  const earliest = contracts.reduce((min, c) => {
    const first = indexWindow(c.next_adjustment_on, c.period_months, c.lag_months)[0];
    return first < min ? first : min;
  }, "9999-12");
  const values = await loadIndexValues([...new Set(contracts.map((c) => c.index_code))], earliest);

  let created = 0;
  for (const c of contracts) {
    const current = existing.find((a) => a.contract_id === c.id && a.due_on === c.next_adjustment_on);
    if (current && current.status !== "pending") continue;
    const calc = computeAdjustment(c, values);
    const row = {
      org_id: org.id,
      contract_id: c.id,
      due_on: c.next_adjustment_on,
      index_code: c.index_code,
      months: calc.used,
      missing_months: calc.missing,
      accumulated_pct: calc.pct,
      old_value_cents: c.current_value_cents,
      new_value_cents: calc.newCents,
    };
    const { error: saveError } = current
      ? await admin.from("contract_adjustments").update(row).eq("id", current.id)
      : await admin.from("contract_adjustments").insert(row);
    if (saveError) {
      logger.error("contracts.plan", { message: describeError(saveError), orgId: org.id, contractId: c.id });
      continue;
    }
    if (!current) created++;
  }

  // Aviso antecipado: um por rodada, só quando aparece reajuste novo.
  if (created > 0 && !contractId) {
    await notifyRoles(org.id, ["owner", "director", "manager"], {
      kind: "contracts_due",
      title: created === 1 ? "1 reajuste para conferir" : `${created} reajustes para conferir`,
      body: "Os novos valores já estão calculados. Confira e aprove antes do vencimento.",
      url: "/contratos",
    });
  }
  return created;
}

// Relatório do mês ------------------------------------------------------------

const SEND_AT_MIN = 8 * 60;
const monthName = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** No dia 1, às 8h: o que reajusta no mês, o que está atrasado e o que vem depois. */
export async function sendContractReports(org: { id: string; name: string; timezone: string }) {
  const today = todayIn(org.timezone);
  if (today.slice(8) !== "01" || minutesNowIn(org.timezone) < SEND_AT_MIN) return 0;

  const admin = createAdminClient();
  const { count: total } = await admin.from("contracts").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "active");
  if (!total) return 0;

  const monthStart = startOfMonth(today);
  const nextStart = addMonths(monthStart, 1);
  const afterNext = addMonths(monthStart, 2);
  const [{ data: pending }, { count: nextMonth }, { count: toReview }, { data: leaders }] = await Promise.all([
    admin
      .from("contract_adjustments")
      .select("due_on, index_code, old_value_cents, new_value_cents, missing_months, contracts (reference, party_name)")
      .eq("org_id", org.id)
      .eq("status", "pending")
      .lt("due_on", nextStart)
      .order("due_on"),
    admin.from("contracts").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "active").gte("next_adjustment_on", nextStart).lt("next_adjustment_on", afterNext),
    admin.from("contracts").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "active").eq("needs_review", true),
    admin.from("members").select("id, user_id, full_name, digest_email").eq("org_id", org.id).eq("active", true).in("role", ["owner", "director", "manager"]),
  ]);

  type Pending = {
    due_on: string;
    index_code: IndexCode;
    old_value_cents: number;
    new_value_cents: number;
    missing_months: string[];
    contracts: { reference: string; party_name: string } | null;
  };
  const toRow = (a: Pending): ContractReportRow => ({
    reference: a.contracts?.reference ?? "Contrato",
    party: a.contracts?.party_name ?? "",
    due: formatDate(a.due_on),
    index: INDEXES[a.index_code].label,
    from: Number(a.old_value_cents),
    to: Number(a.new_value_cents),
    estimated: a.missing_months.length > 0,
  });
  const rows = (pending ?? []) as unknown as Pending[];
  const overdue = rows.filter((a) => a.due_on < today).map(toRow);
  const thisMonth = rows.filter((a) => a.due_on >= today).map(toRow);
  const label = monthName(today);

  let sent = 0;
  for (const leader of leaders ?? []) {
    const { data: fresh } = await admin
      .from("notification_log")
      .upsert([{ member_id: leader.id, kind: "contracts_month", ref_date: monthStart, ref_slot: "00:00" }], {
        onConflict: "member_id,kind,ref_date,ref_slot",
        ignoreDuplicates: true,
      })
      .select("member_id");
    if (!fresh?.length) continue;

    const email = leader.digest_email || (await admin.auth.admin.getUserById(leader.user_id)).data.user?.email;
    if (email) {
      const result = await sendContractsReportEmail({
        to: email,
        fullName: leader.full_name,
        orgName: org.name,
        monthLabel: label,
        thisMonth,
        overdue,
        nextMonth: nextMonth ?? 0,
        toReview: toReview ?? 0,
      });
      if (result.ok) sent++;
    }
    const due = thisMonth.length + overdue.length;
    await notifyUsers(org.id, [leader.user_id], {
      kind: "contracts_month",
      title: `Reajustes de ${label}`,
      body: due ? `${due} ${due === 1 ? "contrato reajusta" : "contratos reajustam"} este mês. Confira os valores.` : "Nenhum contrato reajusta este mês.",
      url: "/contratos",
    });
  }
  return sent;
}
