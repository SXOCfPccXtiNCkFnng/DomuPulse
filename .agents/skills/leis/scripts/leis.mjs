#!/usr/bin/env node
// Consulta o acervo https://github.com/ctresb/leis sem clonar os vários GB de texto.
// Faz um clone "blobless" (só a árvore de arquivos) num cache e baixa cada norma sob demanda.
//
//   node leis.mjs indice                       baixa/atualiza o índice
//   node leis.mjs buscar <termo> [termo...]    procura nos caminhos (todos os termos, sem maiúsculas)
//   node leis.mjs ler <caminho>                baixa e imprime o arquivo
//   node leis.mjs ementas <pasta> <texto>      baixa a pasta (até 400 arquivos) e filtra pela ementa

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REPO = "https://github.com/ctresb/leis.git";
const CACHE = process.env.LEIS_CACHE || join(homedir(), ".cache", "ctresb-leis");
const GIT_DIR = join(CACHE, "repo");
const INDEX = join(CACHE, "indice.txt");
const MAX_PASTA = 400;

const git = (args, opts = {}) =>
  execFileSync("git", args, { cwd: GIT_DIR, encoding: "utf8", maxBuffer: 1024 * 1024 * 512, ...opts });

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function indice() {
  mkdirSync(CACHE, { recursive: true });
  if (!existsSync(join(GIT_DIR, ".git"))) {
    console.error("Baixando o índice do acervo (só a árvore, sem os textos)...");
    execFileSync("git", ["clone", "--filter=blob:none", "--no-checkout", "--depth", "1", REPO, GIT_DIR], { stdio: "inherit" });
  } else {
    console.error("Atualizando o índice...");
    git(["fetch", "--depth", "1", "--filter=blob:none", "origin", "main"], { stdio: "inherit" });
    git(["update-ref", "HEAD", "FETCH_HEAD"]);
  }
  const tree = git(["ls-tree", "-r", "--name-only", "HEAD"]);
  writeFileSync(INDEX, tree);
  console.error(`Pronto: ${tree.split("\n").filter(Boolean).length.toLocaleString("pt-BR")} arquivos no índice.`);
}

function exigirIndice() {
  if (!existsSync(INDEX)) {
    console.error("Índice ainda não baixado. Rode primeiro: node leis.mjs indice");
    process.exit(1);
  }
}

function buscar(termos) {
  exigirIndice();
  if (!termos.length) return console.error("Informe ao menos um termo.");
  const ts = termos.map(norm);
  const achados = readFileSync(INDEX, "utf8")
    .split("\n")
    // Só os textos: _fonte/ e _lotes/ guardam originais comprimidos e metadados de coleta.
    .filter((p) => p.endsWith(".md") && !/\/_(fonte|lotes|indice)\//.test(p) && ts.every((t) => norm(p).includes(t)));
  achados.slice(0, 200).forEach((p) => console.log(p));
  if (achados.length > 200) console.error(`... e mais ${achados.length - 200}. Refine a busca.`);
  if (!achados.length) console.error("Nada encontrado. Tente o número sem ponto (13709) ou parte do nome da pasta.");
}

function baixar(caminhos) {
  git(["checkout", "HEAD", "--", ...caminhos], { stdio: ["ignore", "ignore", "inherit"] });
}

function ler(caminho) {
  exigirIndice();
  if (!caminho) return console.error("Informe o caminho, ex.: federal/leis-ordinarias/2018/lei-13709-2018-08-14.md");
  baixar([caminho]);
  process.stdout.write(readFileSync(join(GIT_DIR, caminho), "utf8"));
}

function ementas(pasta, texto) {
  exigirIndice();
  if (!pasta || !texto) return console.error('Uso: node leis.mjs ementas <pasta> "<texto>"');
  const prefixo = pasta.replace(/\/?$/, "/");
  const arquivos = readFileSync(INDEX, "utf8")
    .split("\n")
    .filter((p) => p.startsWith(prefixo) && p.endsWith(".md"));
  if (!arquivos.length) return console.error("Pasta vazia ou inexistente no índice.");
  if (arquivos.length > MAX_PASTA) {
    return console.error(`A pasta tem ${arquivos.length} arquivos (limite ${MAX_PASTA}). Use uma subpasta, por exemplo o ano.`);
  }
  for (let i = 0; i < arquivos.length; i += 100) baixar(arquivos.slice(i, i + 100));
  const alvo = norm(texto);
  for (const f of arquivos) {
    const ementa = readFileSync(join(GIT_DIR, f), "utf8").match(/^ementa:\s*"?(.*?)"?\s*$/m)?.[1] ?? "";
    if (norm(ementa).includes(alvo)) console.log(`${f}\n    ${ementa.slice(0, 300)}\n`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
const comandos = { indice: () => indice(), buscar: () => buscar(args), ler: () => ler(args[0]), ementas: () => ementas(args[0], args.slice(1).join(" ")) };
if (!comandos[cmd]) {
  console.error("Comandos: indice | buscar <termos> | ler <caminho> | ementas <pasta> <texto>");
  process.exit(cmd ? 1 : 0);
}
comandos[cmd]();
