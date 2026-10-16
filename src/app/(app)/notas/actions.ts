"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentMember, orgCanWrite } from "@/lib/auth";
import { INVOICE_FILE_TYPES, INVOICE_MAX_BYTES, INVOICE_STATUS, type InvoiceStatus } from "@/lib/invoices";
import { describeError, logger } from "@/lib/logger";
import { formatMoney } from "@/lib/metrics";
import { parseMoney } from "@/lib/money";
import { notifyLeadersOf, notifyUsers } from "@/lib/notify";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation";

const BUCKET = "invoices";
const READ_ONLY = { error: "A assinatura da imobiliária está inativa. Fale com o administrador." };

/**
 * Primeiro passo do envio: o servidor confere quem é e o arquivo, e devolve um
 * link de envio de uso único. O navegador manda o arquivo direto para a pasta
 * privada, sem passar pelo servidor (que tem limite de tamanho).
 */
export async function prepareInvoiceUpload(file: { name: string; size: number; type: string }) {
  const me = await getCurrentMember();
  if (me.role !== "broker") return { error: "Só o corretor envia nota fiscal." };
  if (!orgCanWrite(me.org)) return READ_ONLY;
  const ext = INVOICE_FILE_TYPES[file.type];
  if (!ext) return { error: "Envie a nota em PDF, XML, JPG ou PNG." };
  if (!(file.size > 0 && file.size <= INVOICE_MAX_BYTES)) return { error: "O arquivo precisa ter até 5 MB." };

  const limit = await rateLimit(`invoice-upload:${me.id}`, 30, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };

  const path = `${me.org.id}/${me.id}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    logger.error("invoice.upload_url", { message: describeError(error), orgId: me.org.id });
    return { error: "Não foi possível preparar o envio. Tente de novo." };
  }
  return { path: data.path, token: data.token };
}

const invoiceSchema = z.object({
  number: z.string().trim().min(1, "Informe o número da nota.").max(40),
  amount: z.string().transform((v, ctx) => {
    const cents = parseMoney(v);
    if (!cents) ctx.addIssue({ code: "custom", message: "Informe o valor da nota." });
    return cents ?? 0;
  }),
  issuedOn: z.iso.date("Informe a data de emissão."),
  description: z.string().trim().min(2, "Diga a que se refere a nota.").max(200),
  notes: z.string().trim().max(500).optional(),
  commissionId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  filePath: z.string().min(1, "Anexe o arquivo da nota."),
  fileName: z.string().trim().min(1).max(200),
});

/** Segundo passo: registra a nota depois que o arquivo chegou, e avisa a liderança. */
export async function createInvoice(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role !== "broker") return { error: "Só o corretor envia nota fiscal." };
  if (!orgCanWrite(me.org)) return READ_ONLY;

  const parsed = invoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  // O arquivo precisa ser deste corretor, na pasta dele, e já ter chegado. O
  // caminho tem que bater exatamente com o formato emitido por
  // prepareInvoiceUpload: nada de "../" ou segmentos extras apontando para
  // outra empresa.
  const expected = new RegExp(`^${me.org.id}/${me.id}/[0-9a-f-]{36}\\.(pdf|xml|jpg|png)$`);
  if (!expected.test(v.filePath)) return { error: "Arquivo inválido. Anexe de novo." };
  const admin = createAdminClient();
  const { error: fileError } = await admin.storage.from(BUCKET).createSignedUrl(v.filePath, 30);
  if (fileError) return { fieldErrors: { filePath: "O arquivo não chegou. Anexe de novo." } };

  // Comissão é opcional, mas, se vier, tem que ser do próprio corretor.
  if (v.commissionId) {
    const { data: commission } = await (await createClient())
      .from("commissions")
      .select("id")
      .eq("id", v.commissionId)
      .eq("member_id", me.id)
      .maybeSingle();
    if (!commission) return { fieldErrors: { commissionId: "Comissão inválida." } };
  }

  const { data: invoice, error } = await admin
    .from("invoices")
    .insert({
      org_id: me.org.id,
      member_id: me.id,
      commission_id: v.commissionId ?? null,
      number: v.number,
      amount_cents: v.amount,
      issued_on: v.issuedOn,
      description: v.description,
      notes: v.notes || null,
      file_path: v.filePath,
      file_name: v.fileName,
    })
    .select("id")
    .single();
  if (error || !invoice) {
    logger.error("invoice.create", { message: describeError(error), orgId: me.org.id });
    return { error: "Não foi possível registrar a nota. Tente de novo." };
  }

  after(() =>
    notifyLeadersOf(
      { orgId: me.org.id, teamId: me.teamId, divisionId: me.divisionId },
      {
        kind: "invoice_sent",
        title: "Nova nota fiscal",
        body: `${me.fullName} enviou a nota nº ${v.number} de ${formatMoney(v.amount)}: ${v.description}.`,
        url: "/notas",
      },
    ),
  );

  revalidatePath("/notas");
  return { success: "Nota enviada. A liderança já foi avisada." };
}

/** A liderança avança a situação (enviada, conferida, paga) ou recusa com motivo. */
export async function setInvoiceStatus(invoiceId: string, status: InvoiceStatus, reviewNote?: string) {
  const me = await getCurrentMember();
  if (me.role === "broker") return { error: "Só a liderança muda a situação da nota." };
  // A liderança só mexe no acompanhamento; emitir, falhar e cancelar vêm do sistema da NFS-e.
  if (!z.uuid().safeParse(invoiceId).success || !["sent", "checked", "paid", "rejected"].includes(status)) return { error: "Pedido inválido." };
  const note = (reviewNote ?? "").trim().slice(0, 300);
  if (status === "rejected" && note.length < 3) return { error: "Diga o motivo da recusa para o corretor corrigir." };

  // O RLS só devolve a nota se ela estiver no escopo de quem pediu.
  const { data: invoice } = await (await createClient())
    .from("invoices")
    .select("id, member_id, number")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice || invoice.member_id === me.id) return { error: "Nota não encontrada." };

  const admin = createAdminClient();
  const { data: owner } = await admin.from("members").select("user_id").eq("id", invoice.member_id).single();
  const { error } = await admin
    .from("invoices")
    .update({
      status,
      review_note: status === "rejected" ? note : null,
      status_changed_at: new Date().toISOString(),
      paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", invoiceId)
    .eq("org_id", me.org.id);
  if (error) return { error: "Não foi possível atualizar. Tente de novo." };

  if (owner) {
    const label = INVOICE_STATUS[status].label.toLowerCase();
    after(() =>
      notifyUsers(me.org.id, [owner.user_id as string], {
        kind: "invoice_status",
        title: `Nota nº ${invoice.number} ${label}`,
        body: status === "rejected" ? `Motivo: ${note}. Corrija e envie de novo.` : `${me.fullName} marcou a sua nota como ${label}.`,
        url: "/notas",
      }),
    );
  }
  revalidatePath("/notas");
  return { ok: true };
}

/** O corretor apaga a própria nota enquanto ela não foi conferida, ou se foi recusada. */
export async function deleteInvoice(invoiceId: string) {
  const me = await getCurrentMember();
  if (!z.uuid().safeParse(invoiceId).success) return { error: "Pedido inválido." };
  const admin = createAdminClient();
  const { data: invoice } = await admin.from("invoices").select("id, member_id, status, file_path, source").eq("id", invoiceId).maybeSingle();
  if (!invoice || invoice.member_id !== me.id) return { error: "Nota não encontrada." };
  // Nota emitida e autorizada não se apaga: precisa ser cancelada na prefeitura.
  const deletable = invoice.source !== "upload" ? ["error"] : ["sent", "rejected"];
  if (!deletable.includes(invoice.status as string)) {
    return { error: invoice.source !== "upload" ? "Nota autorizada não pode ser apagada. Use Cancelar nota." : "Nota já conferida não pode ser apagada." };
  }

  await admin.from("invoices").delete().eq("id", invoiceId);
  if (invoice.file_path) await admin.storage.from(BUCKET).remove([invoice.file_path as string]);
  revalidatePath("/notas");
  return { ok: true };
}

/**
 * Link temporário do arquivo. Para baixar, vale 10 minutos; para mandar por
 * WhatsApp, 7 dias, tempo para a outra pessoa abrir.
 */
export async function invoiceFileLink(invoiceId: string, purpose: "download" | "share") {
  if (!z.uuid().safeParse(invoiceId).success) return { error: "Pedido inválido." };
  const me = await getCurrentMember();
  const { data: invoice } = await (await createClient()).from("invoices").select("id, file_path, nfse_pdf_url").eq("id", invoiceId).maybeSingle();
  if (!invoice) return { error: "Nota não encontrada." };
  if (invoice.nfse_pdf_url) return { url: invoice.nfse_pdf_url as string };
  if (!invoice.file_path) return { error: "Essa nota ainda não tem arquivo." };

  const limit = await rateLimit(`invoice-link:${me.id}`, 60, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };

  const seconds = purpose === "share" ? 7 * 86_400 : 600;
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(invoice.file_path as string, seconds);
  if (error || !data) return { error: "Não foi possível abrir o arquivo." };
  return { url: data.signedUrl };
}
