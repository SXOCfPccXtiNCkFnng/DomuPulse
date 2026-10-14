import type { ReactNode } from "react";

/** Título das telas de login e cadastro, no estilo da página inicial. */
export function AuthHeading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children: ReactNode }) {
  return (
    <header className="mb-8">
      <p className="flex items-center gap-3 text-[12px] font-semibold tracking-[0.18em] text-brand-text uppercase">
        <span className="h-px w-8 bg-brand-text" />
        {eyebrow}
      </p>
      <h1 className="mt-5 font-display text-[2.1rem] leading-[1.05] font-bold tracking-[-0.03em] sm:text-[2.5rem]">{title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{children}</p>
    </header>
  );
}
