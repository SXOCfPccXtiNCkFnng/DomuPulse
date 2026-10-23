import type { Metadata } from "next";
import { requireActivatedMember } from "@/lib/auth";
import { INVOICE_COLUMNS, type Invoice } from "@/lib/invoices";
import { onlyDigits } from "@/lib/document";
import { nfseConfigured, ORG_FISCAL_COLUMNS, orgFiscalComplete, type OrgFiscal } from "@/lib/nfse";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/time";
import { InvoiceBoard } from "./board";

export const metadata: Metadata = { title: "Notas fiscais" };

export default async function NotasPage(props: PageProps<"/notas">) {
  const me = await requireActivatedMember();
  const sp = await props.searchParams;
  const supabase = await createClient();
  const isBroker = me.role === "broker";

  // O RLS decide o que entra: o corretor vê as dele, a liderança as da equipe.
  const [{ data: invoices }, { data: members }, { data: org }, { data: commissions }] = await Promise.all([
    supabase.from("invoices").select(INVOICE_COLUMNS).order("created_at", { ascending: false }).limit(500),
    supabase.from("members").select("id, full_name, role").order("full_name"),
    supabase.from("organizations").select("contact_phone").single(),
    isBroker
      ? supabase.from("commissions").select("id, amount_cents, received_on, description").eq("member_id", me.id).order("received_on", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  const names = Object.fromEntries((members ?? []).map((m) => [m.id as string, m.full_name as string]));
  // Corretores que aparecem no filtro: os de hoje e quem já mandou nota.
  const withInvoices = new Set((invoices ?? []).map((i) => i.member_id as string));
  const brokers = (members ?? [])
    .filter((m) => m.role === "broker" || withInvoices.has(m.id as string))
    .filter((m) => m.id !== me.id)
    .map((m) => ({ id: m.id as string, name: m.full_name as string }));

  const commissionParam = typeof sp.comissao === "string" ? sp.comissao : null;

  // Cadastro fiscal (sem o token secreto) e se a empresa já pode receber notas.
  const admin = createAdminClient();
  const [{ data: profile }, { data: orgFiscal }] = await Promise.all([
    isBroker
      ? admin
          .from("fiscal_profiles")
          .select("cnpj, legal_name, municipal_registration, simples_option, simples_rate, email, cep, street, number, district, city, uf, status, last_error, certificate_valid_until")
          .eq("member_id", me.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("organizations").select(ORG_FISCAL_COLUMNS).eq("id", me.org.id).single<OrgFiscal>(),
  ]);

  return (
    <InvoiceBoard
      isBroker={isBroker}
      invoices={(invoices ?? []) as Invoice[]}
      names={names}
      brokers={brokers}
      commissions={(commissions ?? []).map((c) => ({
        id: c.id as string,
        amountCents: Number(c.amount_cents),
        receivedOn: c.received_on as string,
        description: (c.description as string | null) ?? null,
      }))}
      openWithCommission={isBroker ? commissionParam : null}
      ownerWhatsapp={org?.contact_phone ? onlyDigits(String(org.contact_phone)) : null}
      today={todayIn(me.org.timezone)}
      tomador={
        orgFiscalComplete(orgFiscal)
          ? { cnpj: orgFiscal.fiscal_cnpj, name: orgFiscal.fiscal_legal_name, serviceCode: orgFiscal.nfse_service_code }
          : null
      }
      issuing={{
        enabled: nfseConfigured(),
        orgReady: orgFiscalComplete(orgFiscal),
        isOwner: me.role === "owner",
        profile: profile ?? null,
      }}
    />
  );
}
