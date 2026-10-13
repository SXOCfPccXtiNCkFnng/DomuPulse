"use client";

import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY as STORAGE_KEY } from "@/lib/theme-script";

export type ThemeChoice = "system" | "light" | "dark";

const listeners = new Set<() => void>();
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const query = darkQuery();
  query.addEventListener("change", callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    query.removeEventListener("change", callback);
    window.removeEventListener("storage", callback);
  };
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Sem armazenamento (aba anônima): aplica só nesta visita.
  }
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  listeners.forEach((l) => l());
}

export function useTheme() {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);
  const systemDark = useSyncExternalStore(subscribe, () => darkQuery().matches, () => false);
  const resolved: "light" | "dark" = choice === "system" ? (systemDark ? "dark" : "light") : choice;
  return { choice, resolved };
}

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const { choice } = useTheme();
  return (
    <div role="radiogroup" aria-label="Tema" className={clsx("flex rounded-xl bg-surface-2 p-1", className)}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={choice === value}
          onClick={() => setTheme(value)}
          className={clsx(
            "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors",
            choice === value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolved } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={next === "dark" ? "Usar tema escuro" : "Usar tema claro"}
      className={clsx(
        "grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {resolved === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
