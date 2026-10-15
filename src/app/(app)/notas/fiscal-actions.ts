"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember, orgCanWrite } from "@/lib/auth";
import { lookupCep, type Address } from "@/lib/cep";
import { isCnpj, onlyDigits } from "@/lib/document";
import { describeError, logger } from "@/lib/logger";
import { parseMoney } from "@/lib/money";
import { cancelNational, issueNational, nfseConfigured, ORG_FISCAL_COLUMNS, orgFiscalComplete, type FiscalProfile, type OrgFiscal } from "@/lib/nfse";
import { seal } from "@/lib/secret-box";
import { InvalidCertificatePasswordError, parsePfx } from "open-nfse";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation";

const NOT_CONFIGURED = { error: "A emissão de notas ainda não foi ativada no Pulse. Fale com o suporte." };

/** Endereço pelo CEP, para preencher o formulário. */
export async function lookupAddress(cep: string): Promise<Address | null> {
  await getCurrentMember();
  return lookupCep(cep);
}

const cnpjField = z
  .string()
  .transform((v) => onlyDigits(v))
  .refine((v) => isCnpj(v), "CNPJ inválido.");

const profileSchema = z.object({
  cnpj: cnpjField,
  legalName: z.string().trim().min(2, "Informe a razão social.").max(150),
  municipalRegistration: z.string().trim().max(20).optional(),
  simplesOption: z.enum(["1", "2", "3"], "Escolha o regime."),
  simplesRate: z.string().optional(),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.email("E-mail inválido.").max(80).optional()),
  cep: z.string().transform((v) => onlyDigits(v)).refine((v) => v.length === 8, "CEP inválido."),
  street: z.string().trim().min(2, "Informe a rua.").max(255),
  number: z.string().trim().min(1, "Informe o número.").max(60),
  district: z.string().trim().min(2, "Informe o bairro.").max(60),
  certificatePassword: z.string().max(200).optional(),
});

/**
 * Cadastro fiscal do corretor. O certificado digital é conferido aqui (senha,
 * validade e CNPJ) e guardado criptografado: só o servidor do Pulse consegue
 * usá-lo, e apenas para emitir e cancelar as notas do próprio corretor.
 */
export async function saveFiscalProfile(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role !== "broker") return { error: "Só o corretor cadastra os próprios dados fiscais." };
  if (!nfseConfigured()) return NOT_CONFIGURED;

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  let simplesRate: number | null = null;
  if (v.simplesOption === "3") {
    simplesRate = Number((v.simplesRate ?? "").replace(",", "."));
    if (!v.simplesRate || !Number.isFinite(simplesRate) || simplesRate < 0 || simplesRate >= 100) {
      return { fieldErrors: { simplesRate: "Informe a alíquota do Simples, por exemplo 6 ou 15,5." } };
    }
  }

  const limit = await rateLimit(`fiscal-profile:${me.id}`, 10, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };

  // Cidade e código IBGE vêm sempre do CEP, conferido aqui no servidor.
  const address = await lookupCep(v.cep);
  if (!address) return { fieldErrors: { cep: "CEP não encontrado." } };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("fiscal_profiles").select("certificate_encrypted, cnpj").eq("member_id", me.id).maybeSingle();

  const certificate = formData.get("certificate");
  const hasCertificate = certificate instanceof File && certificate.size > 0;
  if (!hasCertificate && !existing?.certificate_encrypted) return { fieldErrors: { certificate: "Anexe o certificado digital (arquivo .pfx ou .p12)." } };
  if (!hasCertificate && existing?.cnpj !== v.cnpj) return { fieldErrors: { certificate: "Mudou o CNPJ: anexe o certificado digital do novo CNPJ." } };
  if (hasCertificate && certificate.size > 100_000) return { fieldErrors: { certificate: "Arquivo grande demais para um certificado A1." } };
  if (hasCertificate && !v.certificatePassword) return { fieldErrors: { certificatePassword: "Informe a senha do certificado." } };

  let secrets = {};
  if (hasCertificate) {
    const pfx = Buffer.from(await certificate.arrayBuffer());
    let cert: ReturnType<typeof parsePfx>;
    try {
      cert = parsePfx(pfx, v.certificatePassword ?? "");
    } catch (error) {
      return {
        fieldErrors:
          error instanceof InvalidCertificatePasswordError
            ? { certificatePassword: "Senha do certificado incorreta." }
            : { certificate: "Não foi possível abrir o certificado. Confira o arquivo e a senha." },
      };
    }
    if (cert.expiresOn.getTime() <= Date.now()) return { fieldErrors: { certificate: "Esse certificado já venceu." } };
    // O e-CNPJ traz o CNPJ no nome do titular: confere com o informado.
    const certCnpj = cert.subject.match(/\d{14}/)?.[0];
    if (certCnpj && certCnpj !== v.cnpj) return { fieldErrors: { certificate: "Esse certificado é de outro CNPJ." } };
    secrets = {
      certificate_encrypted: seal(pfx),
      certificate_password_encrypted: seal(v.certificatePassword ?? ""),
      certificate_subject: cert.subject.slice(0, 500),
      certificate_valid_until: cert.expiresOn.toISOString(),
    };
  }

  const { error } = await admin.from("fiscal_profiles").upsert({
    member_id: me.id,
    org_id: me.org.id,
    cnpj: v.cnpj,
    legal_name: v.legalName,
    municipal_registration: v.municipalRegistration || null,
    simples_option: Number(v.simplesOption) as 1 | 2 | 3,
    simples_rate: simplesRate,
    email: v.email ?? null,
    cep: v.cep,
    street: v.street,
    number: v.number,
    district: v.district,
    city: address.city,
    uf: address.uf,
    city_ibge: address.ibge,
    ...secrets,
    status: "active",
    last_error: null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    logger.error("nfse.profile", { message: describeError(error), orgId: me.org.id });
    return { error: "Não foi possível salvar. Tente de novo." };
  }

  revalidatePath("/notas");
  return { success: "Dados fiscais salvos. Você já pode emitir notas pelo Pulse." };
}

