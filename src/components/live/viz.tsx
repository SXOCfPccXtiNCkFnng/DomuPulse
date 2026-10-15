import clsx from "clsx";
import { AlertTriangle, Check, Clock, Minus, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { conversion, formatNumber, METRICS, type Totals } from "@/lib/metrics";

export function StatTile({
  label,
  value,
  detail,
  emphasis = false,
  trend,
}: {
  label: string;
  value: number;
  detail?: string;
  emphasis?: boolean;
  trend?: ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border px-4 py-3.5",
        emphasis ? "border-transparent bg-brand text-brand-ink" : "border-line bg-surface",
      )}
    >
      <p className={clsx("text-[13px]", emphasis ? "text-brand-ink/70" : "text-muted")}>{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="font-display text-[1.9rem] font-semibold leading-none tracking-tight tabular-nums">{formatNumber(value)}</p>
        {trend}
      </div>
      {detail ? (
        <p className={clsx("mt-1.5 text-xs", emphasis ? "text-brand-ink/70" : "text-muted")}>{detail}</p>
      ) : null}
    </div>
  );
}

// Funil horizontal de uma série só: cor única, valor rotulado, conversão
// em relação à etapa anterior no tooltip e na legenda lateral.
export function Funnel({ totals, compact = false }: { totals: Totals; compact?: boolean }) {
  const max = Math.max(1, ...METRICS.map((m) => totals[m.key]));

  return (
    <ol className={clsx("flex flex-col", compact ? "gap-2" : "gap-2.5")}>
      {METRICS.map((m, i) => {
        const value = totals[m.key];
        const prev = i > 0 ? METRICS[i - 1] : null;
        const rate = prev ? conversion(totals[prev.key], value) : null;
        const tip = prev
          ? `${m.label}: ${formatNumber(value)}, ${rate} de ${prev.label.toLowerCase()}`
          : `${m.label}: ${formatNumber(value)}`;

        return (
          <li
            key={m.key}
            tabIndex={0}
            aria-label={tip}
            className="group relative grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 rounded-lg outline-none sm:grid-cols-[7.5rem_1fr_3.5rem]"
          >
            <span className="truncate text-[13px] text-ink-2">{m.label}</span>
            <span className="relative h-5">
              <span
                className="absolute inset-y-0 left-0 rounded-r-[4px] bg-brand-text transition-[width] duration-700 ease-out group-hover:opacity-85"
                style={{ width: value ? `max(4px, ${(value / max) * 100}%)` : 0 }}
              />
              <span className="pointer-events-none absolute -top-9 left-0 z-10 hidden whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-bg shadow-card group-hover:block group-focus-visible:block">
                {tip}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-sm font-semibold tabular-nums">{formatNumber(value)}</span>
              {rate && !compact ? <span className="block text-[11px] text-muted tabular-nums">{rate}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export type SlotStatus = "delivered" | "upcoming" | "open" | "late" | "off" | "unmarked";

const SLOT_STATUS: Record<SlotStatus, { label: string; className: string; Icon: typeof Check }> = {
  delivered: { label: "Entregue", className: "bg-brand-soft text-brand-text", Icon: Check },
  open: { label: "Aberto", className: "bg-warn-soft text-warn", Icon: Timer },
  late: { label: "Atrasado", className: "bg-danger-soft text-danger", Icon: AlertTriangle },
  upcoming: { label: "Em breve", className: "bg-surface-2 text-muted", Icon: Clock },
  off: { label: "Folga", className: "bg-surface-2 text-muted", Icon: Minus },
  unmarked: { label: "Sem presença", className: "bg-surface-2 text-muted", Icon: Minus },
};

export function SlotChip({ status, compact = false }: { status: SlotStatus; compact?: boolean }) {
  const { label, className, Icon } = SLOT_STATUS[status];
  return (
    <span
      title={label}
      className={clsx(
        "inline-flex items-center justify-center gap-1 rounded-full font-medium",
        compact ? "size-7" : "h-7 px-2.5 text-xs",
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}

export function SlotLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
      {(["delivered", "open", "late", "upcoming", "off"] as SlotStatus[]).map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <SlotChip status={s} compact />
          {SLOT_STATUS[s].label}
        </li>
      ))}
    </ul>
  );
}
