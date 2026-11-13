"use client";

import clsx from "clsx";
import { Check, ChevronDown, Copy, HardHat, KeyRound, Landmark, PenLine, TriangleAlert, Wand2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, inputClass, Select } from "@/components/ui/field";
import { formatMoney } from "@/lib/metrics";
import { maskMoneyInput, parseMoney } from "@/lib/money";
import type { PropOption } from "./board";

const PRE_DEFAULT = 33;
const POS_DEFAULT = 120;
const MAX_MONTHS = 420;
/** Parcela anual sugerida: até 5x a mensal. */
const ANNUAL_MULT = 5;
const POS_OPTIONS = [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];
const SPLIT_PRESETS = [0, 25, 50, 75, 100];

const reais = (s: string) => (parseMoney(s) || 0) / 100;
const money = (v: number) => formatMoney(Math.round(v * 100));
const toInput = (v: number) => (v > 0 ? maskMoneyInput(v.toFixed(2).replace(".", ",")) : "");

function months(raw: string, fallback: number) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_MONTHS) : fallback;
}

type Phase = { amount: number; months: number; annuals: number; annualValue: number; monthly: number };

function phase(amount: number, monthsRaw: string, fallback: number, annualsRaw: number, annualValueRaw: string): Phase {
  const n = months(monthsRaw, fallback);
  const annuals = Math.min(annualsRaw, Math.floor(n / 12));
  const annualValue = annuals > 0 ? reais(annualValueRaw) : 0;
  const monthly = amount > 0 ? (amount - annuals * annualValue) / n : 0;
  return { amount, months: n, annuals, annualValue, monthly };
}

function MoneyInput({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; className?: string }) {
  return (
    <span className={clsx("relative block", className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">R$</span>
      <Input aria-label={label} value={value} onChange={(e) => onChange(maskMoneyInput(e.target.value))} inputMode="decimal" placeholder={placeholder ?? "0,00"} className="h-10 pl-10 text-right tabular-nums" />
    </span>
  );
}

function MoneyField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <MoneyInput label={label} value={value} onChange={onChange} placeholder={placeholder} />
    </Field>
  );
}

function MonthsInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Field label={label}>
      <Input value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder={placeholder} className="h-10" />
    </Field>
  );
}

/** Linha "rótulo ............ valor" da composição do valor. */
function Line({ sign, label, dot, children }: { sign?: string; label: string; dot?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-3 shrink-0 text-center font-semibold text-muted">{sign}</span>
      {dot ? <span className={clsx("size-2.5 shrink-0 rounded-full", dot)} /> : null}
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <div className="w-40 shrink-0 sm:w-48">{children}</div>
    </div>
  );
}

