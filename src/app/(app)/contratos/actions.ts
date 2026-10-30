"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { INDEX_CODES, nextDueDate } from "@/lib/contract-math";
import {
  CONTRACT_FILE_TYPES,
  CONTRACT_MAX_BYTES,
  CONTRACTS_BUCKET,
  planAdjustments,
  requireContracts,
  syncIndexes,
} from "@/lib/contracts";
import { sendAdjustmentLetterEmail } from "@/lib/email-templates";
import { type ContractData, extractContract, geminiConfigured } from "@/lib/gemini";
import { describeError, logger } from "@/lib/logger";
import { parseMoney } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation";

const uuid = (id: string) => z.uuid().safeParse(id).success;
const ownFile = (orgId: string, path: string) => new RegExp(`^${orgId}/[0-9a-f-]{36}\\.(pdf|jpg|png)$`).test(path);
const digits = (v: string | null | undefined) => {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 8 && d.length <= 20 ? d : null;
};

function done() {
  revalidatePath("/contratos");
}

/** Passo 1 do envio: link de upload de uso único para o arquivo do contrato. */
export async function prepareContractUpload(file: { name: string; size: number; type: string }) {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  const ext = CONTRACT_FILE_TYPES[file.type];
  if (!ext) return { error: `${file.name}: envie em PDF, JPG ou PNG.` };
  if (!(file.size > 0 && file.size <= CONTRACT_MAX_BYTES)) return { error: `${file.name}: o arquivo precisa ter até 10 MB.` };
  const path = `${gate.org.id}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from(CONTRACTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    logger.error("contracts.upload_url", { message: describeError(error), orgId: gate.org.id });
    return { error: "Não foi possível preparar o envio. Tente de novo." };
  }
  return { path: data.path, token: data.token };
}

async function readWithAi(path: string): Promise<ContractData | { error: string }> {
  if (!geminiConfigured()) return { error: "A leitura automática não está configurada. Preencha os dados à mão." };
  const { data: blob, error } = await createAdminClient().storage.from(CONTRACTS_BUCKET).download(path);
  if (error || !blob) return { error: "O arquivo não chegou. Anexe de novo." };
  const ext = path.split(".").pop();
  const mimeType = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
  try {
    return await extractContract({ base64: Buffer.from(await blob.arrayBuffer()).toString("base64"), mimeType });
  } catch (e) {
    logger.error("contracts.extract", { message: describeError(e) });
    return { error: "Não consegui ler este arquivo automaticamente. Preencha os dados à mão." };
  }
}

/** Lê um contrato com a IA e devolve os dados para a pessoa conferir no formulário. */
export async function analyzeContract(path: string) {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  if (!ownFile(gate.org.id, path)) return { error: "Arquivo inválido. Anexe de novo." };
  const data = await readWithAi(path);
  return "error" in data ? data : { data };
}

const extractedOf = (d: ContractData) => ({ clause: d.clause, notes: d.notes, indexOther: d.indexOther, source: "ai" });

/**
 * Importação em lote: lê e já cadastra, marcado para conferência. Um arquivo
 * por chamada (a leitura leva até meio minuto); a tela chama em sequência.
 */
export async function importContract(path: string, fileName: string) {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  if (!ownFile(gate.org.id, path)) return { error: "Arquivo inválido." };
  const d = await readWithAi(path);
  const drop = () => createAdminClient().storage.from(CONTRACTS_BUCKET).remove([path]);
  if ("error" in d) {
    await drop();
    return d;
  }
  const missing = [
    !d.indexCode && (d.indexOther ? `índice ${d.indexOther} (não suportado)` : "índice"),
    !d.baseDate && "data-base",
    !d.valueCents && "valor",
  ].filter(Boolean);
  if (missing.length) {
    await drop();
    return { error: `Não encontrei ${missing.join(", ")}. Cadastre este à mão.` };
  }
  const period = d.periodMonths ?? 12;
  const { error } = await (await createClient()).from("contracts").insert({
    org_id: gate.org.id,
    kind: d.kind ?? "locacao",
    reference: (d.reference ?? fileName.replace(/\.[^.]+$/, "")).slice(0, 160).padEnd(2, "."),
    party_name: d.partyName ?? "Sem nome",
    party_email: z.email().safeParse(d.partyEmail).success ? d.partyEmail : null,
    party_phone: digits(d.partyPhone),
    index_code: d.indexCode!,
    base_date: d.baseDate!,
    period_months: period,
    lag_months: d.lagMonths ?? 1,
    allow_decrease: d.allowDecrease ?? false,
    current_value_cents: d.valueCents!,
    next_adjustment_on: nextDueDate(d.baseDate!, period, null),
    file_path: path,
    file_name: fileName.slice(0, 200),
    extracted: extractedOf(d),
    needs_review: true,
  });
  if (error) {
    logger.error("contracts.import", { message: describeError(error), orgId: gate.org.id });
    await drop();
    return { error: "Não foi possível salvar. Cadastre este à mão." };
  }
  done();
  return { ok: true, reference: d.reference ?? fileName };
}

const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());
const date = z.iso.date("Data inválida.");

const contractSchema = z.object({
  kind: z.enum(["locacao", "venda"]),
  reference: z.string().trim().min(2, "Identifique o contrato (imóvel, unidade, número).").max(160),
  partyName: z.string().trim().min(1, "Informe o nome do cliente.").max(160),
  partyEmail: optional(z.email("E-mail inválido.").max(254)),
  partyPhone: optional(z.string().trim().max(30).refine((v) => digits(v) !== null, "Telefone inválido.")),
  indexCode: z.enum(INDEX_CODES as [string, ...string[]], "Escolha o índice."),
  value: z.string().transform((v, ctx) => {
    const cents = parseMoney(v);
    if (!cents) {
      ctx.addIssue({ code: "custom", message: "Informe o valor." });
      return z.NEVER;
    }
    return cents;
  }),
  baseDate: date,
  lastAdjustedOn: optional(date),
  periodMonths: z.coerce.number().int().min(1, "Mínimo de 1 mês.").max(36, "Máximo de 36 meses."),
  lagMonths: z.coerce.number().int().min(0).max(3),
  allowDecrease: z.preprocess((v) => v === "on", z.boolean()),
  notes: optional(z.string().trim().max(2000)),
  filePath: optional(z.string().max(300)),
  fileName: optional(z.string().trim().max(200)),
  extracted: optional(z.string().max(4000)),
});

/** Cadastra ou edita um contrato. Salvar pela tela é a conferência dos dados. */
export async function saveContract(id: string | null, formData: FormData): Promise<FormState> {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  if (id && !uuid(id)) return { error: "Contrato inválido." };
  const parsed = contractSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  if (v.lastAdjustedOn && v.lastAdjustedOn < v.baseDate) return { fieldErrors: { lastAdjustedOn: "O último reajuste não pode ser antes da data-base." } };
  if (v.filePath && !ownFile(gate.org.id, v.filePath)) return { error: "Arquivo inválido. Anexe de novo." };

  let extracted: unknown = null;
  try {
    extracted = v.extracted ? JSON.parse(v.extracted) : null;
  } catch {
    extracted = null;
  }

  const row = {
    kind: v.kind,
    reference: v.reference,
    party_name: v.partyName,
    party_email: v.partyEmail?.toLowerCase() ?? null,
    party_phone: digits(v.partyPhone),
    index_code: v.indexCode,
    base_date: v.baseDate,
    period_months: v.periodMonths,
    lag_months: v.lagMonths,
    allow_decrease: v.allowDecrease,
    current_value_cents: v.value,
    last_adjusted_on: v.lastAdjustedOn ?? null,
    next_adjustment_on: nextDueDate(v.baseDate, v.periodMonths, v.lastAdjustedOn ?? null),
    notes: v.notes ?? null,
    needs_review: false,
  };

  const supabase = await createClient();
  let contractId = id;
  if (id) {
    const { error } = await supabase.from("contracts").update(row).eq("id", id);
    if (error) {
      logger.error("contracts.update", { message: describeError(error), orgId: gate.org.id });
      return { error: "Não foi possível salvar. Tente de novo." };
    }
    // Dados mudaram: o reajuste pendente é refeito com eles.
    await supabase.from("contract_adjustments").delete().eq("contract_id", id).eq("status", "pending");
  } else {
    const { data, error } = await supabase
      .from("contracts")
      .insert({ ...row, org_id: gate.org.id, file_path: v.filePath ?? null, file_name: v.fileName ?? null, extracted })
      .select("id")
      .single();
    if (error || !data) {
      logger.error("contracts.create", { message: describeError(error), orgId: gate.org.id });
      return { error: "Não foi possível cadastrar. Tente de novo." };
    }
    contractId = data.id as string;
  }

  try {
    await syncIndexes();
    await planAdjustments({ id: gate.org.id, timezone: gate.org.timezone }, contractId!);
  } catch (e) {
    logger.error("contracts.plan", { message: describeError(e), orgId: gate.org.id });
  }
  done();
  return { success: id ? "Contrato atualizado." : "Contrato cadastrado." };
}

/** Encerra (para de reajustar) ou reativa um contrato. */
export async function setContractStatus(id: string, status: "active" | "ended") {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  if (!uuid(id)) return { error: "Contrato inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("contracts").update({ status }).eq("id", id);
  if (error) return { error: "Não foi possível atualizar." };
  if (status === "ended") await supabase.from("contract_adjustments").delete().eq("contract_id", id).eq("status", "pending");
  else await planAdjustments({ id: gate.org.id, timezone: gate.org.timezone }, id).catch(() => 0);
  done();
  return { ok: true };
}

/** Apaga o contrato, os reajustes e o arquivo. */
export async function deleteContract(id: string) {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  if (!uuid(id)) return { error: "Contrato inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("contracts").delete().eq("id", id).select("file_path").maybeSingle();
  if (error) return { error: "Não foi possível apagar." };
  if (data?.file_path) await createAdminClient().storage.from(CONTRACTS_BUCKET).remove([data.file_path as string]);
  done();
  return { ok: true };
}

/** Link temporário para abrir o arquivo do contrato. */
export async function contractFileUrl(id: string) {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  if (!uuid(id)) return { error: "Contrato inválido." };
  const { data: contract } = await (await createClient()).from("contracts").select("file_path").eq("id", id).maybeSingle();
  if (!contract?.file_path) return { error: "Este contrato não tem arquivo." };
  const { data, error } = await createAdminClient().storage.from(CONTRACTS_BUCKET).createSignedUrl(contract.file_path as string, 600);
  if (error || !data) return { error: "Não foi possível abrir o arquivo." };
  return { url: data.signedUrl };
}

const approveSchema = z.object({
  id: z.uuid(),
  finalValue: z.string(),
  letter: z.string().trim().min(10, "A carta está vazia.").max(4000, "A carta passou de 4.000 caracteres."),
});

/**
 * A conferência: a pessoa confirma o valor final (pode ajustar) e a carta.
 * Só aqui o valor do contrato muda.
 */
export async function approveAdjustment(input: { id: string; finalValue: string; letter: string }) {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const finalCents = parseMoney(parsed.data.finalValue);
  if (!finalCents) return { error: "Informe o valor final." };

  const supabase = await createClient();
  const { data: adj } = await supabase
    .from("contract_adjustments")
    .select("id, contract_id, due_on, status, contracts (base_date, period_months)")
    .eq("id", parsed.data.id)
    .maybeSingle<{ id: string; contract_id: string; due_on: string; status: string; contracts: { base_date: string; period_months: number } | null }>();
  if (!adj?.contracts) return { error: "Reajuste não encontrado." };
  if (adj.status !== "pending") return { error: "Este reajuste já foi conferido." };

  const { data: claimed, error } = await supabase
    .from("contract_adjustments")
    .update({ status: "approved", final_value_cents: finalCents, letter_text: parsed.data.letter, reviewed_by: gate.id, reviewed_at: new Date().toISOString() })
    .eq("id", adj.id)
    .eq("status", "pending")
    .select("id");
  if (error || !claimed?.length) return { error: "Não foi possível aprovar. Atualize a página e tente de novo." };

  const { error: contractError } = await supabase
    .from("contracts")
    .update({
      current_value_cents: finalCents,
      last_adjusted_on: adj.due_on,
      next_adjustment_on: nextDueDate(adj.contracts.base_date, adj.contracts.period_months, adj.due_on),
    })
    .eq("id", adj.contract_id);
  if (contractError) logger.error("contracts.approve", { message: describeError(contractError), orgId: gate.org.id });

  // Reajuste atrasado de mais de um ano: o seguinte já aparece para conferir.
  await planAdjustments({ id: gate.org.id, timezone: gate.org.timezone }, adj.contract_id).catch(() => 0);
  done();
  return { ok: true };
}

/** Não aplica este reajuste (negociado, isento...). O valor fica igual e a data anda. */
export async function skipAdjustment(id: string, note: string) {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  if (!uuid(id)) return { error: "Reajuste inválido." };
  const supabase = await createClient();
  const { data: adj } = await supabase
    .from("contract_adjustments")
    .select("id, contract_id, due_on, status, contracts (base_date, period_months)")
    .eq("id", id)
    .maybeSingle<{ id: string; contract_id: string; due_on: string; status: string; contracts: { base_date: string; period_months: number } | null }>();
  if (!adj?.contracts || adj.status !== "pending") return { error: "Reajuste não encontrado." };
  const { data: claimed } = await supabase
    .from("contract_adjustments")
    .update({ status: "skipped", note: note.trim().slice(0, 500) || null, reviewed_by: gate.id, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (!claimed?.length) return { error: "Não foi possível atualizar." };
  await supabase
    .from("contracts")
    .update({ last_adjusted_on: adj.due_on, next_adjustment_on: nextDueDate(adj.contracts.base_date, adj.contracts.period_months, adj.due_on) })
    .eq("id", adj.contract_id);
  await planAdjustments({ id: gate.org.id, timezone: gate.org.timezone }, adj.contract_id).catch(() => 0);
  done();
  return { ok: true };
}

/** Manda a carta aprovada por e-mail ao cliente. A resposta volta para quem enviou. */
export async function sendLetterEmail(id: string) {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  if (!uuid(id)) return { error: "Reajuste inválido." };
  const supabase = await createClient();
  const { data: adj } = await supabase
    .from("contract_adjustments")
    .select("id, status, letter_text, contracts (reference, party_email, kind)")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; letter_text: string | null; contracts: { reference: string; party_email: string | null; kind: string } | null }>();
  if (!adj?.contracts || adj.status !== "approved" || !adj.letter_text) return { error: "Aprove o reajuste antes de enviar." };
  if (!adj.contracts.party_email) return { error: "O contrato não tem e-mail do cliente. Edite o contrato ou envie pelo WhatsApp." };

  const { data: auth } = await supabase.auth.getUser();
  const result = await sendAdjustmentLetterEmail({
    to: adj.contracts.party_email,
    subject: `Reajuste ${adj.contracts.kind === "locacao" ? "do aluguel" : "do contrato"}: ${adj.contracts.reference}`,
    letter: adj.letter_text,
    orgName: gate.org.name,
    senderEmail: auth.user?.email ?? undefined,
  });
  if (!result.ok) return { error: result.error ?? "Falha ao enviar o e-mail." };
  await supabase.from("contract_adjustments").update({ sent_at: new Date().toISOString() }).eq("id", id);
  done();
  return { ok: true };
}

/** Marca a carta como enviada (por WhatsApp ou em mãos). */
export async function markLetterSent(id: string) {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  if (!uuid(id)) return { error: "Reajuste inválido." };
  const { error } = await (await createClient()).from("contract_adjustments").update({ sent_at: new Date().toISOString() }).eq("id", id).eq("status", "approved");
  if (error) return { error: "Não foi possível atualizar." };
  done();
  return { ok: true };
}

/** Busca os índices novos e recalcula os reajustes pendentes. */
export async function refreshAdjustments() {
  const gate = await requireContracts();
  if ("error" in gate) return gate;
  try {
    await syncIndexes();
    const created = await planAdjustments({ id: gate.org.id, timezone: gate.org.timezone });
    done();
    return { ok: true, created };
  } catch (e) {
    logger.error("contracts.refresh", { message: describeError(e), orgId: gate.org.id });
    return { error: "Não foi possível atualizar agora. Tente de novo em instantes." };
  }
}