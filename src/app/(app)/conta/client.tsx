"use client";

import { Share, SquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { formatMoney } from "@/lib/metrics";
import type { FormState } from "@/lib/validation";
import { removePushSubscription, savePushSubscription, sendTestNotification, setDigestEmail, setDigestSchedule } from "./actions";
import { redeemCoupon, startSubscription, type BillingState } from "./billing-actions";

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
  priceCents,
  appliedCoupon,
}: {
  priceCents: number;
  appliedCoupon: { code: string; percentOff: number } | null;
}) {
  const [state, action, pending] = useActionState(startSubscription, {} as BillingState);
  // Controlado: continua preenchido se o servidor devolver um erro.
  const [document, setDocument] = useState("");
  const total = appliedCoupon ? Math.round(priceCents * (1 - appliedCoupon.percentOff / 100)) : priceCents;

  useEffect(() => {
    if (state.url) window.location.assign(state.url);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <Field label="CPF ou CNPJ" hint="De quem vai receber as faturas" error={state.fieldErrors?.cpfCnpj}>
        <Input
          name="cpfCnpj"
          inputMode="numeric"
          autoComplete="off"
          required
          value={document}
          onChange={(e) => setDocument(e.target.value.replace(/[^\d./-]/g, "").slice(0, 18))}
        />
      </Field>
      {appliedCoupon ? (
        <p className="text-sm text-ink-2">
          Cupom <strong>{appliedCoupon.code}</strong> aplicado: {appliedCoupon.percentOff}% de desconto em todas as faturas.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
        <span className="text-sm text-muted">Total mensal</span>
        <span className="font-display text-xl font-semibold tabular-nums">{formatMoney(total)}</span>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Gerando fatura..." : "Assinar com Pix, boleto ou cartão"}
      </Button>
    </form>
  );
}

export type DigestSchedule = {
  daily: boolean;
  dailyHour: number | null;
  weekly: boolean;
  weeklyWeekday: number;
  monthly: boolean;
};

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);
const selectClass = "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm disabled:opacity-50";

/**
 * Os três resumos por e-mail da liderança: cada um liga e desliga e tem o seu
 * momento de chegar. Salva sozinho a cada mudança.
 */
export function DigestSettings({ initial, digestEmail, loginEmail }: { initial: DigestSchedule; digestEmail: string | null; loginEmail: string }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(patch: Partial<DigestSchedule>) {
    const previous = value;
    const next = { ...value, ...patch };
    setValue(next);
    setSaving(true);
    setError(null);
    const { ok } = await setDigestSchedule(next);
    setSaving(false);
    if (!ok) {
      setValue(previous);
      setError("Não foi possível salvar. Tente de novo.");
    }
  }

  const row = "flex flex-col gap-3 border-t border-line p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6";
  const check = "size-5 shrink-0 accent-[var(--brand)]";

  return (
    <div>
      <div className={row}>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={value.daily} disabled={saving} onChange={(e) => update({ daily: e.target.checked })} className={`mt-0.5 ${check}`} />
          <span>
            <span className="block text-sm font-medium">Resumo do dia</span>
            <span className="block text-sm text-muted">Números do dia, entregas, quem ficou devendo e as observações da equipe.</span>
          </span>
        </label>
        <select
          aria-label="Horário do resumo do dia"
          value={value.dailyHour ?? ""}
          disabled={saving || !value.daily}
          onChange={(e) => update({ dailyHour: e.target.value === "" ? null : Number(e.target.value) })}
          className={selectClass}
        >
          <option value="">1 h depois do último horário</option>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              Às {h}h
            </option>
          ))}
        </select>
      </div>

      <div className={row}>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={value.weekly} disabled={saving} onChange={(e) => update({ weekly: e.target.checked })} className={`mt-0.5 ${check}`} />
          <span>
            <span className="block text-sm font-medium">Resumo da semana</span>
            <span className="block text-sm text-muted">A semana anterior completa, comparada com a de antes. Chega às 8h.</span>
          </span>
        </label>
        <select
          aria-label="Dia do resumo da semana"
          value={value.weeklyWeekday}
          disabled={saving || !value.weekly}
          onChange={(e) => update({ weeklyWeekday: Number(e.target.value) })}
          className={selectClass}
        >
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {i === 0 || i === 6 ? "Todo" : "Toda"} {d}
            </option>
          ))}
        </select>
      </div>

      <div className={row}>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={value.monthly} disabled={saving} onChange={(e) => update({ monthly: e.target.checked })} className={`mt-0.5 ${check}`} />
          <span>
            <span className="block text-sm font-medium">Resumo do mês</span>
            <span className="block text-sm text-muted">O mês anterior inteiro, comparado com o de antes. Chega no dia 1, às 8h.</span>
          </span>
        </label>
      </div>

      {error ? <p className="px-5 pb-4 text-[13px] text-danger sm:px-6">{error}</p> : null}
      {value.daily || value.weekly || value.monthly ? <DigestEmailForm initial={digestEmail} loginEmail={loginEmail} /> : null}
    </div>
  );
}

function DigestEmailForm({ initial, loginEmail }: { initial: string | null; loginEmail: string }) {
  const [state, action, pending] = useActionState(setDigestEmail, {} as FormState);
  const current = state.values?.digestEmail ?? initial ?? "";
  return (
    <form action={action} className="flex flex-col gap-3 px-5 pb-5 sm:px-6 sm:pb-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <div className="flex flex-wrap items-start gap-2">
        <Field
          label="Receber em"
          hint={`Vale para os três resumos. Deixe vazio para receber no e-mail de login (${loginEmail}).`}
          error={state.fieldErrors?.digestEmail}
          className="min-w-56 flex-1"
        >
          <Input name="digestEmail" type="email" inputMode="email" autoComplete="email" placeholder={loginEmail} defaultValue={current} key={current} />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending} className="mt-6 h-11">
          {pending ? "Salvando..." : "Salvar e-mail"}
        </Button>
      </div>
    </form>
  );
}

/** Cupom da DomuTech: dias grátis liberam o acesso na hora; desconto vale na assinatura. */
export function CouponForm() {
  const [state, action, pending] = useActionState(redeemCoupon, {} as BillingState);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (state.url) window.location.assign(state.url);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-3 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <div className="flex flex-wrap items-start gap-2">
        <Field label="Código do cupom" error={state.fieldErrors?.coupon} className="min-w-48 flex-1">
          <Input
            name="coupon"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30))}
            className="uppercase tracking-wider"
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending || code.length < 3} className="mt-6 h-11">
          {pending ? "Aplicando..." : "Aplicar"}
        </Button>
      </div>
    </form>
  );
}

// Links antigos (e-mails já enviados) usam /conta#assinatura: leva para a aba certa.
const HASH_TABS: Record<string, string> = { "#assinatura": "assinatura", "#seguranca": "seguranca", "#imobiliaria": "imobiliaria" };

export function HashToTab() {
  const router = useRouter();
  useEffect(() => {
    const tab = HASH_TABS[window.location.hash];
    if (tab) router.replace(`/conta?aba=${tab}`, { scroll: false });
  }, [router]);
  return null;
}
