// Planilha de equipe: colunas nome, e-mail, cargo e equipe. Aceita CSV
// separado por ponto e vírgula (Excel em português) ou vírgula.

export const IMPORT_MAX_ROWS = 200;
export const IMPORT_TEMPLATE = "nome;email;cargo;equipe\nMaria Souza;maria@empresa.com.br;corretor;Equipe Norte\nCarlos Lima;carlos@empresa.com.br;gerente;Equipe Norte\n";

export type ImportRow = { line: number; fullName: string; email: string; role: string; team: string };

/** Sem acento, minúsculo e sem espaços extras: "Equipe  Norte" = "equipe norte". */
export function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function roleFromText(value: string): "manager" | "broker" | null {
  const v = normalize(value);
  if (!v || ["corretor", "corretora", "broker"].includes(v)) return "broker";
  if (["gerente", "manager"].includes(v)) return "manager";
  return null;
}

function splitLine(line: string, sep: string) {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/** Lê o texto do CSV. A primeira linha é o cabeçalho, se tiver "nome" ou "email". */
export function parseTeamCsv(text: string): ImportRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";

  let cols = { name: 0, email: 1, role: 2, team: 3 };
  let first = 0;
  const header = splitLine(lines[0], sep).map(normalize);
  if (header.some((h) => h === "nome" || h.startsWith("e-mail") || h === "email")) {
    const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
    cols = {
      name: find("nome", "nome completo", "name"),
      email: find("email", "e-mail", "e mail"),
      role: find("cargo", "funcao", "função", "role"),
      team: find("equipe", "time", "team"),
    };
    first = 1;
  }

  return lines.slice(first).map((line, i) => {
    const cells = splitLine(line, sep);
    const at = (idx: number) => (idx >= 0 ? (cells[idx] ?? "") : "");
    return { line: i + first + 1, fullName: at(cols.name), email: at(cols.email).toLowerCase(), role: at(cols.role), team: at(cols.team) };
  });
}
