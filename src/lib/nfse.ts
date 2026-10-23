import "server-only";
import {
  Ambiente,
  ExpiredCertificateError,
  gerarDanfse,
  InvalidCertificatePasswordError,
  JustificativaCancelamento,
  NfseClient,
  OpcaoSimplesNacional,
  OpenNfseError,
  ReceitaRejectionError,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAmbienteDps,
  type NfseEmitResult,
  type PendingEvent,
  type RetryStore,
} from "open-nfse";
import { nfseEnv } from "@/lib/env.server";
import { describeError, logger } from "@/lib/logger";
import { formatMoney } from "@/lib/metrics";
import { notifyLeadersOf, notifyUsers } from "@/lib/notify";
import { open } from "@/lib/secret-box";
import { createAdminClient } from "@/lib/supabase/admin";

// Emissão de NFS-e direto na API oficial do Sistema Nacional (nfse.gov.br),
// pela biblioteca open-nfse: sem intermediário e sem custo por nota. O corretor
// é o prestador (com o certificado A1 dele) e a empresa é a tomadora.

export type FiscalProfile = {
  member_id: string;
  org_id: string;
  cnpj: string;
  legal_name: string;
  municipal_registration: string | null;
  simples_option: 1 | 2 | 3;
  simples_rate: number | null;
  email: string | null;
  cep: string;
  street: string;
  number: string;
  district: string;
  city: string;
  uf: string;
  city_ibge: string;
  certificate_encrypted: string | null;
  certificate_password_encrypted: string | null;
  certificate_subject: string | null;
  certificate_valid_until: string | null;
  status: "pending" | "active" | "error";
  last_error: string | null;
};

export type OrgFiscal = {
  fiscal_legal_name: string | null;
  fiscal_cnpj: string | null;
  fiscal_email: string | null;
  fiscal_cep: string | null;
  fiscal_street: string | null;
  fiscal_number: string | null;
  fiscal_district: string | null;
  fiscal_city: string | null;
  fiscal_uf: string | null;
  fiscal_city_ibge: string | null;
  nfse_service_code: string;
};

export type CompleteOrgFiscal = OrgFiscal & {
  fiscal_cnpj: string;
  fiscal_legal_name: string;
  fiscal_city_ibge: string;
  fiscal_cep: string;
  fiscal_street: string;
  fiscal_number: string;
  fiscal_district: string;
};

export const ORG_FISCAL_COLUMNS =
  "fiscal_legal_name, fiscal_cnpj, fiscal_email, fiscal_cep, fiscal_street, fiscal_number, fiscal_district, fiscal_city, fiscal_uf, fiscal_city_ibge, nfse_service_code";

export function orgFiscalComplete(o: OrgFiscal | null): o is CompleteOrgFiscal {
  return Boolean(o?.fiscal_cnpj && o.fiscal_legal_name && o.fiscal_city_ibge && o.fiscal_cep && o.fiscal_street && o.fiscal_number && o.fiscal_district);
}

/** A emissão só liga com NFSE_ENV e NFSE_CERT_KEY configurados no servidor. */
export function nfseConfigured() {
  try {
    nfseEnv();
    return true;
  } catch {
    return false;
  }
}

export function nfseProduction() {
  return nfseEnv().env === "producao";
}

const ambiente = () => (nfseProduction() ? Ambiente.Producao : Ambiente.ProducaoRestrita);
// A biblioteca usa homologação quando o ambiente da nota não é informado:
// passa sempre explícito para nunca emitir no ambiente errado.
const tpAmb = () => (nfseProduction() ? TipoAmbienteDps.Producao : TipoAmbienteDps.Homologacao);

// Série própria do Pulse, para a numeração não colidir com notas que o
// corretor emita em outro sistema com o mesmo CNPJ.
const DPS_SERIE = "77";

