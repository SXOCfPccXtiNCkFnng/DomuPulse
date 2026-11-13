"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { VISIT_STAGE_KEYS, VISIT_STAGES, type VisitStage } from "@/lib/visits";

/** Seletor da situação da visita, pintado com a cor da situação escolhida. */
export function VisitStageSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: VisitStage | null;
  onChange: (stage: VisitStage | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const current = value ? VISIT_STAGES[value] : null;
  return (
    <span className={clsx("relative inline-flex", className)}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || null) as VisitStage | null)}
        disabled={disabled}
        aria-label="Situação da visita"
        title={disabled ? "Só o corretor da visita ou a liderança podem mudar" : "Mudar a situação"}
        className={clsx(
          "h-7 w-full appearance-none rounded-md border-0 pr-7 pl-2.5 text-[12px] font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:opacity-90",
          current ? current.chip : "bg-surface-2 text-ink-2",
          !disabled && "cursor-pointer",
          "[&>option]:bg-surface [&>option]:text-ink",
        )}
      >
        <option value="">Agendada</option>
        {VISIT_STAGE_KEYS.map((k) => (
          <option key={k} value={k}>
            {VISIT_STAGES[k].label}
          </option>
        ))}
      </select>
      {!disabled ? <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 opacity-70" /> : null}
    </span>
  );
}
