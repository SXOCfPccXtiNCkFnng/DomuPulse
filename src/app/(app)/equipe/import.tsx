"use client";

import clsx from "clsx";
import { Check, Download, FileUp, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { IMPORT_MAX_ROWS, IMPORT_TEMPLATE, normalize, parseTeamCsv, roleFromText, type ImportRow } from "@/lib/team-import";
import { importMembers, type ImportResult } from "./actions";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Prévia: o mesmo que o servidor vai conferir, para a pessoa corrigir antes.
function problemOf(row: ImportRow, teams: Map<string, string>, singleTeam: boolean, seen: Set<string>, canInviteManagers: boolean) {
  if (row.fullName.trim().length < 2) return "Nome faltando";
  if (!EMAIL.test(row.email)) return "E-mail inválido";
  if (seen.has(row.email)) return "E-mail repetido";
  const role = roleFromText(row.role);
  if (!role) return "Cargo deve ser corretor ou gerente";
  if (role === "manager" && !canInviteManagers) return "Você só pode convidar corretores";
  if (row.team ? !teams.has(normalize(row.team)) : !singleTeam) return row.team ? "Equipe não encontrada" : "Equipe faltando";
  return null;
}

export function ImportMembers({ teams, canInviteManagers }: { teams: string[]; canInviteManagers: boolean }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [pending, start] = useTransition();

  const teamMap = useMemo(() => new Map(teams.map((t) => [normalize(t), t])), [teams]);
  const checked = useMemo(() => {
    const seen = new Set<string>();
    return rows.map((row) => {
      const problem = problemOf(row, teamMap, teams.length === 1, seen, canInviteManagers);
      if (!problem) seen.add(row.email);
      return { row, problem };
    });
  }, [rows, teamMap, teams.length, canInviteManagers]);
  const ready = checked.filter((c) => !c.problem).length;

  async function onFile(file: File | undefined) {
    setError(null);
    setResults(null);
    if (!file) return;
    if (file.size > 1_000_000) return setError("Arquivo grande demais. Use até 1 MB.");
    if (/\.xlsx?$/i.test(file.name)) return setError("Salve a planilha como CSV (Arquivo, Salvar como, CSV) e envie de novo.");
    const parsed = parseTeamCsv(await file.text());
    if (parsed.length === 0) return setError("Nenhuma linha encontrada no arquivo.");
    if (parsed.length > IMPORT_MAX_ROWS) return setError(`No máximo ${IMPORT_MAX_ROWS} pessoas por vez.`);
    setFileName(file.name);
    setRows(parsed);
  }

  function send() {
    start(async () => {
      const response = await importMembers(checked.filter((c) => !c.problem).map((c) => c.row));
      if (response.error) return setError(response.error);
      setResults(response.results ?? []);
      setRows([]);
    });
  }

  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${IMPORT_TEMPLATE}`)}`;

  return (
    <div className="flex flex-col gap-4 p-5 sm:p-6">
      <p className="text-sm text-ink-2">
        Uma pessoa por linha, com nome, e-mail, cargo (corretor ou gerente) e equipe. Cada uma recebe o convite por e-mail.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={template} download="modelo-equipe-pulse.csv" className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-2">
          <Download className="size-4" />
          Baixar modelo
        </a>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-brand px-3 text-sm font-medium text-brand-ink hover:brightness-125">
          <FileUp className="size-4" />
          Escolher arquivo CSV
          <input type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>

      {error ? <FormMessage>{error}</FormMessage> : null}

      {rows.length ? (
        <>
          <p className="text-sm text-muted">
            {fileName}: {ready} de {rows.length} prontas para convidar
          </p>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {checked.map(({ row, problem }) => (
              <li key={row.line} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={clsx("grid size-5 shrink-0 place-items-center rounded-full", problem ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-text")}>
                  {problem ? <X className="size-3" /> : <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.fullName || "Sem nome"}</span>
                  <span className="block truncate text-xs text-muted">
                    {row.email || "sem e-mail"}
                    {row.team ? `, ${row.team}` : ""}
                  </span>
                </span>
                {problem ? <span className="shrink-0 text-xs text-danger">{problem}</span> : null}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button onClick={send} disabled={pending || ready === 0}>
              {pending ? "Enviando convites..." : `Convidar ${ready} ${ready === 1 ? "pessoa" : "pessoas"}`}
            </Button>
            <Button variant="ghost" onClick={() => setRows([])} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </>
      ) : null}

      {results ? (
        <div className="flex flex-col gap-2">
          <FormMessage tone={results.every((r) => r.ok) ? "success" : "error"}>
            {results.filter((r) => r.ok).length} convites enviados
            {results.some((r) => !r.ok) ? `, ${results.filter((r) => !r.ok).length} com problema` : ""}.
          </FormMessage>
          {results.some((r) => !r.ok) ? (
            <ul className="flex flex-col gap-1 text-xs">
              {results
                .filter((r) => !r.ok)
                .map((r) => (
                  <li key={r.line} className="text-danger">
                    Linha {r.line} ({r.email || "sem e-mail"}): {r.error}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