/** Mensagem legível para o corretor a partir de um erro da emissão. */
export function nfseErrorMessage(error: unknown) {
  if (error instanceof ReceitaRejectionError) {
    return error.mensagens
      .map((m) => `${m.descricao}${m.complemento ? ` (${m.complemento})` : ""} [${m.codigo}]`)
      .join(" ")
      .slice(0, 1000);
  }
  if (error instanceof InvalidCertificatePasswordError) return "A senha do certificado digital está incorreta.";
  if (error instanceof ExpiredCertificateError) return "O certificado digital venceu. Envie o novo em Dados fiscais.";
  if (error instanceof OpenNfseError) return error.message.slice(0, 1000);
  return "Não foi possível falar com o sistema da NFS-e agora. Tente de novo em alguns minutos.";
}

// Fila de reenvio no banco (tabela nfse_pending), separada por corretor.
// A biblioteca exige que as datas voltem como Date.
function retryStoreFor(memberId: string): RetryStore {
  const admin = createAdminClient();
  return {
    async save(entry) {
      const { error } = await admin.from("nfse_pending").upsert({
        id: entry.id,
        member_id: memberId,
        payload: entry,
        not_before: entry.notBefore?.toISOString() ?? null,
      });
      if (error) throw new Error(`nfse_pending.save: ${error.message}`);
    },
    async list() {
      const { data, error } = await admin.from("nfse_pending").select("payload").eq("member_id", memberId).order("created_at");
      if (error) throw new Error(`nfse_pending.list: ${error.message}`);
      return (data ?? []).map(({ payload }) => {
        const p = payload as Record<string, unknown>;
        return {
          ...p,
          firstAttemptAt: new Date(p.firstAttemptAt as string),
          lastAttemptAt: new Date(p.lastAttemptAt as string),
          notBefore: p.notBefore ? new Date(p.notBefore as string) : undefined,
        } as PendingEvent;
      });
    },
    async delete(id) {
      await admin.from("nfse_pending").delete().eq("id", id).eq("member_id", memberId);
    },
  };
}

/** Cliente da API nacional com o certificado do corretor. Feche com close() ao terminar. */
function clientFor(profile: FiscalProfile) {
  if (!profile.certificate_encrypted || !profile.certificate_password_encrypted) throw new Error("Certificado digital não cadastrado.");
  const admin = createAdminClient();
  return new NfseClient({
    ambiente: ambiente(),
    certificado: {
      pfx: open(profile.certificate_encrypted),
      password: open(profile.certificate_password_encrypted).toString("utf8"),
    },
    retryStore: retryStoreFor(profile.member_id),
    dpsCounter: {
      // Número da DPS tirado de forma atômica no banco (update ... returning).
      async next() {
        const { data, error } = await admin.rpc("take_dps_number", { p_member: profile.member_id });
        if (error || typeof data !== "number") throw new Error("Não foi possível numerar a nota.");
        return String(data);
      },
    },
  });
}

type InvoiceRow = { id: string; org_id: string; member_id: string; amount_cents: number; description: string };

/**
 * Grava a nota autorizada: número, chave de acesso, PDF (DANFSe) e XML no
 * armazenamento privado. Avisa a liderança e, quando a autorização chegou
 * depois (pela fila de reenvio), também o corretor.
 */