/** Bloco opcional que abre e fecha (Parcelas da Caixa, Evolução de obra). */
function Extra({ open, onToggle, icon, title, hint, children }: { open: boolean; onToggle: (v: boolean) => void; icon: ReactNode; title: string; hint: string; children: ReactNode }) {
  return (
    <div className={clsx("rounded-xl border transition-colors", open ? "border-brand/40 bg-brand-soft/40" : "border-dashed border-line")}>
      <button type="button" aria-expanded={open} onClick={() => onToggle(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={clsx("grid size-8 shrink-0 place-items-center rounded-lg", open ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted")}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        <span className={clsx("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold", open ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted")}>{open ? "Incluído" : "Incluir"}</span>
        <ChevronDown className={clsx("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}

function PhasePanel({
  icon,
  title,
  amount,
  monthly,
  monthsValue,
  onMonths,
  monthsMax,
  annuals,
  onAnnuals,
  annualValue,
  onAnnualValue,
  children,
}: {
  icon: ReactNode;
  title: string;
  amount: number;
  monthly: number;
  monthsValue: string;
  onMonths: (v: string) => void;
  monthsMax: number;
  annuals: number;
  onAnnuals: (v: number) => void;
  annualValue: string;
  onAnnualValue: (v: string) => void;
  children?: ReactNode;
}) {
  const maxAnnuals = Math.floor(months(monthsValue, monthsMax) / 12);
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-2/60 p-4">
      <div className="flex items-center gap-2">
        <span className="text-muted">{icon}</span>
        <h3 className="flex-1 text-sm font-semibold">{title}</h3>
        <span className="text-sm font-semibold tabular-nums">{amount > 0 ? money(amount) : "—"}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MonthsInput label="Nº de mensais" value={monthsValue} onChange={onMonths} placeholder={`até ${monthsMax}`} />
        <Field label="Anuais">
          <Select value={String(Math.min(annuals, maxAnnuals))} onChange={(e) => onAnnuals(Number(e.target.value))} className="h-10">
            <option value="0">Nenhuma</option>
            {Array.from({ length: maxAnnuals }, (_, i) => i + 1).map((k) => (
              <option key={k} value={k}>
                {k}x
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {annuals > 0 ? <MoneyField label="Valor de cada anual" value={annualValue} onChange={onAnnualValue} /> : null}
      <p className="flex items-baseline justify-between rounded-lg bg-surface px-3 py-2 text-xs text-muted">
        Mensal calculada
        <span className={clsx("text-sm font-semibold tabular-nums", monthly < 0 ? "text-danger" : "text-ink")}>{amount > 0 ? money(monthly) : "—"}</span>
      </p>
      {children}
    </div>
  );
}

export function PaymentFlow({ properties }: { properties: PropOption[] }) {
  const [client, setClient] = useState("");
  const [unit, setUnit] = useState("");
  const [value, setValue] = useState("");
  const [subsidy, setSubsidy] = useState("");
  const [fgts, setFgts] = useState("");
  const [caixa, setCaixa] = useState("");
  const [ato, setAto] = useState("");

  const [showCaixa, setShowCaixa] = useState(false);
  const [caixaFirst, setCaixaFirst] = useState("");
  const [caixaLast, setCaixaLast] = useState("");
  const [caixaMonths, setCaixaMonths] = useState("");

  const [pre, setPre] = useState("");
  const [preMonths, setPreMonths] = useState("");
  const [preAnnuals, setPreAnnuals] = useState(0);
  const [preAnnualValue, setPreAnnualValue] = useState("");

  const [obra, setObra] = useState(false);
  const [obraFirst, setObraFirst] = useState("");
  const [obraLast, setObraLast] = useState("");

  const [posMonths, setPosMonths] = useState("");
  const [posAnnuals, setPosAnnuals] = useState(0);
  const [posAnnualValue, setPosAnnualValue] = useState("");

  const [assistOpen, setAssistOpen] = useState(false);
  const [capacity, setCapacity] = useState("");
  const [keysMonths, setKeysMonths] = useState("");
  const [posMax, setPosMax] = useState(48);
  const [useAnnual, setUseAnnual] = useState(true);
  const [smartMsg, setSmartMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const V = reais(value);
  const S = reais(subsidy);
  const F = reais(fgts);
  const C = reais(caixa);
  const entrada = Math.max(0, V - S - F - C);
  const atoReais = reais(ato);
  const rest = Math.max(0, entrada - atoReais);
  const preAmount = Math.min(reais(pre), rest);
  const keys = months(keysMonths, PRE_DEFAULT);
  const preP = phase(preAmount, preMonths, keys, preAnnuals, preAnnualValue);
  const posP = phase(rest - preAmount, posMonths, POS_DEFAULT, posAnnuals, posAnnualValue);
  const prePct = rest > 0 ? Math.round((preAmount / rest) * 100) : 0;

  const obraFirstR = obra ? reais(obraFirst) : 0;
  const obraLastR = obra ? reais(obraLast) : 0;
  const caixaFirstR = showCaixa ? reais(caixaFirst) : 0;
  const caixaLastR = showCaixa ? reais(caixaLast) : 0;

  const warnings: string[] = [];
  if (V > 0 && S + F + C > V) warnings.push("Subsídio + FGTS + Caixa passam do valor do imóvel.");
  if (atoReais > entrada && entrada > 0) warnings.push("O ato/sinal é maior que a entrada.");
  if (preP.monthly < 0) warnings.push("As anuais antes das chaves passam do valor dessa fase. Diminua as anuais.");
  if (posP.monthly < 0) warnings.push("As anuais depois das chaves passam do valor dessa fase. Diminua as anuais.");

  const setPreAmount = (v: number) => setPre(toInput(Math.max(0, Math.min(v, rest))));

  function suggest() {
    const P = reais(capacity);
    if (rest <= 0) return setSmartMsg({ tone: "warn", text: "Preencha a composição do valor: ainda não há entrada para dividir." });
    if (P <= 0) return setSmartMsg({ tone: "warn", text: "Digite quanto o cliente consegue pagar por mês." });
    const K = keys;
    const obraAvg = obra && (obraFirstR || obraLastR) ? (obraFirstR + (obraLastR || obraFirstR)) / 2 : 0;
    const preCapM = Math.max(0, P - obraAvg);
    const preAnn = useAnnual ? Math.floor(K / 12) : 0;
    const preDen = K + preAnn * ANNUAL_MULT;
    const preTake = Math.min(rest, preCapM * preDen);
    const preM = preDen > 0 ? preTake / preDen : 0;

    const posTake = rest - preTake;
    const N = posMax;
    const posAnn = useAnnual && posTake > 0 ? Math.floor(N / 12) : 0;
    const posM = posTake > 0 ? posTake / (N + posAnn * ANNUAL_MULT) : 0;

    setPre(toInput(preTake));
    setPreMonths(String(K));
    setPreAnnuals(preTake > 0 ? preAnn : 0);
    setPreAnnualValue(preTake > 0 && preAnn > 0 ? toInput(preM * ANNUAL_MULT) : "");
    setPosMonths(posTake > 0 ? String(N) : "");
    setPosAnnuals(posAnn);
    setPosAnnualValue(posAnn > 0 ? toInput(posM * ANNUAL_MULT) : "");

    const posCap = Math.max(0, P - caixaFirstR);
    if (posTake <= 0) setSmartMsg({ tone: "ok", text: `A entrada inteira cabe antes das chaves: ${K}x de ${money(preM)}${preAnn ? ` + ${preAnn} anuais de ${money(preM * ANNUAL_MULT)}` : ""}.` });
    else if (posM > posCap + 0.005)
      setSmartMsg({
        tone: "warn",
        text: `Mesmo em ${N} meses, depois das chaves fica ${money(posM)}/mês${caixaFirstR ? ` + ${money(caixaFirstR)} da Caixa` : ""}, acima do que o cliente consegue. Aumente o prazo, o ato ou o FGTS.`,
      });
    else setSmartMsg({ tone: "ok", text: "Sugestão aplicada nas fases abaixo. Ajuste à vontade." });
  }

  function pickProperty(id: string) {
    const p = properties.find((x) => x.id === id);
    if (!p) return;
    setUnit([p.title, p.kind].filter(Boolean).join(" – "));
    setValue(toInput(p.price_cents / 100));
  }

  const phaseLine = (p: Phase) =>
    [p.monthly > 0 ? `${p.months}x de ${money(p.monthly)}` : null, p.annuals > 0 && p.annualValue > 0 ? `${p.annuals} ${p.annuals === 1 ? "anual" : "anuais"} de ${money(p.annualValue)}` : null]
      .filter(Boolean)
      .join(" + ");

  function summaryText() {
    const lines = [
      "*Fluxo de pagamento*",
      client ? `Cliente: ${client}` : null,
      unit ? `Imóvel: ${unit}` : null,
      `Valor do imóvel: ${money(V)}`,
      S ? `Subsídio: ${money(S)}` : null,
      F ? `FGTS: ${money(F)}` : null,
      C ? `Financiamento Caixa: ${money(C)}` : null,
      `*Entrada: ${money(entrada)}*`,
      atoReais ? `Ato/sinal: ${money(atoReais)}` : null,
      preP.amount > 0 ? `Até as chaves (${money(preP.amount)}): ${phaseLine(preP)}` : null,
      obra && obraFirstR ? `Evolução de obra (Caixa): de ${money(obraFirstR)} a ${money(obraLastR || obraFirstR)}/mês` : null,
      posP.amount > 0 ? `Depois das chaves (${money(posP.amount)}): ${phaseLine(posP)}` : null,
      showCaixa && caixaFirstR ? `Parcelas da Caixa: 1ª ${money(caixaFirstR)}${caixaLastR ? `, última ${money(caixaLastR)}` : ""}${caixaMonths ? ` em ${caixaMonths} meses` : ""}` : null,
      "_Simulação sujeita à aprovação de crédito._",
    ];
    return lines.filter(Boolean).join("\n");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(summaryText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const ready = V > 0;
  const bar = V > 0 ? [
    { key: "s", v: Math.min(S, V), cls: "bg-ok", label: "Subsídio" },
    { key: "f", v: Math.min(F, V), cls: "bg-warn", label: "FGTS" },
    { key: "c", v: Math.min(C, V), cls: "bg-brand", label: "Caixa" },
    { key: "e", v: entrada, cls: "bg-ink-2", label: "Entrada" },
  ] : [];
  const barTotal = bar.reduce((a, b) => a + b.v, 0) || 1;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <div className="flex flex-col gap-5">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line bg-surface-2/50 px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Para quem é</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input aria-label="Cliente" value={client} onChange={(e) => setClient(e.target.value.slice(0, 80))} placeholder="Nome do cliente" className="h-10" />
              <Input aria-label="Empreendimento / unidade" value={unit} onChange={(e) => setUnit(e.target.value.slice(0, 120))} placeholder="Empreendimento / unidade" className="h-10" />
              {properties.length ? (
                <select aria-label="Puxar de um imóvel cadastrado" defaultValue="" onChange={(e) => pickProperty(e.target.value)} className={clsx(inputClass, "h-10 appearance-none text-sm")}>
                  <option value="">Puxar imóvel cadastrado…</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {[p.title, p.kind].filter(Boolean).join(" – ")} · {formatMoney(p.price_cents)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          <div className="px-5 py-4 sm:px-6">
            <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Composição do valor</p>
            <div className="divide-y divide-line/60">
              <Line label="Valor do imóvel">
                <MoneyInput label="Valor do imóvel" value={value} onChange={setValue} />
              </Line>
              <Line sign="−" dot="bg-ok" label="Subsídio">
                <MoneyInput label="Subsídio" value={subsidy} onChange={setSubsidy} />
              </Line>
              <Line sign="−" dot="bg-warn" label="FGTS">
                <MoneyInput label="FGTS" value={fgts} onChange={setFgts} />
              </Line>
              <Line sign="−" dot="bg-brand" label="Valor liberado pela Caixa">
                <MoneyInput label="Valor liberado pela Caixa" value={caixa} onChange={setCaixa} />
              </Line>
            </div>
            <div className="mt-2 flex items-center gap-3 rounded-xl bg-ink px-4 py-3 text-surface">
              <span className="w-3 text-center font-semibold opacity-60">=</span>
              <span className="flex-1 text-sm font-medium">Entrada a pagar</span>
              <span className="font-display text-xl font-semibold tabular-nums">{ready ? money(entrada) : "—"}</span>
            </div>
            {bar.length ? (
              <div className="mt-3">
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
                  {bar.map((b) => (b.v > 0 ? <span key={b.key} className={b.cls} style={{ width: `${(b.v / barTotal) * 100}%` }} /> : null))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                  {bar.map((b) =>
                    b.v > 0 ? (
                      <span key={b.key} className="flex items-center gap-1.5">
                        <span className={clsx("size-2 rounded-full", b.cls)} />
                        {b.label} {Math.round((b.v / barTotal) * 100)}%
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-line px-5 py-4 sm:px-6">
            <Extra open={showCaixa} onToggle={setShowCaixa} icon={<Landmark className="size-4" />} title="Parcelas da Caixa" hint="Mostra ao cliente a 1ª e a última parcela do financiamento e o prazo.">
              <div className="grid gap-3 sm:grid-cols-3">
                <MoneyField label="1ª parcela" value={caixaFirst} onChange={setCaixaFirst} />
                <MoneyField label="Última parcela" value={caixaLast} onChange={setCaixaLast} />
                <MonthsInput label="Prazo (meses)" value={caixaMonths} onChange={setCaixaMonths} placeholder="Ex.: 420" />
              </div>
            </Extra>
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
            <div>
              <h2 className="font-display text-lg font-semibold tracking-tight">Como pagar a entrada</h2>
              <p className="text-sm text-muted">{rest > 0 ? `${money(rest)} para distribuir${atoReais ? ", já sem o ato" : ""}.` : "Preencha a composição do valor primeiro."}</p>
            </div>
            <Button size="sm" variant={assistOpen ? "primary" : "secondary"} onClick={() => setAssistOpen((o) => !o)} aria-expanded={assistOpen}>
              <Wand2 className="size-4" />
              Assistente de parcelas
            </Button>
          </div>

          {assistOpen ? (
            <div className="mx-5 mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-brand/50 bg-brand-soft/40 p-4 sm:mx-6">
              <p className="text-sm text-ink-2">Diga quanto o cliente consegue pagar por mês e o assistente distribui a entrada entre antes e depois das chaves. Evolução de obra e parcela da Caixa, se incluídas, são descontadas.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <MoneyField label="Cabe no bolso (mês)" value={capacity} onChange={setCapacity} placeholder="Ex.: 800,00" />
                <MonthsInput label="Meses até as chaves" value={keysMonths} onChange={setKeysMonths} placeholder={`até ${PRE_DEFAULT}`} />
                <Field label="Depois das chaves em até">
                  <Select value={String(posMax)} onChange={(e) => setPosMax(Number(e.target.value))} className="h-10">
                    {POS_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m} meses
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={useAnnual} onChange={(e) => setUseAnnual(e.target.checked)} className="size-4 accent-brand" />
                  Usar anuais (até {ANNUAL_MULT}x a mensal)
                </label>
                <Button size="sm" onClick={suggest}>
                  Aplicar sugestão
                </Button>
              </div>
              {smartMsg ? (
                <p role="status" className={clsx("rounded-lg px-3 py-2 text-sm", smartMsg.tone === "ok" ? "bg-surface text-brand-text" : "bg-warn-soft text-warn")}>
                  {smartMsg.text}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-2 px-2 py-3">
                <PenLine className="mx-auto size-4 text-muted" />
                <p className="mt-1 text-[11px] text-muted">Na assinatura</p>
                <MoneyInput label="Ato / sinal" value={ato} onChange={setAto} className="mt-1.5" />
              </div>
              <div className="rounded-xl bg-brand-soft px-2 py-3">
                <HardHat className="mx-auto size-4 text-brand-text" />
                <p className="mt-1 text-[11px] text-brand-text">Até as chaves</p>
                <MoneyInput label="Valor até as chaves" value={pre} onChange={setPre} className="mt-1.5" />
              </div>
              <div className="rounded-xl bg-surface-2 px-2 py-3">
                <KeyRound className="mx-auto size-4 text-muted" />
                <p className="mt-1 text-[11px] text-muted">Depois das chaves</p>
                <p className={clsx(inputClass, "mt-1.5 flex h-10 items-center justify-end bg-surface-2 tabular-nums")}>{posP.amount > 0 ? money(posP.amount) : "—"}</p>
              </div>
            </div>
            {reais(pre) > rest && rest > 0 ? <p className="text-xs text-warn">Até as chaves vai no máximo {money(rest)}.</p> : null}

            <div>
              <div className="relative h-8">
                <div className="absolute inset-x-0 top-1/2 flex h-3 -translate-y-1/2 overflow-hidden rounded-full bg-line">
                  <span className="bg-brand transition-[width]" style={{ width: `${prePct}%` }} />
                </div>
                <span className="pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand bg-surface shadow" style={{ left: `${prePct}%` }} />
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, Math.round(rest))}
                  step={Math.max(1, Math.round(rest / 200))}
                  value={Math.round(preAmount)}
                  disabled={rest <= 0}
                  onChange={(e) => setPreAmount(Number(e.target.value))}
                  aria-label="Quanto vai até as chaves"
                  className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted">
                <span>{prePct}% até as chaves</span>
                <span>{100 - prePct}% depois</span>
              </div>
            </div>
            <div role="group" aria-label="Atalhos de divisão" className="flex gap-1 self-start rounded-xl bg-surface-2 p-1">
              {SPLIT_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  disabled={rest <= 0}
                  onClick={() => setPreAmount((rest * pct) / 100)}
                  className={clsx(
                    "h-7 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-50",
                    rest > 0 && prePct === pct ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                  )}
                >
                  {pct === 0 ? "Tudo depois" : pct === 100 ? "Tudo antes" : `${pct}%`}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <PhasePanel
                icon={<HardHat className="size-4" />}
                title="Antes das chaves"
                amount={preP.amount}
                monthly={preP.monthly}
                monthsValue={preMonths}
                onMonths={setPreMonths}
                monthsMax={keys}
                annuals={preAnnuals}
                onAnnuals={setPreAnnuals}
                annualValue={preAnnualValue}
                onAnnualValue={setPreAnnualValue}
              >
                <Extra open={obra} onToggle={setObra} icon={<HardHat className="size-4" />} title="Evolução de obra" hint="Paga à Caixa na obra. Não sai da entrada, mas pesa no mês.">
                  <div className="grid grid-cols-2 gap-3">
                    <MoneyField label="Parcela inicial" value={obraFirst} onChange={setObraFirst} />
                    <MoneyField label="Parcela final" value={obraLast} onChange={setObraLast} />
                  </div>
                </Extra>
              </PhasePanel>
              <PhasePanel
                icon={<KeyRound className="size-4" />}
                title="Depois das chaves"
                amount={posP.amount}
                monthly={posP.monthly}
                monthsValue={posMonths}
                onMonths={setPosMonths}
                monthsMax={POS_DEFAULT}
                annuals={posAnnuals}
                onAnnuals={setPosAnnuals}
                annualValue={posAnnualValue}
                onAnnualValue={setPosAnnualValue}
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 bg-brand px-5 py-4 text-brand-ink">
            <div className="min-w-0">
              <p className="text-xs opacity-80">Proposta</p>
              <p className="truncate font-display text-lg font-semibold">{[client, unit].filter(Boolean).join(" · ") || "Fluxo de pagamento"}</p>
            </div>
            {ready ? (
              <button type="button" onClick={copy} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs font-medium hover:bg-white/25">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copiado" : "WhatsApp"}
              </button>
            ) : null}
          </div>

          {!ready ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Informe o <strong className="text-ink-2">valor do imóvel</strong> para montar a proposta. Tudo se recalcula enquanto você digita.</p>
          ) : (
            <div className="flex flex-col gap-5 p-5">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-surface-2 px-3 py-2.5">
                  <p className="text-[11px] text-muted">Imóvel</p>
                  <p className="font-semibold tabular-nums">{money(V)}</p>
                </div>
                <div className="rounded-xl bg-surface-2 px-3 py-2.5">
                  <p className="text-[11px] text-muted">Entrada</p>
                  <p className="font-semibold tabular-nums">{money(entrada)}</p>
                </div>
              </div>

              <ol className="relative flex flex-col gap-4 border-l-2 border-line pl-5">
                <TimelineItem icon={<PenLine className="size-3" />} title="Na assinatura" value={atoReais ? money(Math.min(atoReais, entrada)) : "Sem ato"} />
                <TimelineItem
                  icon={<HardHat className="size-3" />}
                  title="Até as chaves"
                  value={preP.amount > 0 ? money(preP.amount) : "Nada nessa fase"}
                  sub={[preP.amount > 0 ? phaseLine(preP) : null, obra && obraFirstR ? `+ evolução de obra ${money(obraFirstR)}${obraLastR && obraLastR !== obraFirstR ? ` a ${money(obraLastR)}` : ""}/mês` : null].filter(Boolean).join(" ")}
                  accent
                />
                <TimelineItem
                  icon={<KeyRound className="size-3" />}
                  title="Depois das chaves"
                  value={posP.amount > 0 ? money(posP.amount) : "Nada nessa fase"}
                  sub={posP.amount > 0 ? phaseLine(posP) : undefined}
                />
                {showCaixa && caixaFirstR ? (
                  <TimelineItem
                    icon={<Landmark className="size-3" />}
                    title="Financiamento Caixa"
                    value={`${money(caixaFirstR)}/mês`}
                    sub={[caixaLastR ? `última ${money(caixaLastR)}` : null, caixaMonths ? `${caixaMonths} meses` : null].filter(Boolean).join(" · ") || "1ª parcela"}
                  />
                ) : null}
              </ol>

              {preP.monthly > 0 || obraFirstR || posP.monthly > 0 || caixaFirstR ? (
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Peso no mês</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-line px-3 py-2.5">
                      <p className="text-[11px] text-muted">Na obra</p>
                      <p className="font-display text-lg font-semibold tabular-nums">{money(Math.max(0, preP.monthly) + obraFirstR)}</p>
                      {obraLastR && obraLastR !== obraFirstR ? <p className="text-[11px] text-muted">até {money(Math.max(0, preP.monthly) + obraLastR)}</p> : null}
                      <p className="text-[11px] text-muted">{obraFirstR ? "entrada + obra" : "entrada"}</p>
                    </div>
                    <div className="rounded-xl border border-line px-3 py-2.5">
                      <p className="text-[11px] text-muted">Com as chaves</p>
                      <p className="font-display text-lg font-semibold tabular-nums">{money(Math.max(0, posP.monthly) + caixaFirstR)}</p>
                      <p className="text-[11px] text-muted">{caixaFirstR ? "entrada + Caixa" : "entrada"}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
                <span className="text-muted">Ato + antes + depois</span>
                <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                  {money(Math.min(atoReais, entrada) + preP.amount + posP.amount)}
                  {warnings.length === 0 && entrada > 0 ? <Check className="size-4 text-ok" aria-label="Fecha com a entrada" /> : null}
                </span>
              </div>

              {warnings.map((w) => (
                <p key={w} className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {w}
                </p>
              ))}
              <p className="text-[11px] text-muted">Simulação sujeita à aprovação de crédito. Confira os valores da Caixa na simulação oficial.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function TimelineItem({ icon, title, value, sub, accent }: { icon: ReactNode; title: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <li className="relative">
      <span className={clsx("absolute top-0.5 -left-[31px] grid size-5 place-items-center rounded-full ring-4 ring-surface", accent ? "bg-brand text-brand-ink" : "bg-ink-2 text-surface")}>{icon}</span>
      <p className="text-xs text-muted">{title}</p>
      <p className="font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-muted">{sub}</p> : null}
    </li>
  );
}