const orgSchema = z.object({
  legalName: z.string().trim().min(2, "Informe a razão social.").max(150),
  cnpj: cnpjField,
  email: z.preprocess((v) => (v === "" ? undefined : v), z.email("E-mail inválido.").max(80).optional()),
  cep: z.string().transform((v) => onlyDigits(v)).refine((v) => v.length === 8, "CEP inválido."),
  street: z.string().trim().min(2, "Informe a rua.").max(255),
  number: z.string().trim().min(1, "Informe o número.").max(60),
  district: z.string().trim().min(2, "Informe o bairro.").max(60),
  serviceCode: z.string().trim().regex(/^\d{6}$/, "O código tem 6 números."),
});

/** Dados da imobiliária como tomadora das notas dos corretores. Só o administrador. */
export async function saveOrgFiscal(_: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentMember();
  if (me.role !== "owner") return { error: "Só o administrador altera os dados fiscais da imobiliária." };
  const parsed = orgSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const address = await lookupCep(v.cep);
  if (!address) return { fieldErrors: { cep: "CEP não encontrado." } };

  const { error } = await createAdminClient()
    .from("organizations")
    .update({
      fiscal_legal_name: v.legalName,
      fiscal_cnpj: v.cnpj,
      fiscal_email: v.email ?? null,
      fiscal_cep: v.cep,
      fiscal_street: v.street,
      fiscal_number: v.number,
      fiscal_district: v.district,
      fiscal_city: address.city,
      fiscal_uf: address.uf,
      fiscal_city_ibge: address.ibge,
      nfse_service_code: v.serviceCode,
    })
    .eq("id", me.org.id);
  if (error) return { error: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/notas");
  revalidatePath("/conta");
  return { success: "Dados fiscais da imobiliária salvos." };
}

const issueSchema = z.object({
  amount: z.string().transform((v, ctx) => {
    const cents = parseMoney(v);
    if (!cents) ctx.addIssue({ code: "custom", message: "Informe o valor da nota." });
    return cents ?? 0;
  }),
  description: z.string().trim().min(5, "Descreva o serviço (aparece na nota).").max(1000),
  competence: z.iso.date("Informe a competência."),
  commissionId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
});

/** Emite a NFS-e do corretor contra a imobiliária, direto na API nacional. */
export async function issueInvoice(_: FormState & { invoiceId?: string }, formData: FormData): Promise<FormState & { invoiceId?: string }> {
  const me = await getCurrentMember();
  if (me.role !== "broker") return { error: "Só o corretor emite nota fiscal." };
  if (!orgCanWrite(me.org)) return { error: "A assinatura da imobiliária está inativa." };
  if (!nfseConfigured()) return NOT_CONFIGURED;

  const parsed = issueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const limit = await rateLimit(`nfse-issue:${me.id}`, 20, 60 * 60);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfterSec) };

  const admin = createAdminClient();
  const [{ data: profile }, { data: org }] = await Promise.all([
    admin.from("fiscal_profiles").select("*").eq("member_id", me.id).maybeSingle<FiscalProfile>(),
    admin.from("organizations").select(ORG_FISCAL_COLUMNS).eq("id", me.org.id).single<OrgFiscal>(),
  ]);
  if (!profile || profile.status !== "active" || !profile.certificate_encrypted) return { error: "Cadastre seus dados fiscais antes de emitir." };
  if (profile.certificate_valid_until && new Date(profile.certificate_valid_until).getTime() <= Date.now()) {
    return { error: "Seu certificado digital venceu. Envie o novo em Dados fiscais." };
  }
  if (!orgFiscalComplete(org)) return { error: "A imobiliária ainda não cadastrou os dados fiscais dela. Avise o administrador." };

  if (v.commissionId) {
    const { data: commission } = await (await createClient()).from("commissions").select("id").eq("id", v.commissionId).eq("member_id", me.id).maybeSingle();
    if (!commission) return { fieldErrors: { commissionId: "Comissão inválida." } };
  }

  const { data: invoice, error: insertError } = await admin
    .from("invoices")
    .insert({
      org_id: me.org.id,
      member_id: me.id,
      commission_id: v.commissionId ?? null,
      number: "em emissão",
      amount_cents: v.amount,
      issued_on: v.competence,
      description: v.description.slice(0, 200),
      source: "national",
      status: "processing",
    })
    .select("id, org_id, member_id, amount_cents, description")
    .single();
  if (insertError || !invoice) {
    logger.error("nfse.insert", { message: describeError(insertError), orgId: me.org.id });
    return { error: "Não foi possível registrar a nota. Tente de novo." };
  }

  const result = await issueNational({ invoice, profile, org, description: v.description, competence: v.competence });
  revalidatePath("/notas");
  if (result.status === "error") return { error: `A nota não foi emitida: ${result.message}`, invoiceId: invoice.id };
  if (result.status === "processing") {
    return {
      success: "O sistema da NFS-e está instável agora. A nota ficou na fila e o Pulse reenvia sozinho; você recebe um aviso quando for autorizada.",
      invoiceId: invoice.id,
    };
  }
  return { success: "Nota autorizada e enviada à liderança.", invoiceId: invoice.id };
}

