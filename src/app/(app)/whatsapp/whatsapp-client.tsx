"use client";

import { Loader2, QrCode, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { disconnectWhatsapp, refreshStatus, resetWhatsapp, startConnection } from "./actions";

type Status = "disconnected" | "connecting" | "connected";

export function WhatsappConnect({ initialStatus, phone }: { initialStatus: Status; phone: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [num, setNum] = useState(phone);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  // Enquanto mostra o QR, pergunta a situação a cada 4s até conectar.
  useEffect(() => {
    if (!qr) return;
    polling.current = setInterval(async () => {
      const r = await refreshStatus();
      if ("status" in r) {
        setStatus(r.status);
        setNum(r.number ?? null);
        if (r.status === "connected") {
          setQr(null);
          router.refresh();
        }
      }
    }, 4000);
    return () => {
      if (polling.current) clearInterval(polling.current);
    };
  }, [qr, router]);

  const connect = () =>
    start(async () => {
      setError(null);
      const r = await startConnection();
      if ("error" in r) return setError(r.error);
      if ("connected" in r && r.connected) {
        setStatus("connected");
        router.refresh();
        return;
      }
      if (!r.qrcodeBase64) return setError("Não foi possível gerar o QR agora. Tente de novo em instantes.");
      setQr(r.qrcodeBase64);
      setPairing(r.pairingCode ?? null);
      setStatus("connecting");
    });

  const disconnect = () =>
    start(async () => {
      await disconnectWhatsapp();
      setStatus("disconnected");
      setNum(null);
      setQr(null);
      router.refresh();
    });

  const reset = () =>
    start(async () => {
      await resetWhatsapp();
      setStatus("disconnected");
      setNum(null);
      setQr(null);
      router.refresh();
    });

  const qrSrc = qr ? (qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Smartphone className="size-5 text-muted" />
        {status === "connected" ? (
          <>
            <Badge tone="brand">Conectado</Badge>
            {num ? <span className="text-sm text-muted tabular-nums">{num}</span> : null}
          </>
        ) : status === "connecting" ? (
          <Badge tone="warn">Conectando...</Badge>
        ) : (
          <Badge>Desconectado</Badge>
        )}
      </div>

      {error ? <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}

      {qrSrc ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface-2 p-6 text-center">
          <p className="text-sm font-medium">Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho → aponte para o código.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR em base64 vindo do Evolution */}
          <img src={qrSrc} alt="QR code para conectar o WhatsApp" width={256} height={256} className="rounded-xl bg-white p-2" />
          {pairing ? (
            <p className="text-sm text-muted">
              Ou use o código: <span className="font-mono font-semibold tracking-widest">{pairing}</span>
            </p>
          ) : null}
          <p className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="size-3.5 animate-spin" />
            Esperando a leitura...
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "connected" ? (
          <Button variant="secondary" onClick={disconnect} disabled={pending}>
            Desconectar número
          </Button>
        ) : (
          <Button onClick={connect} disabled={pending}>
            <QrCode className="size-4" />
            {pending ? "Gerando QR..." : qrSrc ? "Gerar novo QR" : "Conectar WhatsApp"}
          </Button>
        )}
        <Button variant="ghost" onClick={reset} disabled={pending}>
          Reiniciar conexão
        </Button>
      </div>
    </div>
  );
}
