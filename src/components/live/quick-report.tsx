"use client";

import clsx from "clsx";
import { ArrowUp, Mic, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { interpretQuickEntry } from "@/app/(app)/painel/actions";
import { METRICS, type MetricKey, type Totals } from "@/lib/metrics";

export type QuickEntry = { id: string; text: string; deltas: Partial<Record<MetricKey, number>>; note: string | null; at: string };

const MAX_SECONDS = 75;
const RECORD_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];

function deltaLabel(key: MetricKey, n: number) {
  const m = METRICS.find((x) => x.key === key)!;
  return `${n > 0 ? "+" : ""}${n} ${m.label}`;
}

/**
 * Relatório rápido: o corretor digita ou fala o que fez e a IA soma nos
 * campos do relatório. Cada mensagem vira uma linha que dá para desfazer.
 */
export function QuickReport({
  current,
  entries,
  onEntry,
  onUndo,
}: {
  current: Totals;
  entries: QuickEntry[];
  onEntry: (entry: QuickEntry) => void;
  onUndo: (entry: QuickEntry) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [canRecord, setCanRecord] = useState(false);

  useEffect(() => {
    // Recurso do navegador: só dá para saber depois de montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanRecord(typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
    return () => {
      if (timer.current) clearInterval(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function send(payload: { text?: string; audio?: Blob }) {
    setBusy(true);
    setError(null);
    const data = new FormData();
    if (payload.text) data.set("text", payload.text);
    if (payload.audio) data.set("audio", new File([payload.audio], "relato", { type: payload.audio.type }));
    data.set("current", JSON.stringify(current));
    const r = await interpretQuickEntry(data).catch(() => ({ error: "Sem conexão. Tente de novo." }));
    setBusy(false);
    if ("error" in r) {
      setError(r.error);
      return false;
    }
    onEntry({ id: crypto.randomUUID(), text: r.heard, deltas: r.deltas, note: r.note, at: new Date().toISOString() });
    return true;
  }

  async function submitText() {
    const value = text.trim();
    if (value.length < 2 || busy) return;
    if (await send({ text: value })) setText("");
  }

  function stopTracks() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  async function startRecording() {
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const mimeType = RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(media, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
      chunks.current = [];
      cancelled.current = false;
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stopTracks();
        setRecording(false);
        if (cancelled.current || chunks.current.length === 0) return;
        void send({ audio: new Blob(chunks.current, { type: rec.mimeType || mimeType || "audio/webm" }) });
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      setRecording(true);
      let elapsed = 0;
      timer.current = setInterval(() => {
        elapsed++;
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS && rec.state === "recording") rec.stop();
      }, 1000);
    } catch {
      stopTracks();
      setError("Não consegui acessar o microfone. Libere o microfone para o Pulse nas configurações do navegador, ou digite.");
    }
  }

  function stopRecording(cancel = false) {
    cancelled.current = cancel;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  return (
    <div className="flex flex-col gap-3 border-b border-line px-5 pb-5 sm:px-6">
      <div className="flex items-center gap-2 text-sm font-medium text-brand-text">
        <Sparkles className="size-4" />
        Relatório rápido
        <span className="font-normal text-muted">fale ou digite o que fez, a IA preenche</span>
      </div>

      {entries.length ? (
        <ul className="flex flex-col gap-1.5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-ink-2">“{e.text}”</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(e.deltas).map(([k, n]) => (
                    <span key={k} className={clsx("rounded-md px-1.5 py-0.5 text-xs font-medium", (n ?? 0) > 0 ? "bg-brand-soft text-brand-text" : "bg-warn-soft text-warn")}>
                      {deltaLabel(k as MetricKey, n ?? 0)}
                    </span>
                  ))}
                  {e.note ? <span className="rounded-md bg-surface px-1.5 py-0.5 text-xs text-muted">Obs. adicionada</span> : null}
                </p>
              </div>
              <button type="button" onClick={() => onUndo(e)} aria-label="Desfazer" title="Desfazer" className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {recording ? (
        <div className="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2">
          <span className="size-2.5 animate-pulse rounded-full bg-danger" />
          <span className="flex-1 text-sm tabular-nums text-danger">
            Gravando {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            <span className="text-muted"> · até {MAX_SECONDS}s</span>
          </span>
          <button type="button" onClick={() => stopRecording(true)} className="text-sm text-muted hover:text-ink">
            Cancelar
          </button>
          <button type="button" onClick={() => stopRecording()} className="flex h-9 items-center gap-1.5 rounded-lg bg-danger px-3 text-sm font-medium text-white">
            <Square className="size-3.5 fill-current" />
            Pronto
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitText();
              }
            }}
            rows={1}
            disabled={busy}
            placeholder={busy ? "Entendendo..." : "Ex.: atendi 4 leads, agendei 2 visitas e fiz uma proposta"}
            className="max-h-32 min-h-11 w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] placeholder:text-muted/70 hover:border-line-strong focus:border-ink focus:outline-none disabled:opacity-60"
          />
          {text.trim() ? (
            <button type="button" onClick={submitText} disabled={busy} aria-label="Enviar para a IA" className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink disabled:opacity-50">
              <ArrowUp className={clsx("size-5", busy && "animate-pulse")} />
            </button>
          ) : canRecord ? (
            <button type="button" onClick={startRecording} disabled={busy} aria-label="Gravar áudio" className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink disabled:opacity-50">
              <Mic className={clsx("size-5", busy && "animate-pulse")} />
            </button>
          ) : null}
        </div>
      )}
      {busy && !recording ? <p className="text-[13px] text-muted">Entendendo o que você fez...</p> : null}
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
