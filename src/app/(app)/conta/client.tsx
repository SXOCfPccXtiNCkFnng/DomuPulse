"use client";

import { Share, SquarePlus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { formatMoney } from "@/lib/metrics";
import { removePushSubscription, savePushSubscription, sendTestNotification } from "./actions";
import { startSubscription, type BillingState } from "./billing-actions";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function PushSettings({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      // No iPhone, push só existe com o app instalado na tela inicial.
      if (isIos() && !isStandalone()) return setState("needs-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const { ok } = await savePushSubscription(sub.toJSON(), navigator.userAgent);
      if (!ok) throw new Error("save");
      setState("on");
      setMessage({ tone: "success", text: "Pronto. Este aparelho vai receber os lembretes." });
    } catch {
      setMessage({ tone: "error", text: "Não foi possível ativar. Tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
    setMessage(null);
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    const { sent } = await sendTestNotification();
    setBusy(false);
    setMessage(
      sent ? { tone: "success", text: "Notificação enviada." } : { tone: "error", text: "Nenhum aparelho ativo encontrado." },
    );
  }

  const text: Record<PushState, string> = {
    loading: "Verificando este aparelho.",
    unsupported: "Este navegador não recebe notificações. Use Chrome, Edge, Safari ou Firefox atualizados.",
    "needs-install": "No iPhone, instale o Pulse na tela inicial (veja abaixo) e abra por lá para ativar as notificações.",
    denied: "As notificações foram bloqueadas. Libere nas configurações do navegador para este site.",
    off: "Ative para receber um aviso 10 minutos antes de cada relatório e quando algo precisar da sua atenção.",
    on: "Ativas neste aparelho.",
  };

  return (
    <div className="flex flex-col gap-4 p-5 sm:p-6">
      <p className="text-sm text-ink-2">{text[state]}</p>
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      <div className="flex flex-wrap gap-2">
        {state === "off" ? (
          <Button onClick={enable} disabled={busy}>
            {busy ? "Ativando..." : "Ativar notificações"}
          </Button>
        ) : null}
        {state === "on" ? (
          <>
            <Button variant="secondary" onClick={test} disabled={busy}>
              Enviar teste
            </Button>
            <Button variant="ghost" onClick={disable} disabled={busy}>
              Desativar neste aparelho
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallGuide() {
  const [mode, setMode] = useState<"loading" | "installed" | "ios" | "prompt" | "manual">("loading");
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const initial = isStandalone() ? "installed" : isIos() ? "ios" : "manual";
    // Detecção de ambiente do navegador: só existe depois de montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(initial);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
      setMode("prompt");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  return (
    <div className="p-5 sm:p-6">
      {mode === "installed" ? <p className="text-sm text-ink-2">O Pulse já está instalado neste aparelho.</p> : null}
      {mode === "prompt" && deferred ? (
        <Button
          onClick={async () => {
            await deferred.prompt();
            const { outcome } = await deferred.userChoice;
            if (outcome === "accepted") setMode("installed");
          }}
        >
          Instalar o Pulse
        </Button>
      ) : null}
      {mode === "ios" ? (
        <ol className="flex flex-col gap-3 text-sm text-ink-2">
          <li className="flex items-center gap-3">
            <Step n={1} /> Abra este site no Safari
          </li>
          <li className="flex items-center gap-3">
            <Step n={2} /> Toque em <Share className="inline size-4" aria-label="Compartilhar" /> Compartilhar
          </li>
          <li className="flex items-center gap-3">
            <Step n={3} /> Escolha <SquarePlus className="inline size-4" aria-hidden="true" /> Adicionar à Tela de Início
          </li>
        </ol>
      ) : null}
      {mode === "manual" ? (
        <p className="text-sm text-ink-2">
          No menu do navegador, escolha Instalar aplicativo ou Adicionar à tela inicial.
        </p>
      ) : null}
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-bg">{n}</span>
  );
}

export function SubscriptionForm({
  pricePerSeat,
  pricePerSeatCents,
  defaultSeats,
  minSeats,
}: {
  pricePerSeat: string;
  pricePerSeatCents: number;
  defaultSeats: number;
  minSeats: number;
}) {
  const [state, action, pending] = useActionState(startSubscription, {} as BillingState);
  const [seats, setSeats] = useState(defaultSeats);

  useEffect(() => {
    if (state.url) window.location.assign(state.url);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Assentos"
          hint={`${pricePerSeat} por pessoa ativa, por mês`}
          error={state.fieldErrors?.seats}
        >
          <Input
            name="seats"
            type="number"
            min={minSeats}
            max={500}
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value))}
            required
          />
        </Field>
        <Field label="CPF ou CNPJ" error={state.fieldErrors?.cpfCnpj}>
          <Input name="cpfCnpj" inputMode="numeric" autoComplete="off" required />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
        <span className="text-sm text-muted">Total mensal</span>
        <span className="font-display text-xl font-semibold tabular-nums">
          {formatMoney(Math.max(minSeats, seats || 0) * pricePerSeatCents)}
        </span>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Gerando fatura..." : "Assinar com Pix, boleto ou cartão"}
      </Button>
    </form>
  );
}
