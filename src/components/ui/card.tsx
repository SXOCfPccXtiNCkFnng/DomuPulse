import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={clsx("rounded-card bg-surface border border-line shadow-card", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx("flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: "neutral" | "brand" | "danger" | "warn" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 h-6 text-xs font-medium whitespace-nowrap",
        tone === "neutral" && "bg-surface-2 text-ink-2",
        tone === "brand" && "bg-brand-soft text-brand-text",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "warn" && "bg-warn-soft text-warn",
        className,
      )}
      {...props}
    />
  );
}

export function LiveDot({ className }: { className?: string }) {
  return <span className={clsx("inline-block size-2 rounded-full bg-brand-text animate-live", className)} />;
}