async function finishIssued(invoice: InvoiceRow, result: NfseEmitResult, notifyBroker: boolean) {
  const admin = createAdminClient();
  const number = result.nfse.infNFSe.nNFSe;
  const { error } = await admin
    .from("invoices")
    .update({
      status: "sent",
      number,
      nfse_number: number,
      nfse_access_key: result.chaveAcesso,
      nfse_dps_id: result.idDps,
      issue_error: null,
      status_changed_at: new Date().toISOString(),
    })
    .eq("id", invoice.id);
  if (error) logger.error("nfse.finish", { message: error.message, orgId: invoice.org_id });

  // O PDF é gerado aqui (o governo deixou de gerar o DANFSe em 08/2026).
  // Se falhar, a nota continua válida: o XML fica guardado.
  const base = `${invoice.org_id}/${invoice.member_id}/${invoice.id}`;
  try {
    await admin.storage.from("invoices").upload(`${base}.xml`, result.xmlNfse, { contentType: "application/xml", upsert: true });
    const pdf = await gerarDanfse(result.nfse, { ambiente: ambiente() });
    const { error: uploadError } = await admin.storage.from("invoices").upload(`${base}.pdf`, pdf, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    await admin.from("invoices").update({ file_path: `${base}.pdf`, file_name: `NFS-e ${number}.pdf` }).eq("id", invoice.id);
  } catch (err) {
    logger.error("nfse.danfse", { message: describeError(err), orgId: invoice.org_id });
  }

  const { data: member } = await admin.from("members").select("user_id, full_name, team_id, division_id").eq("id", invoice.member_id).single();
  if (!member) return;
  await notifyLeadersOf(
    { orgId: invoice.org_id, teamId: member.team_id, divisionId: member.division_id },
    {
      kind: "invoice_sent",
      title: "Nova nota fiscal emitida",
      body: `${member.full_name} emitiu a nota nº ${number} de ${formatMoney(invoice.amount_cents)}: ${invoice.description}.`,
      url: "/notas",
    },
  );
  if (notifyBroker) {
    await notifyUsers(invoice.org_id, [member.user_id], {
      kind: "invoice_issued",
      title: "Nota fiscal autorizada",
      body: `Sua nota nº ${number} de ${formatMoney(invoice.amount_cents)} foi autorizada e enviada à liderança.`,
      url: "/notas",
    });
  }
}

async function failIssued(invoice: InvoiceRow, message: string) {
  const admin = createAdminClient();
  await admin
    .from("invoices")
    .update({ status: "error", issue_error: message.slice(0, 1000), status_changed_at: new Date().toISOString() })
    .eq("id", invoice.id)
    .eq("status", "processing");
  const { data: member } = await admin.from("members").select("user_id").eq("id", invoice.member_id).single();
  if (member) {
    await notifyUsers(invoice.org_id, [member.user_id], { kind: "invoice_error", title: "Nota fiscal não autorizada", body: message.slice(0, 180), url: "/notas" });
  }
}

/**
 * Emite a nota já registrada como "emitindo". Responde na hora: autorizada,
 * recusada (com o motivo da Receita) ou na fila, quando o sistema nacional
 * está fora do ar; nesse caso a rotina reenvia sozinha.
 */
export async function issueNational(input: {
  invoice: InvoiceRow;
  profile: FiscalProfile;
  org: CompleteOrgFiscal;
  description: string;
  competence: string;
}): Promise<{ status: "sent" | "processing" } | { status: "error"; message: string }> {
  const { invoice, profile, org } = input;
  let client: NfseClient | null = null;
  try {
    client = clientFor(profile);
    const opSimpNac =
      profile.simples_option === 2 ? OpcaoSimplesNacional.Mei : profile.simples_option === 3 ? OpcaoSimplesNacional.MeEpp : OpcaoSimplesNacional.NaoOptante;
    const result = await client.emitir({
      tpAmb: tpAmb(),
      serie: DPS_SERIE,
      dCompet: new Date(`${input.competence}T12:00:00-03:00`),
      emitente: {
        cnpj: profile.cnpj,
        codMunicipio: profile.city_ibge,
        ...(profile.municipal_registration ? { inscricaoMunicipal: profile.municipal_registration } : {}),
        regime: {
          opSimpNac,
          regEspTrib: RegimeEspecialTributacao.Nenhum,
          ...(opSimpNac === OpcaoSimplesNacional.MeEpp ? { regApTribSN: RegimeApuracaoSimplesNacional.FederalEMunicipalPeloSN } : {}),
        },
        ...(profile.email ? { email: profile.email } : {}),
      },
      tomador: {
        documento: { CNPJ: org.fiscal_cnpj },
        nome: org.fiscal_legal_name,
        ...(org.fiscal_email ? { email: org.fiscal_email } : {}),
        endereco: {
          codMunicipio: org.fiscal_city_ibge,
          cep: org.fiscal_cep,
          logradouro: org.fiscal_street,
          numero: org.fiscal_number,
          bairro: org.fiscal_district,
        },
      },
      servico: {
        cTribNac: org.nfse_service_code,
        descricao: input.description,
        codMunicipioPrestacao: org.fiscal_city_ibge,
      },
      valores: {
        vServ: Math.round(invoice.amount_cents) / 100,
        // Total aproximado de tributos: MEI dispensa; ME/EPP informa a alíquota
        // do Simples; quem não é do Simples informa em percentual.
        ...(opSimpNac === OpcaoSimplesNacional.MeEpp ? { pTotTribSN: Number(profile.simples_rate ?? 0) } : {}),
        ...(opSimpNac === OpcaoSimplesNacional.NaoOptante ? { pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } } : {}),
      },
    });

    if (result.status === "ok") {
      await finishIssued(invoice, result.nfse, false);
      return { status: "sent" };
    }
    await createAdminClient().from("invoices").update({ nfse_dps_id: result.pending.idDps }).eq("id", invoice.id);
    logger.warn("nfse.pending", { message: describeError(result.error), orgId: invoice.org_id });
    return { status: "processing" };
  } catch (error) {
    if (!(error instanceof OpenNfseError)) logger.error("nfse.issue", { message: describeError(error), orgId: invoice.org_id });
    const message = nfseErrorMessage(error);
    await createAdminClient()
      .from("invoices")
      .update({ status: "error", issue_error: message, status_changed_at: new Date().toISOString() })
      .eq("id", invoice.id);
    return { status: "error", message };
  } finally {
    await client?.close();
  }
}

