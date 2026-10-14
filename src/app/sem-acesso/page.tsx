import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/logo";

export const metadata: Metadata = { title: "Sem acesso", robots: { index: false, follow: false } };

// Mostrada pelo proxy quando alguém logado, fora da lista de administradores
// da plataforma, tenta abrir o painel interno.
export default function NoAccessPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-md text-center animate-rise">
        <BrandMark className="mx-auto size-10" />
        <span className="mx-auto mt-8 grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
          <Lock className="size-5" />
        </span>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-[-0.02em]">Você não tem acesso</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Esta área é restrita à equipe da DomuTech. Se você acha que deveria ter acesso, fale com o administrador da plataforma.
        </p>
        <Link href="/painel" className={buttonClass("primary", "md", "mt-8")}>
          Voltar para o painel
        </Link>
      </div>
    </main>
  );
}
