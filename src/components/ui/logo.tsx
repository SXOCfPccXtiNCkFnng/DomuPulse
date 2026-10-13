import clsx from "clsx";

export function PulseMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx("shrink-0", className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path
        d="M5 17h5.5l2.5-6 4 12 3-9 1.8 3H27"
        fill="none"
        stroke="var(--brand-ink)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animated ? "animate-trace" : undefined}
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <PulseMark className="size-8" />
      <span className="font-display text-[1.15rem] font-semibold tracking-tight leading-none">
        <span className="text-muted font-medium">Domu</span> Pulse
      </span>
    </span>
  );
}
