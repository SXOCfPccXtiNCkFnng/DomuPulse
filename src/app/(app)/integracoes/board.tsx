"use client";

import { CheckCircle2, Sheet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { pickSpreadsheet } from "@/lib/google/picker-client";
import { type BrokerName, connectSpreadsheet, disconnectSheets, getBrokerMapping, getPickerToken, saveBrokerMap, syncNow } from "./actions";

const ERRORS: Record<string, string> = {
  "sem-permissao": "Só a liderança pode conectar a planilha.",
  state: "A conexão expirou. Tente conectar de novo.",
  "sem-refresh": "O Google não liberou o acesso contínuo. Conecte de novo e aceite todas as permissões.",
  conexao: "Não foi possível concluir a conexão. Tente de novo.",
  cancelado: "Conexão cancelada.",
};

export function IntegrationsBoard({
  connected,
  spreadsheetUrl,
  sheetReady,
  ok,
  erro,
}: {
  connected: boolean;
  spreadsheetUrl: string | null;
  sheetReady: boolean;
  ok: string | null;
  erro: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [mapInfo, setMapInfo] = useState<{ mapped: { label: string; header: string }[]; missing: string[] } | null>(null);
  const [mapper, setMapper] = useState<{ names: BrokerName[]; members: { id: string; name: string }[] } | null>(null);

  const openMapper = () =>
    start(async () => {
      setError(null);
      setNote(null);
      const r = await getBrokerMapping();
      if ("error" in r) return setError(r.error);
      setMapper({ names: r.names, members: r.members });
    });

  const disconnect = () =>
    start(async () => {
      setError(null);
      await disconnectSheets();
      setMapInfo(null);
      router.refresh();
    });

  const choose = () =>
    start(async () => {
      setError(null);
      const t = await getPickerToken();
      if ("error" in t) return setError(t.error);

      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "";
      const appId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").split("-")[0];
      if (!apiKey || !appId) return setError("Faltam as chaves do Google (API key). Confira a configuração.");

      let picked;
      try {
        picked = await pickSpreadsheet(t.token, apiKey, appId);
      } catch {
        return setError("Não foi possível abrir o seletor do Google. Tente de novo.");
      }
      if (!picked) return; // cancelou

      const r = await connectSpreadsheet({ spreadsheetId: picked.id, url: picked.url, name: picked.name });
      if ("error" in r) return setError(r.error);
      setMapInfo({ mapped: r.mapped, missing: r.missing });
      const partes = [
        r.imported > 0 ? `${r.imported} ${r.imported === 1 ? "visita importada da planilha" : "visitas importadas da planilha"}` : null,
        `${r.pushed} ${r.pushed === 1 ? "visita enviada" : "visitas enviadas"}`,
        r.pending > 0 ? `${r.pending} ${r.pending === 1 ? "linha sem corretor reconhecido (confira)" : "linhas sem corretor reconhecido (confira)"}` : null,
      ].filter(Boolean);
      setNote(`Planilha conectada. ${partes.join(" · ")}.`);
      router.refresh();
    });

  const resync = () =>
    start(async () => {
      setError(null);
      setNote(null);
      const r = await syncNow();
      if ("error" in r) return setError(r.error);
      const IMP_ERR: Record<string, string> = {
        "sem-cabecalho": "Não achei a linha de títulos (Nome do cliente, Telefone, Corretor...) na planilha.",
        "sem-planilha": "Nenhuma planilha escolhida.",
        "sem-token": "Reconecte a conta do Google.",
        insercao: "Erro ao salvar as visitas importadas.",
      };
      if (r.importError) {
        setNote(`Enviadas ${r.pushed}. Importação: ${IMP_ERR[r.importError] ?? r.importError}`);
      } else {
        const partes = [
          `${r.imported} ${r.imported === 1 ? "importada da planilha" : "importadas da planilha"}`,
          `${r.pushed} ${r.pushed === 1 ? "enviada" : "enviadas"}`,
          r.pending > 0 ? `${r.pending} sem corretor (${r.pendingNames.slice(0, 6).join(", ")})` : null,
        ].filter(Boolean);
        setNote(`Sincronizado. ${partes.join(" · ")}.`);
      }
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      <header className="animate-rise">
        <p className="text-sm text-muted">Gestão</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Integrações</h1>
        <p className="mt-1 text-sm text-muted">Conecte a empresa a ferramentas externas. As visitas podem ficar em sincronia com uma planilha do Google.</p>
      </header>

      {erro ? <FormMessage>{ERRORS[erro] ?? "Algo deu errado. Tente de novo."}</FormMessage> : null}
      {ok === "conectado" ? <FormMessage tone="success">Conta do Google conectada.</FormMessage> : null}
      {note ? <FormMessage tone="success">{note}</FormMessage> : null}
      {error ? <FormMessage>{error}</FormMessage> : null}

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Sheet className="size-5 text-brand-text" />
              Google Sheets (Visitas)
            </span>
          }
          description="Mantém a sua planilha de visitas em sincronia com o Pulse."
        />
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          {!connected ? (
            <>
              <p className="text-sm text-muted">
                Conecte a conta do Google da empresa. Depois você escolhe a planilha que já usa, e as visitas passam a aparecer nela automaticamente.
              </p>
              <a href="/api/google/connect" className={buttonClass("primary", "md", "self-start")}>
                <Sheet className="size-4" />
                Conectar Google Sheets
              </a>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-ok">
                <CheckCircle2 className="size-5" />
                Conta do Google conectada
              </div>

              {sheetReady && spreadsheetUrl ? (
                <div className="flex flex-col gap-3">
                  <a href={spreadsheetUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-text hover:underline">
                    Abrir a planilha conectada
                  </a>
                  {mapInfo ? <MappingInfo info={mapInfo} /> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={resync} disabled={pending}>
                      {pending ? "Sincronizando..." : "Sincronizar agora"}
                    </Button>
                    <Button variant="secondary" onClick={openMapper} disabled={pending}>
                      Vincular corretores
                    </Button>
                    <Button variant="secondary" onClick={choose} disabled={pending}>
                      {pending ? "Abrindo..." : "Trocar planilha"}
                    </Button>
                  </div>
                  {mapper ? (
                    <BrokerMapper
                      data={mapper}
                      onClose={() => setMapper(null)}
                      onSaved={(msg) => {
                        setMapper(null);
                        setNote(msg);
                        router.refresh();
                      }}
                    />
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted">Agora escolha a planilha que a empresa já usa. O Pulse vai detectar as colunas sozinho.</p>
                  <Button onClick={choose} disabled={pending} className="self-start">
                    {pending ? "Abrindo..." : "Escolher planilha"}
                  </Button>
                  {mapInfo ? <MappingInfo info={mapInfo} /> : null}
                </>
              )}

              <Button variant="ghost" onClick={disconnect} disabled={pending} className="self-start">
                Desconectar
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function BrokerMapper({
  data,
  onClose,
  onSaved,
}: {
  data: { names: BrokerName[]; members: { id: string; name: string }[] };
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [sel, setSel] = useState<Record<string, string>>(() => Object.fromEntries(data.names.map((n) => [n.name, n.memberId ?? ""])));
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const save = () =>
    start(async () => {
      setErr(null);
      const entries = data.names.map((n) => ({ name: n.name, memberId: sel[n.name] })).filter((e) => e.memberId);
      if (entries.length === 0) return setErr("Escolha ao menos um corretor.");
      const r = await saveBrokerMap(entries);
      if ("error" in r) return setErr(r.error);
      const partes = [`${r.imported} importadas`, r.pending > 0 ? `${r.pending} ainda sem corretor` : null].filter(Boolean);
      onSaved(`Vínculos salvos. ${partes.join(" · ")}.`);
    });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Vincular corretores da planilha</p>
        <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface">
          <X className="size-4" />
        </button>
      </div>
      <p className="text-xs text-muted">Para cada nome que está na planilha, escolha o corretor cadastrado. Deixe em branco para ignorar.</p>
      {err ? <FormMessage>{err}</FormMessage> : null}
      <ul className="flex flex-col gap-2">
        {data.names.map((n) => (
          <li key={n.name} className="flex flex-wrap items-center gap-2">
            <span className="w-40 shrink-0 truncate text-sm font-medium">
              {n.name}
              {n.auto ? <span className="ml-1 text-xs font-normal text-ok">auto</span> : null}
            </span>
            <select
              value={sel[n.name] ?? ""}
              onChange={(e) => setSel((s) => ({ ...s, [n.name]: e.target.value }))}
              className="h-9 min-w-48 flex-1 rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-ink"
            >
              <option value="">— deixar de fora —</option>
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <Button onClick={save} disabled={busy} className="self-start">
        {busy ? "Salvando..." : "Salvar e importar"}
      </Button>
    </div>
  );
}

function MappingInfo({ info }: { info: { mapped: { label: string; header: string }[]; missing: string[] } }) {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
      <p className="font-medium">Colunas reconhecidas:</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-muted">
        {info.mapped.map((m) => (
          <li key={m.label}>
            {m.label} → <span className="text-ink-2">{m.header}</span>
          </li>
        ))}
      </ul>
      {info.missing.length ? (
        <p className="mt-2 text-muted">
          Sem coluna na planilha (o Pulse vai criar): <span className="text-ink-2">{info.missing.join(", ")}</span>
        </p>
      ) : null}
    </div>
  );
}
