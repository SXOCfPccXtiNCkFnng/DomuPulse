"use client";

import { useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Quando a aba volta ao foco depois de um tempo inativa, o token da sessão
 * pode estar perto de vencer. Renovamos aqui, em segundo plano, para que a
 * próxima navegação não precise esperar o servidor renovar (o que trava a
 * primeira ação ao voltar). Só renova quando falta pouco, para não pesar.
 */
export function SessionRefresh() {
  useEffect(() => {
    const supabase = getBrowserClient();
    let running = false;

    const maybeRefresh = async () => {
      if (document.visibilityState !== "visible" || running) return;
      running = true;
      try {
        const { data } = await supabase.auth.getSession();
        const expiresAt = data.session?.expires_at;
        if (expiresAt) {
          const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
          // Perto de vencer (ou já vencido): renova agora para a navegação sair na hora.
          if (secondsLeft < 180) await supabase.auth.refreshSession();
        }
      } catch {
        // Renovar é só uma otimização; se falhar, o fluxo normal cuida da sessão.
      } finally {
        running = false;
      }
    };

    document.addEventListener("visibilitychange", maybeRefresh);
    return () => document.removeEventListener("visibilitychange", maybeRefresh);
  }, []);

  return null;
}
