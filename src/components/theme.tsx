"use client";

import clsx from "clsx";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY as STORAGE_KEY } from "@/lib/theme-script";

// Claro é o padrão. O escuro só aparece quando a pessoa escolhe.
export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "dark") localStorage.setItem(STORAGE_KEY, "dark");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sem armazenamento (aba anônima): vale só nesta visita.
  }
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const theme = useTheme();
  return (
    <div role="radiogroup" aria-label="Tema" className={clsx("flex rounded-xl bg-surface-2 p-1", className)}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={clsx(
            "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors",
            theme === value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
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
  const theme = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={next === "dark" ? "Usar tema escuro" : "Usar tema claro"}
      className={clsx(
        "grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
