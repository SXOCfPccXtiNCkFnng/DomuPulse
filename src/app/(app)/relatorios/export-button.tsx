"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";

/**
 * Baixa a planilha sem sair da página: busca o arquivo, trata erro com mensagem
 * e dispara o download. Assim um erro (limite, falha) não leva a pessoa para uma
 * tela de JSON no meio de uma apresentação.
 */
export function ExportButton({ href }: { href: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) {
        setError(res.status === 429 ? "Muitas exportações seguidas. Aguarde um pouco e tente de novo." : "Não foi possível exportar agora. Tente de novo.");
        return;
      }
      const blob = await res.blob();
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "pulse-relatorios.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Falha ao baixar. Confira a conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex flex-col items-start gap-1">
      <button type="button" onClick={download} disabled={busy} className={buttonClass("secondary", "md")}>
        <Download className="size-4" />
        {busy ? "Gerando..." : "Exportar planilha"}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
