"use client";

import clsx from "clsx";
import { Check, Monitor, Moon, Pipette, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { ACCENT_STORAGE_KEY, THEME_STORAGE_KEY as STORAGE_KEY } from "@/lib/theme-script";

// Claro é o padrão. O escuro só aparece quando a pessoa escolhe, ou quando ela
// escolhe seguir o aparelho e o aparelho está no escuro.
export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }
}

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function readAccent(): string | null {
  try {
    const v = localStorage.getItem(ACCENT_STORAGE_KEY);
    return v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
  } catch {
    return null;
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

function applyTheme(pref: ThemePreference) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia(DARK_QUERY).matches);
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}

export function setTheme(pref: ThemePreference) {
  try {
    if (pref === "light") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Sem armazenamento (aba anônima): vale só nesta visita.
  }
  applyTheme(pref);
  notify();
}

/** Texto escuro sobre cores claras (amarelo, areia...), branco sobre as demais. */
function inkFor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#0b0d12" : "#ffffff";
}

/** Cor principal do site neste aparelho. null volta ao azul do Pulse. */
export function setAccent(hex: string | null) {
  const root = document.documentElement;
  const valid = hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
  try {
    if (valid) localStorage.setItem(ACCENT_STORAGE_KEY, valid);
    else localStorage.removeItem(ACCENT_STORAGE_KEY);
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
  if (valid) {
    root.style.setProperty("--accent", valid);
    root.style.setProperty("--accent-ink", inkFor(valid));
    root.dataset.accent = "";
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-ink");
    delete root.dataset.accent;
  }
  notify();
}

/** Tema em uso agora (claro ou escuro), já resolvendo "seguir o aparelho". */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readPreference, () => "light");
}

export function useAccent(): string | null {
  return useSyncExternalStore(subscribe, readAccent, () => null);
}

/** Com "Dispositivo", acompanha quando o aparelho troca entre claro e escuro. */
export function SystemThemeSync() {
  const pref = useThemePreference();
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      applyTheme("system");
      notify();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);
  return null;
}

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
  { value: "system", label: "Dispositivo", Icon: Monitor },
];

export function ThemeSwitcher({ className, withSystem = false }: { className?: string; withSystem?: boolean }) {
  const pref = useThemePreference();
  const theme = useTheme();
  // Sem a opção "Dispositivo" na tela, marca o tema que está valendo.
  const current: ThemePreference = !withSystem && pref === "system" ? theme : pref;
  return (
    <div role="radiogroup" aria-label="Tema" className={clsx("flex rounded-xl bg-surface-2 p-1", className)}>
      {OPTIONS.filter((o) => withSystem || o.value !== "system").map(({ value, label, Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={current === value}
          onClick={() => setTheme(value)}
          className={clsx(
            "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors",
            current === value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Cores prontas, em tons fortes para o texto branco dos botões ficar legível. */
export const ACCENT_PRESETS: { name: string; hex: string | null }[] = [
  { name: "Azul Pulse", hex: null },
  { name: "Grafite", hex: "#4b5563" },
  { name: "Azul", hex: "#1d4ed8" },
  { name: "Ardósia", hex: "#475569" },
  { name: "Petróleo", hex: "#0f5e66" },
  { name: "Turquesa", hex: "#0d9488" },
  { name: "Verde", hex: "#15803d" },
  { name: "Sálvia", hex: "#5f7a61" },
  { name: "Mostarda", hex: "#a16207" },
  { name: "Laranja", hex: "#c2410c" },
  { name: "Café", hex: "#7c5a43" },
  { name: "Vinho", hex: "#9f1239" },
  { name: "Malva", hex: "#8a5a6b" },
  { name: "Magenta", hex: "#a21caf" },
  { name: "Roxo", hex: "#6d28d9" },
];

const PULSE_BLUE = "#0f2a5f";

/** Grade de cores do site, como os temas do Chrome, mais uma cor livre. */
export function AccentPicker({ className }: { className?: string }) {
  const accent = useAccent();
  const custom = accent && !ACCENT_PRESETS.some((p) => p.hex === accent) ? accent : null;

  return (
    <div role="radiogroup" aria-label="Cor do site" className={clsx("grid grid-cols-4 gap-2 sm:grid-cols-8", className)}>
      {ACCENT_PRESETS.map(({ name, hex }) => {
        const selected = accent === hex;
        const color = hex ?? PULSE_BLUE;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            title={name}
            onClick={() => setAccent(hex)}
            className={clsx(
              "relative grid aspect-square place-items-center rounded-2xl border bg-surface-2 p-1.5 transition-colors",
              selected ? "border-ink" : "border-transparent hover:border-line-strong",
            )}
          >
            <span
              className="size-full max-h-12 max-w-12 overflow-hidden rounded-full"
              style={{ background: `linear-gradient(180deg, ${color} 0 50%, color-mix(in oklab, ${color} 30%, white) 50% 100%)` }}
            />
            {selected ? (
              <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-ink text-bg">
                <Check className="size-3" />
              </span>
            ) : null}
          </button>
        );
      })}
      <label
        title="Escolher outra cor"
        className={clsx(
          "relative grid aspect-square cursor-pointer place-items-center rounded-2xl border bg-surface-2 transition-colors",
          custom ? "border-ink" : "border-transparent hover:border-line-strong",
        )}
        style={custom ? { background: custom, color: inkFor(custom) } : undefined}
      >
        <Pipette className="size-5" aria-hidden="true" />
        <span className="sr-only">Escolher outra cor</span>
        <input
          type="color"
          value={custom ?? PULSE_BLUE}
          onChange={(e) => setAccent(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
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
