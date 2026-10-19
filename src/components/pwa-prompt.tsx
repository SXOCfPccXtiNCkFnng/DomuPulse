"use client";

import { Bell, Check, Download, Share, Smartphone, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/(app)/conta/actions";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/logo";
import { vapidPublicKeyOrNull } from "@/lib/env";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaPrompt() {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosModal, setShowIosModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Estado de notificações
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // 1. Detecção rigorosa de dispositivo móvel (celular/tablet)
    const ua = window.navigator.userAgent;
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;
    const isAppleMobile =
      /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

    const isCellPhoneOrTablet = mobileRegex.test(ua) || isAppleMobile;

    // Se for computador/desktop, não exibe nada
    if (!isCellPhoneOrTablet) {
      return;
    }

    setIsMobile(true);
    setIsIos(isAppleMobile);

    // 2. Detecção do modo standalone (app já instalado)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // 3. Checagem de dispensa temporária (3 dias)
    const dismissedUntil = localStorage.getItem("pwa_prompt_dismissed_until");
    if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
      setDismissed(true);
    }

    // 4. Checagem de suporte e permissão de notificações
    if (typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator) {
      setNotificationPermission(Notification.permission);
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushSubscribed(Boolean(sub));
        }).catch(() => {});
      }).catch(() => {});
    }

    // 5. Captura do evento de instalação no Android/Chrome mobile
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    setMounted(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!mounted || !isMobile || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    // Guarda dispensa por 3 dias
    localStorage.setItem("pwa_prompt_dismissed_until", String(Date.now() + 3 * 24 * 60 * 60 * 1000));
  };

  const handleInstallAndroid = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDismissed(true);
      }
      setDeferredPrompt(null);
    } else {
      alert("Para instalar, toque no menu do seu navegador (três pontinhos ⋮) e escolha 'Instalar aplicativo' ou 'Adicionar à tela inicial'.");
    }
  };

  const handleEnablePush = async () => {
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") {
        setPushBusy(false);
        return;
      }
      const vapidKey = vapidPublicKeyOrNull();
      if (!vapidKey) throw new Error("Chave VAPID ausente.");

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      await savePushSubscription(sub.toJSON(), navigator.userAgent);
      setPushSubscribed(true);
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 5000);
    } catch {
      alert("Não foi possível ativar as notificações. Verifique as permissões do seu navegador.");
    } finally {
      setPushBusy(false);
    }
  };

  // CASO 1: App já instalado na tela inicial (modo standalone), mas notificações ainda não ativas
  if (isStandalone) {
    if (notificationPermission === "default" && !pushSubscribed) {
      return (
        <aside
          aria-label="Ativar notificações"
          className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-lg rounded-2xl border border-line bg-surface p-4 shadow-xl backdrop-blur-xl lg:hidden sm:bottom-6 sm:left-auto sm:right-6"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
              <Bell className="size-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">Receba lembretes no celular</p>
              <p className="mt-0.5 text-xs text-muted">
                Ative para ser avisado 10 minutos antes de cada relatório e quando houver novidades na sua equipe.
              </p>
              {pushSuccess ? (
                <p className="mt-2 text-xs font-semibold text-brand">Pronto! Notificações ativadas neste aparelho.</p>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" onClick={handleEnablePush} disabled={pushBusy}>
                    {pushBusy ? "Ativando..." : "Ativar notificações"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleDismiss}>
                    Depois
                  </Button>
                </div>
              )}
            </div>
            <button
              onClick={handleDismiss}
              className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </button>
          </div>
        </aside>
      );
    }
    return null;
  }

  // CASO 2: Navegador comum no celular (precisa instalar na tela de início)
  return (
    <>
      <aside
        aria-label="Instalar aplicativo"
        className="fixed bottom-20 left-3 right-3 z-40 mx-auto max-w-md rounded-2xl border border-brand/20 bg-surface/95 p-4 shadow-2xl backdrop-blur-xl lg:hidden sm:bottom-6 sm:left-auto sm:right-6"
      >
        <div className="flex items-start gap-3.5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-md shadow-brand/20">
            <BrandMark className="size-6 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">
              {isIos ? "Baixar o Pulse no iPhone" : "Instalar o aplicativo do Pulse"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {isIos
                ? "Adicione à tela de início para abrir como app e receber notificações."
                : "Abra em 1 toque na sua tela inicial e receba lembretes de relatórios."}
            </p>

            <div className="mt-3 flex items-center gap-2">
              {isIos ? (
                <Button size="sm" onClick={() => setShowIosModal(true)} className="gap-1.5 shadow-sm">
                  <Download className="size-3.5" />
                  Como baixar
                </Button>
              ) : (
                <Button size="sm" onClick={handleInstallAndroid} className="gap-1.5 shadow-sm">
                  <Download className="size-3.5" />
                  Instalar app
                </Button>
              )}

              <Button size="sm" variant="ghost" onClick={handleDismiss}>
                Agora não
              </Button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Fechar aviso"
          >
            <X className="size-4" />
          </button>
        </div>
      </aside>

      {/* Modal explicativo passo a passo para iPhone */}
      {showIosModal ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 backdrop-blur-sm p-4 sm:place-items-center">
          <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Smartphone className="size-5 text-brand" />
                Como instalar no seu iPhone
              </span>
              <button
                onClick={() => setShowIosModal(false)}
                className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                aria-label="Fechar modal"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-3 text-xs text-muted">
              O Safari do iPhone exige que o app seja adicionado à tela de início para ativar as notificações push e funcionar como aplicativo:
            </p>

            <ol className="mt-4 flex flex-col gap-3.5 text-sm text-ink-2">
              <li className="flex items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                  1
                </span>
                <span>
                  No Safari, toque no botão <strong>Compartilhar</strong>{" "}
                  <Share className="inline size-4 text-brand align-text-bottom mx-1" aria-label="ícone de compartilhar" />{" "}
                  (quadrado com seta para cima na barra inferior).
                </span>
              </li>

              <li className="flex items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                  2
                </span>
                <span>
                  Role o menu para baixo e toque em{" "}
                  <strong>Adicionar à Tela de Início</strong>{" "}
                  <SquarePlus className="inline size-4 text-brand align-text-bottom mx-1" aria-label="ícone de mais" />.
                </span>
              </li>

              <li className="flex items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                  3
                </span>
                <span>
                  Toque em <strong>Adicionar</strong> no canto superior direito.
                </span>
              </li>

              <li className="flex items-start gap-3 bg-brand/5 p-3 rounded-xl border border-brand/10">
                <Check className="size-5 text-brand shrink-0 mt-0.5" />
                <span className="text-xs text-ink leading-relaxed">
                  <strong>Pronto!</strong> Abra o <strong>Domu Pulse</strong> pelo novo ícone na sua tela de início para ativar os alertas de relatórios.
                </span>
              </li>
            </ol>

            <Button onClick={() => setShowIosModal(false)} className="mt-5 w-full">
              Entendido
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
