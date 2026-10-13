"use client";

import clsx from "clsx";
import { Activity, BarChart3, CalendarDays, CircleUser, Target, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth";

const ITEMS = [
  { href: "/painel", label: "Painel", Icon: Activity, leadersOnly: false },
  { href: "/relatorios", label: "Relatórios", Icon: BarChart3, leadersOnly: false },
  { href: "/metas", label: "Metas", Icon: Target, leadersOnly: false },
  { href: "/agenda", label: "Agenda", Icon: CalendarDays, leadersOnly: false },
  { href: "/equipe", label: "Equipe", Icon: Users, leadersOnly: true },
  { href: "/conta", label: "Conta", Icon: CircleUser, leadersOnly: false },
];

function useItems(role: Role) {
  return ITEMS.filter((i) => !i.leadersOnly || role !== "broker");
}

// A barra do celular comporta 5 itens: para a liderança, Conta fica no topo.
function useTabItems(role: Role) {
  const items = useItems(role);
  return items.length > 5 ? items.filter((i) => i.href !== "/conta") : items;
}

export function SideNav({ role }: { role: Role }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {useItems(role).map(({ href, label, Icon }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
              active ? "bg-brand text-brand-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBar({ role }: { role: Role }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden print:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {useTabItems(role).map(({ href, label, Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-ink" : "text-muted",
                )}
              >
                <span className={clsx("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-brand text-brand-ink")}>
                  <Icon className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