/** Cancela uma nota autorizada na API nacional. */
export async function cancelNational(profile: FiscalProfile, accessKey: string, reason: string) {
  let client: NfseClient | null = null;
  try {
    client = clientFor(profile);
    const result = await client.cancelar({
      chaveAcesso: accessKey,
      autor: { CNPJ: profile.cnpj },
      cMotivo: JustificativaCancelamento.Outros,
      xMotivo: reason.slice(0, 255),
      tpAmb: tpAmb(),
      retryStore: retryStoreFor(profile.member_id),
    });
    return result.status === "ok" ? ({ status: "canceled" } as const) : ({ status: "pending" } as const);
  } catch (error) {
    if (!(error instanceof OpenNfseError)) logger.error("nfse.cancel", { message: describeError(error), orgId: profile.org_id });
    return { status: "error", message: nfseErrorMessage(error) } as const;
  } finally {
    await client?.close();
  }
}

/**
 * Rotina (de hora em hora): reenvia as notas e cancelamentos que ficaram na
 * fila porque o sistema nacional estava fora do ar. Roda um corretor por vez:
 * a biblioteca exige que o reenvio nunca rode em paralelo.
 */
export async function replayPendingNfse() {
  const admin = createAdminClient();
  const { data: rows } = await admin.from("nfse_pending").select("member_id, payload");
  const byMember = new Map<string, PendingEvent[]>();
  for (const row of rows ?? []) byMember.set(row.member_id, [...(byMember.get(row.member_id) ?? []), row.payload as PendingEvent]);

  let done = 0;
  for (const [memberId, pending] of byMember) {
    const { data: profile } = await admin.from("fiscal_profiles").select("*").eq("member_id", memberId).maybeSingle<FiscalProfile>();
    if (!profile) continue;
    const byId = new Map(pending.map((p) => [p.id, p]));
    let client: NfseClient | null = null;
    try {
      client = clientFor(profile);
      for (const item of await client.replayPendingEvents()) {
        const entry = byId.get(item.id);
        if (!entry || item.status === "still_pending") continue;
        done++;
        if (entry.kind === "emission") {
          const { data: invoice } = await admin
            .from("invoices")
            .select("id, org_id, member_id, amount_cents, description")
            .eq("nfse_dps_id", entry.idDps)
            .maybeSingle<InvoiceRow>();
          if (!invoice) continue;
          if (item.status === "success_emission") await finishIssued(invoice, item.emission, true);
          else if (item.status === "failed_permanent") await failIssued(invoice, nfseErrorMessage(item.error));
        } else if (item.status === "success") {
          await admin
            .from("invoices")
            .update({ status: "canceled", status_changed_at: new Date().toISOString() })
            .eq("nfse_access_key", entry.chaveNfse);
        }
      }
    } catch (error) {
      logger.error("nfse.replay", { message: describeError(error), orgId: profile.org_id });
    } finally {
      await client?.close();
    }
  }
  return done;
}
