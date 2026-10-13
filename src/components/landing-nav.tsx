"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme";
import { BrandMark } from "@/components/ui/logo";

const LINKS = [
  { id: "como-funciona", label: "Como funciona" },
  { id: "recursos", label: "Recursos" },
  { id: "duvidas", label: "Dúvidas" },
];

/**
 * Menu flutuante em pílula. Fica sempre escuro e translúcido, por cima da
 * foto e do resto da página, e destaca a seção que está na tela.
 */
export function LandingNav() {
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
        className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 rounded-full border border-white/10 bg-[#0b111c]/80 py-2 pr-2 pl-4 text-white sm:pl-5 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.5)] backdrop-blur-xl"
      >
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Domu Pulse, início">
          <BrandMark className="size-6" />
          <span className="font-display text-[17px] font-semibold tracking-tight">
            <span className="hidden font-medium text-white/60 sm:inline">Domu </span>Pulse
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
                  active === l.id ? "bg-white/12 text-white" : "text-white/75 hover:bg-white/8 hover:text-white",
                )}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1">
          <ThemeToggle className="rounded-full text-white/70 hover:bg-white/10 hover:text-white" />
          <Link href="/entrar" className="rounded-full px-3.5 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/8 hover:text-white">
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
