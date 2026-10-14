"use client";

import { Check, Copy, RefreshCw, Share2 } from "lucide-react";
import { useState, useTransition } from "react";
import { regenerateInviteLink } from "@/app/(app)/equipe/actions";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";

/** Link de convite da conta: copiar, compartilhar e, para o dono, trocar. */
export function InviteLink({ url: initialUrl, orgName, canRegenerate = false }: { url: string; orgName: string; canRegenerate?: boolean }) {
  const [url, setUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const message = `Entre na equipe da ${orgName} no Domu Pulse: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  async function share() {
    // Celular abre a folha de compartilhar do sistema; no computador, o WhatsApp Web.
    if (navigator.share) {
      try {
        await navigator.share({ title: "Domu Pulse", text: message });
      } catch {
        // A pessoa fechou a folha de compartilhar.
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function regenerate() {
    setArmed(false);
    setError(null);
    startTransition(async () => {
      const result = await regenerateInviteLink();
      if (result.url) setUrl(result.url);
      else setError(result.error ?? "Não foi possível gerar um novo link.");
    });
  }

  return (
    <div className="flex flex-col gap-3 p-5 sm:p-6">
      <input readOnly value={url} aria-label="Link de convite" onFocus={(e) => e.target.select()} className={inputClass} />
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copiado" : "Copiar link"}
        </Button>
        <Button variant="secondary" onClick={share}>
          <Share2 className="size-4" />
          Compartilhar
        </Button>
        {canRegenerate ? (
          armed ? (
            <span className="flex items-center gap-1">
              <Button variant="danger" onClick={regenerate}>
                Confirmar: o link atual para de funcionar
              </Button>
              <Button variant="ghost" onClick={() => setArmed(false)}>
                Cancelar
              </Button>
            </span>
          ) : (
            <Button variant="ghost" onClick={() => setArmed(true)} disabled={pending}>
              <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
              Gerar novo link
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
