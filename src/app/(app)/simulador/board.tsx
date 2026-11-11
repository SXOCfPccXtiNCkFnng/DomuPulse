"use client";

import clsx from "clsx";
import { Building2, Calculator } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import {
  type AmortizationSystem,
  type FinancingConfig,
  formatRate,
  simulateByIncome,
  simulateByProperty,
  TERM_OPTIONS,
} from "@/lib/financing";
import { formatMoney } from "@/lib/metrics";
import { maskMoneyInput, parseMoney } from "@/lib/money";

export type PropOption = {
  id: string;
  title: string;
  kind: string | null;
  neighborhood: string | null;
  city: string | null;
  price_cents: number;
  bedrooms: number | null;
};

type Mode = "income" | "property";

const reais = (s: string) => (parseMoney(s) || 0) / 100;
const money = (v: number) => formatMoney(Math.round(v * 100));

function MoneyField({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint={hint}>
      <span className="relative block">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-muted">R$</span>
        <Input value={value} onChange={(e) => onChange(maskMoneyInput(e.target.value))} inputMode="decimal" placeholder="0" className="pl-11" />
      </span>
    </Field>
  );
}

export function SimuladorBoard({ properties, config }: { properties: PropOption[]; config: FinancingConfig }) {
  const [mode, setMode] = useState<Mode>("income");
  const [system, setSystem] = useState<AmortizationSystem>("price");
  const [months, setMonths] = useState(360);
  const [income, setIncome] = useState("");
  const [down, setDown] = useState("");
  const [propertyValue, setPropertyValue] = useState("");

  const incomeReais = reais(income);
  const downReais = reais(down);
  const propertyReais = reais(propertyValue);

  const incomeResult = useMemo(
    () => (incomeReais > 0 ? simulateByIncome({ incomeReais, downReais, months, system }, config) : null),
    [incomeReais, downReais, months, system, config],
  );
  const propertyResult = useMemo(
    () => (propertyReais > 0 ? simulateByProperty({ propertyReais, downReais, incomeReais, months, system }, config) : null),
    [propertyReais, downReais, incomeReais, months, system, config],
  );

  // Imóveis que cabem no orçamento (modo 1).
  const matches = useMemo(() => {
    if (!incomeResult || incomeResult.maxProperty <= 0) return [];
    const cap = Math.round(incomeResult.maxProperty * 100);
    return properties.filter((p) => p.price_cents <= cap).sort((a, b) => b.price_cents - a.price_cents).slice(0, 12);
  }, [incomeResult, properties]);

  return (
    <div className="flex flex-col gap-5">
      <header className="animate-rise">
        <p className="text-sm text-muted">Financiamento</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Simulador</h1>
        <p className="mt-1 text-xs text-muted">Estimativa com base nas regras públicas (SAC/PRICE, 30% da renda, FGTS). Não é proposta oficial do banco.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Tipo de simulação" className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {([["income", "Quanto consegue"], ["property", "Simular um imóvel"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={clsx("h-8 rounded-lg px-3 text-[13px] font-medium transition-colors", mode === id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Sistema" className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {([["price", "PRICE"], ["sac", "SAC"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={system === id}
              onClick={() => setSystem(id)}
              className={clsx("h-8 rounded-lg px-3 text-[13px] font-medium transition-colors", system === id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="self-start">
          <CardHeader title={mode === "income" ? "Dados do cliente" : "Dados da simulação"} />
          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <MoneyField label="Renda familiar (mês)" hint={mode === "property" ? "Opcional: para checar se a parcela cabe" : "Usada no limite de 30% e no MCMV"} value={income} onChange={setIncome} />
            {mode === "property" ? <MoneyField label="Valor do imóvel" value={propertyValue} onChange={setPropertyValue} /> : null}
            <MoneyField label="Entrada" hint="Inclua o FGTS, se for usar" value={down} onChange={setDown} />
            <Field label="Prazo">
              <Select value={String(months)} onChange={(e) => setMonths(Number(e.target.value))}>
                {TERM_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} meses ({m / 12} anos)
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          {mode === "income" ? (
            incomeResult ? (
              <Card>
                <CardHeader title="Resultado" description={`${system === "price" ? "PRICE" : "SAC"} · ${formatRate(incomeResult.annual)}`} />
                <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
                  <Stat label="Pode comprar até" value={money(incomeResult.maxProperty)} big />
                  <Stat label={system === "sac" ? "Primeira parcela" : "Parcela"} value={`${money(incomeResult.installment)}/mês`} big />
                  <Stat label="Financia" value={money(incomeResult.financed)} />
                  <Stat label="Entrada" value={money(incomeResult.down)} />
                  {incomeResult.lastInstallment ? <Stat label="Última parcela (SAC)" value={`${money(incomeResult.lastInstallment)}/mês`} /> : null}
                  <Stat label="Parcela máxima (30%)" value={`${money(incomeResult.maxInstallment)}/mês`} />
                </div>
                {incomeResult.band ? (
                  <p className="mx-5 mb-5 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-text sm:mx-6">
                    Pela renda, enquadra no <strong>Minha Casa Minha Vida · {incomeResult.band.name}</strong> ({formatRate(incomeResult.band.annualRate)}).
                    {incomeResult.overMcmvCap ? ` Acima do teto de ${money(incomeResult.band.propertyCap)} do programa, vale o crédito normal.` : ""}
                  </p>
                ) : null}
              </Card>
            ) : (
              <EmptyResult />
            )
          ) : propertyResult ? (
            <Card>
              <CardHeader title="Resultado" description={`${system === "price" ? "PRICE" : "SAC"} · ${formatRate(propertyResult.annual)}`} />
              <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
                <Stat label={system === "sac" ? "Primeira parcela" : "Parcela"} value={`${money(propertyResult.installment)}/mês`} big />
                <Stat label="Renda necessária" value={`${money(propertyResult.incomeNeeded)}/mês`} big />
                <Stat label="Entrada mínima" value={money(propertyResult.minDown)} />
                <Stat label="Financia" value={money(propertyResult.financed)} />
                {propertyResult.lastInstallment ? <Stat label="Última parcela (SAC)" value={`${money(propertyResult.lastInstallment)}/mês`} /> : null}
                {propertyResult.fitsIncome !== null ? (
                  <Stat label="Cabe na renda?" value={propertyResult.fitsIncome ? "Sim" : "Não"} tone={propertyResult.fitsIncome ? "ok" : "danger"} />
                ) : null}
              </div>
              {propertyResult.band ? (
                <p className="mx-5 mb-5 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-text sm:mx-6">
                  Pela renda, enquadra no <strong>Minha Casa Minha Vida · {propertyResult.band.name}</strong> ({formatRate(propertyResult.band.annualRate)}).
                </p>
              ) : null}
            </Card>
          ) : (
            <EmptyResult />
          )}

          {mode === "income" && incomeResult && incomeResult.maxProperty > 0 ? (
            <Card>
              <CardHeader title="Imóveis que cabem" description={matches.length ? `${matches.length} à venda até ${money(incomeResult.maxProperty)}` : "Nenhum imóvel cadastrado nesse orçamento"} />
              {matches.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {matches.map((p) => (
                    <li key={p.id}>
                      <Link href="/imoveis" className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                          <Building2 className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {[p.kind, p.bedrooms ? `${p.bedrooms} quartos` : null, p.neighborhood, p.city].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(p.price_cents)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-8 text-center text-sm text-muted sm:px-6">Cadastre imóveis em Imóveis para eles aparecerem aqui.</p>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, big, tone }: { label: string; value: string; big?: boolean; tone?: "ok" | "danger" }) {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={clsx("mt-0.5 font-semibold tabular-nums", big ? "font-display text-xl" : "text-sm", tone === "ok" && "text-ok", tone === "danger" && "text-danger")}>{value}</p>
    </div>
  );
}

function EmptyResult() {
  return (
    <Card>
      <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
        <Calculator className="size-8 text-muted" />
        <p className="font-medium">Preencha os dados ao lado</p>
        <p className="max-w-sm text-sm text-muted">O cálculo aparece aqui na hora, com a parcela, a entrada e os imóveis que cabem.</p>
      </div>
    </Card>
  );
}
