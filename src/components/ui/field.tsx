import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export const inputClass = clsx(
  "w-full h-11 rounded-xl bg-surface border border-line px-3.5 text-[15px] text-ink",
  "placeholder:text-muted/70 transition-colors",
  "hover:border-line-strong focus:border-ink focus:outline-none",
  "aria-invalid:border-danger",
);

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {error ? (
        <span className="text-[13px] text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[13px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={clsx(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={clsx(inputClass, "appearance-none pr-9 bg-no-repeat", className)} {...props} />;
}

export function FormMessage({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "rounded-xl px-3.5 py-2.5 text-sm",
        tone === "error" ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-text",
      )}
    >
      {children}
    </p>
  );
}
