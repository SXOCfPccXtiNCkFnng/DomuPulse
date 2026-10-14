import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/ui/logo";

// Tela de boas-vindas: só o logo, sem o menu do painel, até a conta ser ativada.
export default function OnboardingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-6 sm:px-10">
        <Logo />
        <span className="flex items-center gap-1">
          <ThemeToggle />
          <form action="/auth/sair" method="post">
            <button
              type="submit"
              className="flex h-9 items-center gap-2 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-ink"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </form>
        </span>
      </header>
      <main className="flex-1 px-5 pt-4 pb-16 sm:px-10">
        {children}
      </main>
    </div>
  );
}
