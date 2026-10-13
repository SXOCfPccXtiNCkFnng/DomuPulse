"use client";

import clsx from "clsx";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Card } from "@/components/ui/card";

export type Step = { id: string; label: string; detail: string; href: string; done: boolean };

const listeners = new Set<() => void>();
const key = (orgId: string) => `pulse-primeiros-passos-${orgId}`;

function readHidden(orgId: string) {
  try {
    return localStorage.getItem(key(orgId)) === "1";
  } catch {
    return false;
  }
}

/** Guia do administrador nos primeiros dias. Some sozinho quando tudo estiver feito. */
export function FirstSteps({ orgId, steps }: { orgId: string; steps: Step[] }) {
  const hidden = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => readHidden(orgId),
    () => true,
  );
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;

  const hide = () => {
    try {
      localStorage.setItem(key(orgId), "1");
    } catch {
      // Sem armazenamento: some só nesta visita.
    }
    listeners.forEach((l) => l());
  };

  return (
    <Card className="animate-rise">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Primeiros passos</h2>
          <p className="mt-0.5 text-sm text-muted">
            {done} de {steps.length} concluídos
          </p>
        </div>
        <button
          onClick={hide}
          aria-label="Esconder primeiros passos"
          className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      <div
        className="mx-5 mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2 sm:mx-6"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        aria-label="Progresso dos primeiros passos"
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className={clsx(
                "flex h-full gap-3 rounded-xl border p-3.5 transition-colors",
                step.done ? "border-transparent bg-surface-2" : "border-line hover:border-line-strong hover:bg-surface-2",
              )}
            >
              <span
                className={clsx(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  step.done ? "bg-brand text-brand-ink" : "border border-line-strong text-muted",
                )}
              >
                {step.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span>
                <span className={clsx("block text-sm font-medium", step.done && "text-muted line-through")}>{step.label}</span>
                <span className="block text-xs text-muted">{step.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
