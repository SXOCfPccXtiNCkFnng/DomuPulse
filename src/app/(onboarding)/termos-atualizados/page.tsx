import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentMember } from "@/lib/auth";
import { LEGAL_DOCS_VERSION } from "@/lib/legal";
import { formatDate } from "@/lib/time";
import { AcceptTermsForm } from "./form";

export const metadata: Metadata = { title: "Termos atualizados" };

// O que mudou nesta versão, em linguagem simples. Atualize junto com LEGAL_DOCS_VERSION.
const CHANGES = [
  "Emissão de notas fiscais pelos corretores: responsabilidades do corretor, da imobiliária e do emissor parceiro.",
  "Regras mais claras de assinatura, cancelamento, reajuste e suspensão por falta de pagamento ou contestação.",
  "Responsabilidades de cada parte sobre os dados de clientes que a equipe cadastra.",
  "Como pedir uma cópia dos seus dados ou excluir a conta pelo próprio Pulse.",
  "Prazos de guarda de cada tipo de dado e lista dos fornecedores que ajudam a operar o serviço.",
];

export default function UpdatedTermsPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 w-full max-w-2xl animate-pulse rounded-card bg-surface-2" />}>
      <UpdatedTerms />
    </Suspense>
  );
}

async function UpdatedTerms() {
  const me = await getCurrentMember();
  if (me.termsVersion === LEGAL_DOCS_VERSION) redirect("/painel");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 animate-rise">
      <header>
        <p className="flex items-center gap-3 text-[12px] font-semibold tracking-[0.18em] text-brand-text uppercase">
          <span className="h-px w-8 bg-brand-text" />
          Atualização
        </p>
        <h1 className="mt-5 font-display text-[2.1rem] leading-[1.05] font-bold tracking-[-0.03em] sm:text-[2.5rem]">
          Atualizamos os Termos e a <span className="text-brand-text">Privacidade.</span>
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
          Nova versão de {formatDate(LEGAL_DOCS_VERSION)}. Para continuar usando o Pulse, leia e aceite os documentos atualizados.
        </p>
      </header>
      <div className="rounded-card border border-line bg-surface p-5 sm:p-6">
        <p className="text-sm font-semibold">O que mudou</p>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-2">
          {CHANGES.map((c) => (
            <li key={c} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-text" />
              {c}
            </li>
          ))}
        </ul>
      </div>
      <AcceptTermsForm />
    </div>
  );
}
