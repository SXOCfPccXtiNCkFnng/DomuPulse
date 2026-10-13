import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/ui/logo";
import { LEGAL_DOCS_VERSION } from "@/lib/legal";

export type LegalSection = { title: string; body: ReactNode };

export function LegalDocument({
  title,
  intro,
  sections,
  other,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
  other: { href: string; label: string };
}) {
  const [y, m, d] = LEGAL_DOCS_VERSION.split("-");
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="Domu Pulse, página inicial">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-20 sm:px-8">
        <p className="text-sm text-muted">Versão de {`${d}/${m}/${y}`}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{intro}</p>

        <nav aria-label="Seções" className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <ol className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.title}>
                <a href={`#s${i + 1}`} className="text-ink-2 hover:text-ink hover:underline">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 flex flex-col gap-9">
          {sections.map((s, i) => (
            <section key={s.title} id={`s${i + 1}`} className="scroll-mt-6">
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2 [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-14 border-t border-line pt-6 text-sm text-muted">
          Veja também a{" "}
          <Link href={other.href} className="font-medium text-ink underline underline-offset-4">
            {other.label}
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
