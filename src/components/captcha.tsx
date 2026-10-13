"use client";

import { useEffect, useRef } from "react";

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;

function loadScript() {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile"));
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Desafio anti-robô do Cloudflare. Na maioria das vezes é invisível. O
 * token vai num campo escondido do formulário; cada token vale uma vez,
 * então o desafio recomeça quando `resetKey` muda (depois de cada envio).
 * Sem a chave configurada, não renderiza nada.
 */
export function Captcha({ resetKey }: { resetKey?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    let cancelled = false;
    const el = ref.current;
    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile || widget.current) return;
        const dark = document.documentElement.dataset.theme === "dark";
        widget.current = window.turnstile.render(el, {
          sitekey: SITE_KEY,
          language: "pt-br",
          theme: dark ? "dark" : "light",
          appearance: "interaction-only",
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (widget.current && resetKey !== undefined) window.turnstile?.reset(widget.current);
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="min-h-0 empty:hidden" />;
}
