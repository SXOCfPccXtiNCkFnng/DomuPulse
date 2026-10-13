"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { formatNumber, METRICS, type MetricKey, type Totals } from "@/lib/metrics";
import { addDays, formatDate } from "@/lib/time";

const CHOICES: MetricKey[] = ["leads", "appointments", "visits", "sales"];
const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 36 };

function niceMax(value: number) {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= value)! * pow;
  return step * 4;
}

/** Uma barra por dia, uma métrica por vez. Dias sem lançamento contam zero. */
export function DailyChart({ from, to, days }: { from: string; to: string; days: { date: string; totals: Totals }[] }) {
  const [metric, setMetric] = useState<MetricKey>("visits");
  const [hover, setHover] = useState<number | null>(null);

  const series = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d.totals]));
    const out: { date: string; value: number }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, value: byDate.get(d)?.[metric] ?? 0 });
    return out;
  }, [days, from, to, metric]);

  const max = niceMax(Math.max(...series.map((s) => s.value), 0));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / series.length;
  const barW = Math.max(1.5, Math.min(24, band * 0.7));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(series.length / 8);
  const label = METRICS.find((m) => m.key === metric)!.label;
  const total = series.reduce((s, d) => s + d.value, 0);
  const active = hover !== null ? series[hover] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Métrica" className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
          {CHOICES.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={metric === key}
              onClick={() => setMetric(key)}
              className={clsx(
                "h-8 rounded-lg px-3 text-[13px] font-medium transition-colors",
                metric === key ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
              )}
            >
              {METRICS.find((m) => m.key === key)!.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          {active ? (
            <>
              <span className="font-semibold text-ink tabular-nums">{formatNumber(active.value)}</span> em {formatDate(active.date)}
            </>
          ) : (
            <>
              <span className="font-semibold text-ink tabular-nums">{formatNumber(total)}</span> no período
            </>
          )}
        </p>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label={`${label} por dia`} onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {formatNumber(max * f)}
            </text>
          </g>
        ))}
        {series.map((d, i) => {
          const x = PAD.left + i * band + (band - barW) / 2;
          const top = y(d.value);
          const h = PAD.top + plotH - top;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.date}>
              {d.value > 0 ? (
                <path
                  d={`M${x},${PAD.top + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${PAD.top + plotH} Z`}
                  fill="var(--brand-text)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              ) : null}
              {i % labelEvery === 0 ? (
                <text x={PAD.left + i * band + band / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                </text>
              ) : null}
              {/* Área de toque maior que a barra, a coluna inteira do dia. */}
              <rect
                x={PAD.left + i * band}
                y={PAD.top}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onTouchStart={() => setHover(i)}
              >
                <title>{`${formatDate(d.date)}: ${formatNumber(d.value)} ${label.toLowerCase()}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>

      <details className="mt-2 print:hidden">
        <summary className="cursor-pointer text-xs text-muted hover:text-ink">Ver em tabela</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Dia</th>
                <th className="px-3 py-2 text-right font-medium">{label}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="px-3 py-1.5">{formatDate(d.date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
    >
      Imprimir ou salvar PDF
    </button>
  );
}
