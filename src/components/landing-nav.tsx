"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle, useTheme } from "@/components/theme";
import { BrandMark } from "@/components/ui/logo";

const LINKS = [
  { id: "como-funciona", label: "Como funciona" },
  { id: "recursos", label: "Recursos" },
  { id: "duvidas", label: "Dúvidas" },
];

/**
 * Menu flutuante em pílula. No escuro fica translúcido sobre a foto. No claro,
 * vira uma pílula branca. Destaca a seção que está na tela.
 */
export function LandingNav() {
  const theme = useTheme();
  const dark = theme === "dark";
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      // Conta como "na tela" quando a seção passa pelo meio da janela.
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    const onTop = () => window.scrollY < 200 && setActive(null);
    window.addEventListener("scroll", onTop, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onTop);
    };
  }, []);

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4 sm:top-5">
      <nav
        aria-label="Principal"
        className={clsx(
          "mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 rounded-full border py-2 pr-2 pl-4 backdrop-blur-xl sm:pl-5",
          dark
            ? "border-white/10 bg-[#0b111c]/80 text-white shadow-[0_12px_40px_-12px_rgb(0_0_0/0.5)]"
            : "border-line bg-white/85 text-ink shadow-[0_12px_40px_-18px_rgb(11_27_54/0.28)]",
        )}
      >
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Domu Pulse, início">
          <BrandMark className="size-6" />
          <span className="font-display text-[17px] font-semibold tracking-tight">
            <span className={clsx("hidden font-medium sm:inline", dark ? "text-white/60" : "text-muted")}>Domu </span>Pulse
          </span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                aria-current={active === l.id ? "true" : undefined}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  dark
                    ? active === l.id
                      ? "bg-white/12 text-white"
                      : "text-white/75 hover:bg-white/8 hover:text-white"
                    : active === l.id
                      ? "bg-brand-soft text-brand-text"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1">
          <ThemeToggle className={clsx("hidden rounded-full sm:grid", dark && "text-white/70 hover:bg-white/10 hover:text-white")} />
          <Link
            href="/entrar"
            className={clsx(
              "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
              dark ? "text-white/75 hover:bg-white/8 hover:text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            Entrar
          </Link>
          <Link
            href="/criar-conta"
            className="rounded-full bg-[#0259f3] px-4 py-2 text-sm font-semibold text-white transition-[filter] hover:brightness-125"
          >
            Criar conta
          </Link>
        </div>
      </nav>
    </header>
  );
}
