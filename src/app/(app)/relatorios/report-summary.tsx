"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";

/**
 * Resumo enxuto no topo do relatório: os totais em uma linha (aparece também no
 * PDF/impressão) e um botão para copiar o texto pronto para o WhatsApp.
 */
export function ReportSummary({ title, items }: { title: string; items: { label: string; value: number }[] }) {
  const [copied, setCopied] = useState(false);

  const text = `Relatório ${title}\n\n` + items.map((i) => `✅ ${i.label}: ${i.value}`).join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de área de transferência: a pessoa copia na mão.
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Resumo {title}</p>
        <button type="button" onClick={copy} className={`${buttonClass("secondary", "sm")} print:hidden`}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copiado!" : "Copiar resumo"}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {items.map((i) => (
          <span key={i.label}>
            <span className="text-muted">{i.label}:</span> <strong className="tabular-nums">{i.value}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}
