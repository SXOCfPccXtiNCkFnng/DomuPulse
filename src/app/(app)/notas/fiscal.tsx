"use client";

import { X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { formatMoney } from "@/lib/metrics";
import { centsToInput, maskMoneyInput } from "@/lib/money";
import { formatDate } from "@/lib/time";
import type { FormState } from "@/lib/validation";
import { issueInvoice, lookupAddress, saveFiscalProfile, saveOrgFiscal } from "./fiscal-actions";

export type ProfileView = {
  cnpj: string;
  legal_name: string;
  municipal_registration: string | null;
  simples_option: number;
  simples_rate: number | null;
  email: string | null;
  cep: string;
  street: string;
  number: string;
  district: string;
  city: string;
  uf: string;
  status: "pending" | "active" | "error";
  last_error: string | null;
  certificate_valid_until: string | null;
};

type Commission = { id: string; amountCents: number; receivedOn: string; description: string | null };

const formatCnpj = (v: string) =>
  v.replace(/\D/g, "").slice(0, 14).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
const formatCep = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

/** Janela nativa: mesmo cuidado da ficha do cliente (sem close() na limpeza). */
function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);
  return ref;
}

const dialogClass =
  "m-auto w-[min(38rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50";

/** Endereço com CEP: ao completar o CEP, preenche rua, bairro e cidade. */
function AddressFields({
  initial,
  errors,
}: {
  initial: { cep?: string; street?: string; number?: string; district?: string; city?: string; uf?: string };
  errors?: Record<string, string>;
}) {
  const [cep, setCep] = useState(formatCep(initial.cep ?? ""));
  const [street, setStreet] = useState(initial.street ?? "");
  const [district, setDistrict] = useState(initial.district ?? "");
  const [city, setCity] = useState(initial.city && initial.uf ? `${initial.city}/${initial.uf}` : "");
  const [looking, setLooking] = useState(false);

  async function lookup(value: string) {
    if (value.replace(/\D/g, "").length !== 8) return;
    setLooking(true);
    const address = await lookupAddress(value);
    setLooking(false);
    if (!address) return setCity("CEP não encontrado");
    if (address.street) setStreet(address.street);
    if (address.district) setDistrict(address.district);
    setCity(`${address.city}/${address.uf}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="CEP" hint={looking ? "Buscando endereço..." : city || "Preenche o endereço sozinho"} error={errors?.cep}>
        <Input
          name="cep"
          value={cep}
          inputMode="numeric"
          onChange={(e) => {
            const next = formatCep(e.target.value);
            setCep(next);
            void lookup(next);
          }}
          required
        />
      </Field>
      <Field label="Número" error={errors?.number}>
        <Input name="number" defaultValue={initial.number ?? ""} maxLength={60} required />
      </Field>
      <Field label="Rua" className="sm:col-span-2" error={errors?.street}>
        <Input name="street" value={street} onChange={(e) => setStreet(e.target.value)} maxLength={255} required />
      </Field>
      <Field label="Bairro" className="sm:col-span-2" error={errors?.district}>
        <Input name="district" value={district} onChange={(e) => setDistrict(e.target.value)} maxLength={60} required />
      </Field>
    </div>
  );
}

/** Cadastro fiscal do corretor, com o certificado digital A1. */
export function FiscalProfileDialog({ profile, onClose }: { profile: ProfileView | null; onClose: () => void }) {
  const ref = useModal();
  const [state, action, pending] = useActionState(saveFiscalProfile, {} as FormState);
  const [cnpj, setCnpj] = useState(formatCnpj(profile?.cnpj ?? ""));
  const [regime, setRegime] = useState(String(profile?.simples_option ?? 2));

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} className={dialogClass}>
      <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Seus dados fiscais</h2>
            <p className="text-sm text-muted">Feito uma vez. É com estes dados que as suas notas saem.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </header>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="CNPJ" error={state.fieldErrors?.cnpj}>
            <Input name="cnpj" value={cnpj} onChange={(e) => setCnpj(formatCnpj(e.target.value))} inputMode="numeric" required />
          </Field>
          <Field label="Regime" error={state.fieldErrors?.simplesOption}>
            <Select name="simplesOption" value={regime} onChange={(e) => setRegime(e.target.value)}>
              <option value="2">MEI</option>
              <option value="3">Simples Nacional (ME/EPP)</option>
              <option value="1">Não optante do Simples</option>
            </Select>
          </Field>
          {regime === "3" ? (
            <Field
              label="Alíquota do Simples (%)"
              hint="A do seu último DAS. Seu contador sabe."
              className="sm:col-span-2"
              error={state.fieldErrors?.simplesRate}
            >
              <Input
                name="simplesRate"
                defaultValue={profile?.simples_rate != null ? String(profile.simples_rate).replace(".", ",") : ""}
                inputMode="decimal"
                placeholder="6"
                maxLength={6}
                required
              />
            </Field>
          ) : null}
          <Field label="Razão social" className="sm:col-span-2" error={state.fieldErrors?.legalName}>
            <Input name="legalName" defaultValue={profile?.legal_name ?? ""} maxLength={150} required />
          </Field>
          <Field label="Inscrição municipal" hint="Se tiver" error={state.fieldErrors?.municipalRegistration}>
            <Input name="municipalRegistration" defaultValue={profile?.municipal_registration ?? ""} maxLength={20} inputMode="numeric" />
          </Field>
          <Field label="E-mail para a nota" hint="Opcional" error={state.fieldErrors?.email}>
            <Input name="email" type="email" defaultValue={profile?.email ?? ""} maxLength={80} />
          </Field>
        </div>

        <AddressFields initial={profile ?? {}} errors={state.fieldErrors} />

        <fieldset className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
          <legend className="sr-only">Certificado digital</legend>
          <p className="text-sm font-medium">Certificado digital A1</p>
          <p className="text-xs text-muted">
            {profile?.certificate_valid_until
              ? `Certificado atual válido até ${formatDate(profile.certificate_valid_until.slice(0, 10))}. Envie outro só se for trocar.`
              : "O arquivo .pfx ou .p12 do seu e-CNPJ. Fica guardado criptografado e só é usado para emitir e cancelar as suas notas."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Arquivo do certificado" error={state.fieldErrors?.certificate}>
              <Input name="certificate" type="file" accept=".pfx,.p12,application/x-pkcs12" className="py-2" />
            </Field>
            <Field label="Senha do certificado" error={state.fieldErrors?.certificatePassword}>
              <Input name="certificatePassword" type="password" autoComplete="off" />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Não tem certificado? Você precisa de um <strong>e-CNPJ A1</strong> (arquivo .pfx), válido por 1 ano. Ele é vendido
            por qualquer autoridade certificadora credenciada pela ICP-Brasil. Escolha a que preferir.{" "}
            <a
              href="https://www.google.com/search?q=comprar+certificado+digital+e-CNPJ+A1"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-text underline underline-offset-2"
            >
              Pesquisar no Google
            </a>
          </p>
        </fieldset>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar dados fiscais"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

/** Emitir NFS-e: valor, descrição do serviço e competência. */
export function IssueDialog({
  commissions,
  initialCommission,
  today,
  onIssued,
  onClose,
}: {
  commissions: Commission[];
  initialCommission: string | null;
  today: string;
  onIssued: () => void;
  onClose: () => void;
}) {
  const ref = useModal();
  const [state, action, pending] = useActionState(issueInvoice, {} as FormState & { invoiceId?: string });
  const initial = commissions.find((c) => c.id === initialCommission) ?? null;
  const [commissionId, setCommissionId] = useState(initial?.id ?? "");
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amountCents) : "");
  const [description, setDescription] = useState(
    initial ? `Comissão de intermediação empresa${initial.description ? `: ${initial.description}` : ""}` : "Comissão de intermediação empresa",
  );

  useEffect(() => {
    if (state.success) {
      onIssued();
      onClose();
    }
  }, [state.success, onIssued, onClose]);

  function pickCommission(id: string) {
    setCommissionId(id);
    const c = commissions.find((x) => x.id === id);
    if (c) {
      setAmount(centsToInput(c.amountCents));
      setDescription(`Comissão de intermediação empresa${c.description ? `: ${c.description}` : ""}`);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} className={dialogClass}>
      <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Emitir nota fiscal</h2>
            <p className="text-sm text-muted">Sai no seu CNPJ, contra a empresa. A liderança é avisada quando for autorizada.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </header>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}

        {commissions.length > 0 ? (
          <Field label="Ligar a uma comissão" hint="Opcional. Preenche o valor e a descrição." error={state.fieldErrors?.commissionId}>
            <Select name="commissionId" value={commissionId} onChange={(e) => pickCommission(e.target.value)}>
              <option value="">Nenhuma, é outro valor</option>
              {commissions.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatDate(c.receivedOn)}, {formatMoney(c.amountCents)}
                  {c.description ? `, ${c.description}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor" error={state.fieldErrors?.amount}>
            <span className="relative block">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-muted">R$</span>
              <Input name="amount" value={amount} onChange={(e) => setAmount(maskMoneyInput(e.target.value))} inputMode="decimal" placeholder="5.000" className="pl-11" required />
            </span>
          </Field>
          <Field label="Competência" hint="Mês do serviço" error={state.fieldErrors?.competence}>
            <Input name="competence" type="date" defaultValue={today} max={today} required />
          </Field>
        </div>
        <Field label="Descrição do serviço" hint="Aparece na nota fiscal." error={state.fieldErrors?.description}>
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] hover:border-line-strong focus:border-ink focus:outline-none"
          />
        </Field>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Emitindo..." : "Emitir nota"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

/** Dados da empresa como tomadora das notas (Conta, aba Empresa). */
export function OrgFiscalForm({
  initial,
}: {
  initial: {
    legalName: string;
    cnpj: string;
    email: string;
    cep: string;
    street: string;
    number: string;
    district: string;
    city: string;
    uf: string;
    serviceCode: string;
  };
}) {
  const [state, action, pending] = useActionState(saveOrgFiscal, {} as FormState);
  const [cnpj, setCnpj] = useState(formatCnpj(initial.cnpj));
  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Razão social" className="sm:col-span-2" error={state.fieldErrors?.legalName}>
          <Input name="legalName" defaultValue={initial.legalName} maxLength={150} required />
        </Field>
        <Field label="CNPJ" error={state.fieldErrors?.cnpj}>
          <Input name="cnpj" value={cnpj} onChange={(e) => setCnpj(formatCnpj(e.target.value))} inputMode="numeric" required />
        </Field>
        <Field label="E-mail para receber as notas" hint="Opcional" error={state.fieldErrors?.email}>
          <Input name="email" type="email" defaultValue={initial.email} maxLength={80} />
        </Field>
      </div>
      <AddressFields initial={initial} errors={state.fieldErrors} />
      <Field
        label="Código do serviço na NFS-e nacional"
        hint="Código de tributação nacional (6 números). O padrão é o de corretagem de imóveis; confirme com o seu contador."
        error={state.fieldErrors?.serviceCode}
      >
        <Input name="serviceCode" defaultValue={initial.serviceCode} inputMode="numeric" maxLength={6} className="max-w-40" required />
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar dados fiscais"}
      </Button>
    </form>
  );
}