/** Situação atual de uma nota (a tela consulta enquanto ela está na fila). */
export async function syncInvoiceNow(invoiceId: string) {
  if (!z.uuid().safeParse(invoiceId).success) return { status: "error" };
  await getCurrentMember();
  // O RLS garante que só quem pode ver a nota consegue consultar.
  const { data } = await (await createClient()).from("invoices").select("status").eq("id", invoiceId).maybeSingle();
  if (!data) return { status: "error" };
  if (data.status !== "processing") revalidatePath("/notas");
  return { status: data.status as string };
}

/** O corretor cancela a própria nota emitida, enquanto ela não foi paga e dentro do prazo da prefeitura. */
export async function cancelIssuedInvoice(invoiceId: string, justification: string) {
  const me = await getCurrentMember();
  if (!z.uuid().safeParse(invoiceId).success) return { error: "Pedido inválido." };
  const reason = justification.trim();
  if (reason.length < 15) return { error: "Explique o motivo do cancelamento (pelo menos 15 letras)." };
  if (!nfseConfigured()) return NOT_CONFIGURED;

  const admin = createAdminClient();
  const { data: invoice } = await admin.from("invoices").select("id, member_id, status, source, nfse_access_key").eq("id", invoiceId).maybeSingle();
  if (!invoice || invoice.member_id !== me.id || invoice.source !== "national" || !invoice.nfse_access_key) return { error: "Nota não encontrada." };
  if (!["sent", "checked", "rejected"].includes(invoice.status as string)) return { error: "Essa nota não pode mais ser cancelada pelo Pulse." };

  const { data: profile } = await admin.from("fiscal_profiles").select("*").eq("member_id", me.id).maybeSingle<FiscalProfile>();
  if (!profile) return { error: "Cadastre seus dados fiscais antes de cancelar." };

  const result = await cancelNational(profile, invoice.nfse_access_key as string, reason);
  if (result.status === "error") return { error: result.message };
  if (result.status === "pending") return { error: "O sistema da NFS-e está instável. O cancelamento ficou na fila e o Pulse confirma sozinho." };
  await admin.from("invoices").update({ status: "canceled", review_note: reason.slice(0, 300), status_changed_at: new Date().toISOString() }).eq("id", invoiceId);
  revalidatePath("/notas");
  return { ok: true };
}
