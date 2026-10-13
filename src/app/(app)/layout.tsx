import { LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SideNav, TabBar } from "@/components/app-nav";
import { ThemeSwitcher, ThemeToggle } from "@/components/theme";
import { Logo, PulseMark } from "@/components/ui/logo";
import { getCurrentMember, ROLE_LABEL } from "@/lib/auth";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
        <Link href="/painel" className="px-2">
          <Logo />
        </Link>
        <div className="mt-8 flex-1">
          <Suspense fallback={<NavSkeleton />}>
            <MemberSideNav />
          </Suspense>
        </div>
        <ThemeSwitcher className="mb-3" />
        <Suspense>
          <MemberCard />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-xl lg:hidden">
          <Link href="/painel" aria-label="Painel">
            <PulseMark className="size-8" />
          </Link>
          <span className="flex items-center gap-1">
            <ThemeToggle />
            <SignOutButton compact />
          </span>
        </header>

        <Suspense>
          <BillingBanner />
        </Suspense>

        <main className="flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
      </div>

      <Suspense>
        <MemberTabBar />
      </Suspense>
    </div>
  );
}

async function MemberSideNav() {
  const member = await getCurrentMember();
  return <SideNav role={member.role} />;
}

async function MemberTabBar() {
  const member = await getCurrentMember();
  return <TabBar role={member.role} />;
}

async function MemberCard() {
  const member = await getCurrentMember();
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="truncate text-sm font-semibold">{member.fullName}</p>
      <p className="truncate text-xs text-muted">
        {ROLE_LABEL[member.role]} em {member.org.name}
      </p>
      <SignOutButton />
    </div>
  );
}

function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/auth/sair" method="post" className={compact ? undefined : "mt-3"}>
      <button
        type="submit"
        className={
          compact
            ? "grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
            : "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] text-muted hover:bg-surface-2 hover:text-ink"
        }
      >
        <LogOut className="size-4" />
        {compact ? <span className="sr-only">Sair</span> : "Sair"}
      </button>
    </form>
  );
}

async function BillingBanner() {
  const { org, role } = await getCurrentMember();
  const daysLeft = Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86_400_000);

  let text: string | null = null;
  if (org.status === "canceled") text = "Assinatura cancelada. Os dados estão disponíveis só para consulta.";
  else if (org.status === "past_due") text = "Há uma fatura em aberto. Regularize para não perder o acesso.";
  else if (org.status === "trialing" && daysLeft <= 0) text = "O período de teste terminou. Os dados estão disponíveis só para consulta.";
  else if (org.status === "trialing" && daysLeft <= 5) text = `Faltam ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"} de teste grátis.`;
  if (!text) return null;

  return (
    <div className="flex items-center justify-between gap-4 bg-brand px-4 py-2.5 text-[13px] text-brand-ink sm:px-6 lg:px-10">
      <span>{text}</span>
      {role === "owner" ? (
        <Link href="/conta#assinatura" className="shrink-0 font-semibold underline underline-offset-4">
          Ver assinatura
        </Link>
      ) : null}
    </div>
  );
}

function NavSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} className="h-10 animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <span className="h-10 w-56 animate-pulse rounded-xl bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
      <span className="h-96 animate-pulse rounded-card bg-surface-2" />
    </div>
  );
}
