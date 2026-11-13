"use client";

import clsx from "clsx";
import { Check, Copy, Sparkles, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { formatMoney } from "@/lib/metrics";
import { maskMoneyInput, parseMoney } from "@/lib/money";
import type { PropOption } from "./board";

const PRE_DEFAULT = 33;
const POS_DEFAULT = 120;
const MAX_MONTHS = 420;
/** Parcela anual sugerida: até 5x a mensal. */
const ANNUAL_MULT = 5;
const POS_OPTIONS = [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];

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

function MoneyField({ label, hint, value, onChange, placeholder, readOnly }: { label: string; hint?: ReactNode; value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean }) {
  return (
    <Field label={label} hint={hint}>
      <span className="relative block">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-muted">R$</span>
        <Input
          value={value}
          onChange={onChange ? (e) => onChange(maskMoneyInput(e.target.value)) : undefined}
          readOnly={readOnly}
          inputMode="decimal"
          placeholder={placeholder ?? "0,00"}
          className={clsx("pl-11", readOnly && "bg-surface-2")}
        />
      </span>
    </Field>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-2.5 self-start text-left">
        <span className={clsx("relative h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-brand" : "bg-line-strong")}>
          <span className={clsx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
        </span>
        <span className="text-sm font-medium">{label}</span>
      </button>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Step({ n, title, description, children }: { n: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <header className="flex items-center gap-2 px-5 pt-5 sm:px-6">
        <span className="grid size-5 place-items-center rounded bg-brand text-[11px] font-bold text-brand-ink">{n}</span>
        <h2 className="font-semibold">{title}</h2>
      </header>
      {description ? <p className="px-5 pt-1 text-sm text-muted sm:px-6">{description}</p> : null}
      <div className="flex flex-col gap-4 p-5 sm:p-6">{children}</div>
    </Card>
  );
}

function PhaseFields({
  monthsValue,
  onMonths,
  monthsMax,
  annuals,
  onAnnuals,
  annualValue,
  onAnnualValue,
}: {
  monthsValue: string;
  onMonths: (v: string) => void;
  monthsMax: number;
  annuals: number;
  onAnnuals: (v: number) => void;
  annualValue: string;
  onAnnualValue: (v: string) => void;
}) {
  const maxAnnuals = Math.floor(months(monthsValue, monthsMax) / 12);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Mensais">
        <Input value={monthsValue} onChange={(e) => onMonths(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder={`até ${monthsMax}`} />
      </Field>
      <Field label="Anuais">
        <Select value={String(Math.min(annuals, maxAnnuals))} onChange={(e) => onAnnuals(Number(e.target.value))}>
          <option value="0">Nenhuma</option>
          {Array.from({ length: maxAnnuals }, (_, i) => i + 1).map((k) => (
            <option key={k} value={k}>
              {k} {k === 1 ? "anual" : "anuais"}
            </option>
          ))}
        </Select>
      </Field>
      <MoneyField label="Valor de cada anual" value={annualValue} onChange={onAnnualValue} />
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

  const [capacity, setCapacity] = useState("");
  const [keysMonths, setKeysMonths] = useState("");
  const [posMax, setPosMax] = useState(48);
  const [useAnnual, setUseAnnual] = useState(true);
  const [smartMsg, setSmartMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const V = reais(value);
  const entrada = Math.max(0, V - reais(subsidy) - reais(fgts) - reais(caixa));
  const atoReais = reais(ato);
  const rest = Math.max(0, entrada - atoReais);
  const preAmount = Math.min(reais(pre), rest);
  const keys = months(keysMonths, PRE_DEFAULT);
  const preP = phase(preAmount, preMonths, keys, preAnnuals, preAnnualValue);
  const posP = phase(rest - preAmount, posMonths, POS_DEFAULT, posAnnuals, posAnnualValue);

  const obraFirstR = obra ? reais(obraFirst) : 0;
  const obraLastR = obra ? reais(obraLast) : 0;
  const caixaFirstR = showCaixa ? reais(caixaFirst) : 0;
  const caixaLastR = showCaixa ? reais(caixaLast) : 0;

  const warnings: string[] = [];
  if (V > 0 && reais(subsidy) + reais(fgts) + reais(caixa) > V) warnings.push("Subsídio + FGTS + Caixa passam do valor do imóvel.");
  if (atoReais > entrada && entrada > 0) warnings.push("O ato/sinal é maior que a entrada.");
  if (preP.monthly < 0) warnings.push("As anuais do pré-chaves passam do valor do pré. Diminua as anuais.");
  if (posP.monthly < 0) warnings.push("As anuais do pós-chaves passam do valor do pós. Diminua as anuais.");

  const setPreAmount = (v: number) => setPre(toInput(Math.max(0, Math.min(v, rest))));

  function suggest() {
    const P = reais(capacity);
    if (rest <= 0) return setSmartMsg({ tone: "warn", text: "Preencha os valores do imóvel: ainda não há entrada para dividir." });
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
    if (posTake <= 0) setSmartMsg({ tone: "ok", text: `A entrada inteira cabe no pré-chaves: ${K}x de ${money(preM)}${preAnn ? ` + ${preAnn} anuais de ${money(preM * ANNUAL_MULT)}` : ""}.` });
    else if (posM > posCap + 0.005)
      setSmartMsg({
        tone: "warn",
        text: `Mesmo em ${N} meses, o pós-chaves fica em ${money(posM)}/mês${caixaFirstR ? ` + ${money(caixaFirstR)} da Caixa` : ""}, acima do que o cliente consegue. Aumente o prazo do pós, o ato ou o FGTS.`,
      });
    else setSmartMsg({ tone: "ok", text: "Sugestão aplicada. Ajuste os valores à vontade." });
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
      reais(subsidy) ? `Subsídio: ${money(reais(subsidy))}` : null,
      reais(fgts) ? `FGTS: ${money(reais(fgts))}` : null,
      reais(caixa) ? `Financiamento Caixa: ${money(reais(caixa))}` : null,
      `*Entrada: ${money(entrada)}*`,
      atoReais ? `Ato/sinal: ${money(atoReais)}` : null,
      preP.amount > 0 ? `Pré-chaves (${money(preP.amount)}): ${phaseLine(preP)}` : null,
      obra && obraFirstR ? `Evolução de obra (Caixa): de ${money(obraFirstR)} a ${money(obraLastR || obraFirstR)}/mês` : null,
      posP.amount > 0 ? `Pós-chaves (${money(posP.amount)}): ${phaseLine(posP)}` : null,
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

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <Step n={1} title="Valores do imóvel">
          {properties.length ? (
            <Field label="Puxar de um imóvel cadastrado">
              <Select defaultValue="" onChange={(e) => pickProperty(e.target.value)}>
                <option value="">Opcional</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.title, p.kind].filter(Boolean).join(" – ")} · {formatMoney(p.price_cents)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cliente">
              <Input value={client} onChange={(e) => setClient(e.target.value.slice(0, 80))} placeholder="Opcional" />
            </Field>
            <Field label="Empreendimento / unidade">
              <Input value={unit} onChange={(e) => setUnit(e.target.value.slice(0, 120))} placeholder="Opcional" />
            </Field>
          </div>
          <MoneyField label="Valor do imóvel" value={value} onChange={setValue} />
          <div className="grid gap-3 sm:grid-cols-2">
            <MoneyField label="Subsídio" value={subsidy} onChange={setSubsidy} />
            <MoneyField label="FGTS" value={fgts} onChange={setFgts} />
            <MoneyField label="Valor liberado pela Caixa" value={caixa} onChange={setCaixa} />
            <MoneyField label="Ato / sinal" value={ato} onChange={setAto} />
          </div>
          <div className="border-t border-dashed border-line pt-4">
            <Toggle checked={showCaixa} onChange={setShowCaixa} label="Parcelas da Caixa" hint="Mostre ao cliente quanto ele vai pagar para a Caixa: a 1ª e a última parcela e em quantos meses." />
            {showCaixa ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <MoneyField label="1ª parcela" value={caixaFirst} onChange={setCaixaFirst} />
                <MoneyField label="Última parcela" value={caixaLast} onChange={setCaixaLast} />
                <Field label="Prazo (meses)">
                  <Input value={caixaMonths} onChange={(e) => setCaixaMonths(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="Ex.: 420" />
                </Field>
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-soft px-4 py-3">
            <div>
              <p className="text-sm font-medium">Entrada</p>
              <p className="text-xs text-muted">imóvel − subsídio − FGTS − Caixa</p>
            </div>
            <p className="font-display text-lg font-semibold tabular-nums text-brand-text">{ready ? money(entrada) : "—"}</p>
          </div>
        </Step>

        <Step n={2} title="Divisão da entrada" description={rest > 0 ? `Falta dividir ${money(rest)}${atoReais ? " (já sem o ato)" : ""}.` : "Preencha os valores do imóvel para dividir a entrada."}>
          <div className="grid gap-3 sm:grid-cols-2">
            <MoneyField label="Vai para o pré-chaves" value={pre} onChange={setPre} hint={reais(pre) > rest && rest > 0 ? `Máximo ${money(rest)}` : undefined} />
            <MoneyField label="Fica para o pós-chaves" value={toInput(posP.amount)} readOnly />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.round(rest))}
            step={Math.max(1, Math.round(rest / 200))}
            value={Math.round(preAmount)}
            disabled={rest <= 0}
            onChange={(e) => setPreAmount(Number(e.target.value))}
            aria-label="Quanto vai para o pré-chaves"
            className="w-full accent-brand"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={rest <= 0} onClick={() => setPreAmount(0)}>
              Tudo no pós
            </Button>
            <Button size="sm" variant="secondary" disabled={rest <= 0} onClick={() => setPreAmount(rest / 2)}>
              Metade
            </Button>
            <Button size="sm" variant="secondary" disabled={rest <= 0} onClick={() => setPreAmount(rest)}>
              Tudo no pré
            </Button>
          </div>
        </Step>

        <Step n={<Sparkles className="size-3" />} title="Parcelamento inteligente" description="Digite quanto o cliente consegue pagar por mês e o sistema sugere a melhor forma de dividir a entrada. Depois é só usar e ajustar.">
          <div className="grid gap-3 sm:grid-cols-2">
            <MoneyField label="Parcela que o cliente consegue pagar" value={capacity} onChange={setCapacity} placeholder="Ex.: 800,00" />
            <Field label="Meses até as chaves">
              <Input value={keysMonths} onChange={(e) => setKeysMonths(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder={`até ${PRE_DEFAULT}`} />
            </Field>
            <Field label="Pós-chaves em até">
              <Select value={String(posMax)} onChange={(e) => setPosMax(Number(e.target.value))}>
                {POS_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} meses
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end pb-1">
              <Toggle checked={useAnnual} onChange={setUseAnnual} label={`Usar parcelas anuais (até ${ANNUAL_MULT}x a mensal)`} />
            </div>
          </div>
          <p className="text-xs text-muted">A evolução de obra e a parcela da Caixa, se preenchidas, são descontadas do que o cliente consegue pagar.</p>
          <Button className="self-start" onClick={suggest}>
            Sugerir parcelamento
          </Button>
          {smartMsg ? (
            <p role="status" className={clsx("rounded-xl px-4 py-3 text-sm", smartMsg.tone === "ok" ? "bg-brand-soft text-brand-text" : "bg-warn-soft text-warn")}>
              {smartMsg.text}
            </p>
          ) : null}
        </Step>

        <Step n={3} title="Pré-chaves">
          <PhaseFields monthsValue={preMonths} onMonths={setPreMonths} monthsMax={keys} annuals={preAnnuals} onAnnuals={setPreAnnuals} annualValue={preAnnualValue} onAnnualValue={setPreAnnualValue} />
          <div className="border-t border-line pt-4">
            <Toggle checked={obra} onChange={setObra} label="Evolução de obra" hint="Paga à Caixa durante a obra. Não sai da entrada, mas pesa no bolso do cliente todo mês. Use os valores da simulação da Caixa." />
            {obra ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MoneyField label="Parcela inicial" value={obraFirst} onChange={setObraFirst} />
                <MoneyField label="Parcela final" value={obraLast} onChange={setObraLast} />
              </div>
            ) : null}
          </div>
        </Step>

        <Step n={4} title="Pós-chaves">
          <PhaseFields monthsValue={posMonths} onMonths={setPosMonths} monthsMax={POS_DEFAULT} annuals={posAnnuals} onAnnuals={setPosAnnuals} annualValue={posAnnualValue} onAnnualValue={setPosAnnualValue} />
        </Step>
      </div>

      <div className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader
            title="Resultado"
            action={
              ready ? (
                <Button size="sm" variant="secondary" onClick={copy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copiado" : "Copiar para o WhatsApp"}
                </Button>
              ) : null
            }
          />
          {!ready ? (
            <p className="px-5 pt-2 pb-6 text-sm text-muted sm:px-6">
              Comece pelo <strong className="text-ink-2">valor do imóvel</strong>. O resultado aparece aqui conforme você preenche, e a soma sempre fecha com a entrada.
            </p>
          ) : (
            <div className="flex flex-col gap-4 p-5 sm:p-6">
              {client || unit ? <p className="text-sm text-muted">{[client, unit].filter(Boolean).join(" · ")}</p> : null}
              <dl className="flex flex-col gap-1.5 text-sm">
                <Row label="Valor do imóvel" value={money(V)} />
                {reais(subsidy) ? <Row label="Subsídio" value={`− ${money(reais(subsidy))}`} /> : null}
                {reais(fgts) ? <Row label="FGTS" value={`− ${money(reais(fgts))}`} /> : null}
                {reais(caixa) ? <Row label="Financiamento Caixa" value={`− ${money(reais(caixa))}`} /> : null}
                <Row label="Entrada" value={money(entrada)} strong />
              </dl>

              <div className="grid gap-3 sm:grid-cols-2">
                {atoReais ? <Box label="Ato / sinal" value={money(atoReais)} sub="na assinatura" /> : null}
                <Box label="Pré-chaves" value={preP.amount > 0 ? money(preP.amount) : "—"} sub={preP.amount > 0 ? phaseLine(preP) : "nada no pré"} />
                <Box label="Pós-chaves" value={posP.amount > 0 ? money(posP.amount) : "—"} sub={posP.amount > 0 ? phaseLine(posP) : "nada no pós"} />
                {showCaixa && caixaFirstR ? (
                  <Box label="Parcelas da Caixa" value={`${money(caixaFirstR)}/mês`} sub={[caixaLastR ? `última ${money(caixaLastR)}` : null, caixaMonths ? `${caixaMonths} meses` : null].filter(Boolean).join(" · ") || "1ª parcela"} />
                ) : null}
              </div>

              {preP.monthly > 0 || obraFirstR || posP.monthly > 0 || caixaFirstR ? (
                <div className="rounded-xl border border-line">
                  <p className="border-b border-line px-4 py-2 text-xs font-medium text-muted">Quanto sai do bolso por mês</p>
                  <dl className="flex flex-col gap-1.5 px-4 py-3 text-sm">
                    <Row
                      label="Durante a obra"
                      value={`${money(Math.max(0, preP.monthly) + obraFirstR)}${obraLastR && obraLastR !== obraFirstR ? ` a ${money(Math.max(0, preP.monthly) + obraLastR)}` : ""}`}
                      hint={obraFirstR ? "pré-chaves + evolução de obra" : "pré-chaves"}
                    />
                    <Row label="Depois das chaves" value={money(Math.max(0, posP.monthly) + caixaFirstR)} hint={caixaFirstR ? "pós-chaves + 1ª parcela da Caixa" : "pós-chaves"} />
                  </dl>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 px-4 py-3 text-sm">
                <Row label="Ato" value={money(Math.min(atoReais, entrada))} />
                <Row label="Pré-chaves" value={money(preP.amount)} />
                <Row label="Pós-chaves" value={money(posP.amount)} />
                <Row label="Soma" value={money(Math.min(atoReais, entrada) + preP.amount + posP.amount)} strong />
                {warnings.length === 0 && entrada > 0 ? (
                  <p className="flex items-center gap-1.5 text-xs text-ok">
                    <Check className="size-3.5" /> Fecha com a entrada.
                  </p>
                ) : null}
              </div>

              {warnings.map((w) => (
                <p key={w} className="flex items-start gap-2 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {w}
                </p>
              ))}
              <p className="text-xs text-muted">Simulação sujeita à aprovação de crédito. Confira os valores da Caixa na simulação oficial.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-3", strong && "border-t border-line pt-1.5 font-semibold")}>
      <dt className="min-w-0">
        {label}
        {hint ? <span className="block text-xs font-normal text-muted">{hint}</span> : null}
      </dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

function Box({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}
