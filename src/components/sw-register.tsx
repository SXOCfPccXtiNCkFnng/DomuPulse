"use client";

import { useEffect } from "react";

/**
 * Registra o Service Worker globalmente logo que a aplicação carrega.
 * Essencial para:
 * 1. O navegador Android qualificar o site como instalável (PWA) e disparar beforeinstallprompt.
 * 2. Permitir o recebimento de notificações push em segundo plano.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    }
  }, []);

  return null;
}
