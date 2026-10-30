"use client";

import clsx from "clsx";
import { Activity, BarChart3, Briefcase, CalendarDays, CircleUser, Contact, Ellipsis, FileText, LayoutDashboard, ScrollText, Target, UserSearch, Users, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Role, Segment } from "@/lib/auth";

const BROKER_ITEMS = [
  { href: "/painel", label: "Painel", Icon: Activity, leadersOnly: false },
  { href: "/clientes", label: "Clientes", Icon: Contact, leadersOnly: false },
  { href: "/agenda", label: "Agenda", Icon: CalendarDays, leadersOnly: false },
  { href: "/relatorios", label: "Relatórios", Icon: BarChart3, leadersOnly: false },
  { href: "/metas", label: "Metas", Icon: Target, leadersOnly: false },
  { href: "/notas", label: "Notas fiscais", Icon: FileText, leadersOnly: false },
  { href: "/contratos", label: "Contratos", Icon: ScrollText, leadersOnly: true },
  { href: "/equipe", label: "Equipe", Icon: Users, leadersOnly: true },
  { href: "/conta", label: "Conta", Icon: CircleUser, leadersOnly: false },
];

const HR_ITEMS = [
  { href: "/recrutamento", label: "Painel", Icon: LayoutDashboard, leadersOnly: false },
  { href: "/vagas", label: "Vagas", Icon: Briefcase, leadersOnly: false },
  { href: "/candidatos", label: "Candidatos", Icon: UserSearch, leadersOnly: false },
  { href: "/entrevistas", label: "Entrevistas", Icon: CalendarDays, leadersOnly: false },
  { href: "/automacao", label: "Automação", Icon: Zap, leadersOnly: true },
  { href: "/equipe", label: "Equipe", Icon: Users, leadersOnly: true },
  { href: "/conta", label: "Conta", Icon: CircleUser, leadersOnly: false },
];

// Na barra do celular cabem 4 itens; o resto fica em "Mais".
const TAB_COUNT = 4;

function useItems(role: Role, segment: Segment) {
  const items = segment === "hr" ? HR_ITEMS : BROKER_ITEMS;
  return items.filter((i) => !i.leadersOnly || role !== "broker");
}

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export function SideNav({ role, segment }: { role: Role; segment: Segment }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {useItems(role, segment).map(({ href, label, Icon }) => {
        const active = isActive(path, href);
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

function TabIcon({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span className={clsx("grid h-7 w-12 place-items-center transition-colors", active && "bg-brand text-brand-ink")}>{children}</span>
  );
}

export function TabBar({ role, segment }: { role: Role; segment: Segment }) {
  const path = usePathname();
  const items = useItems(role, segment);
  const main = items.slice(0, TAB_COUNT);
  const more = items.slice(TAB_COUNT);
  const moreActive = more.some((i) => isActive(path, i.href));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLLIElement>(null);

  // Fecha ao trocar de página, tocar fora ou apertar Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden print:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {main.map(({ href, label, Icon }) => {
          const active = isActive(path, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-ink" : "text-muted")}
              >
                <TabIcon active={active}>
                  <Icon className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
                </TabIcon>
                {label}
              </Link>
            </li>
          );
        })}
        {more.length ? (
          <li ref={box} className="relative flex-1">
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={clsx("flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium", moreActive ? "text-ink" : "text-muted")}
            >
              <TabIcon active={moreActive}>
                <Ellipsis className="size-[18px]" />
              </TabIcon>
              Mais
            </button>
            {open ? (
              <ul className="absolute right-2 bottom-[4.5rem] w-48 overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-card animate-rise">
                {more.map(({ href, label, Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive(path, href) ? "page" : undefined}
                      className={clsx(
                        "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                        isActive(path, href) ? "bg-brand text-brand-ink" : "text-ink-2 hover:bg-surface-2",
                      )}
                    >
                      <Icon className="size-[18px]" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
