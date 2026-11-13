"use client";

import { Select } from "@/components/ui/field";
import { VISIT_REGIONS } from "@/lib/visits";

/** Região da visita (Zona Leste, Sem preferência...). Vazio = não informada. */
export function RegionSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Região">
      <option value="">Não informada</option>
      {VISIT_REGIONS.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </Select>
  );
}
