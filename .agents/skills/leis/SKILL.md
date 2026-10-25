---
name: leis
description: Consulta a legislação brasileira em Markdown do acervo ctresb/leis (Constituição, leis e decretos federais, estaduais, municipais, atos de reguladores e jurisprudência). Use ao escrever ou revisar Termos de Uso, Política de Privacidade, textos de LGPD, cláusulas contratuais, regras fiscais (NFS-e) ou trabalhistas (recrutamento) do Domu Pulse, ou sempre que precisar citar o texto de uma norma.
---

# Leis brasileiras (acervo ctresb/leis)

O repositório https://github.com/ctresb/leis (licença MIT, autor João Davi) converte normas
brasileiras de fontes oficiais para Markdown, com cabeçalho YAML (`titulo`, `tipo`, `numero`,
`data`, `ementa`, `versao_texto`, `fonte`, `baixado_em`...).

**Nunca clone o repositório inteiro.** São mais de 1,2 milhão de arquivos e vários GB. Use o
script abaixo, que baixa só o índice e os arquivos pedidos, ou o link raw de um arquivo.

> Esta skill fica em `.agents/skills/leis/`. Para o Claude Code, que lê `.claude/skills/`,
> copie a pasta: `xcopy /E /I .agents\skills\leis .claude\skills\leis` (Windows) ou
> `cp -r .agents/skills/leis .claude/skills/` (macOS/Linux).

## Primeiro: as leis que o Domu Pulse já usa (offline)

Em `referencias/`, copiadas do acervo em 25/10/2026:

| Arquivo | Norma | Para quê no Pulse |
| --- | --- | --- |
| `lgpd-lei-13709-2018.md` | LGPD, texto compilado | Política de Privacidade, papéis controlador/operador, direitos (art. 18 a 20), encarregado (art. 41), incidentes (art. 48), transferência internacional (art. 33) |
| `lei-15352-2026-agencia-nacional-protecao-dados.md` | Lei 15.352/2026 | Transformou a ANPD em **Agência** Nacional de Proteção de Dados. O texto compilado da LGPD acima ainda diz "Autoridade": vale a redação desta lei |
| `marco-civil-lei-12965-2014.md` | Marco Civil da Internet | Guarda de registros de acesso por 6 meses (art. 15) |
| `decreto-8771-2016-regulamenta-marco-civil.md` | Decreto 8.771/2016 | Padrões de segurança para guarda de registros (art. 13) |
| `lei-9029-1995-discriminacao-no-trabalho.md` | Lei 9.029/1995 | Critérios proibidos na seleção de candidatos (art. 1º) |

## Buscar e baixar qualquer outra norma

Requer `git` e Node. O script guarda um cache fora do projeto, em `~/.cache/ctresb-leis` (o
índice ocupa ~150 MB; os textos entram só quando pedidos). Mude o local com `LEIS_CACHE`.

```bash
# 1. Baixa o índice (uma vez; leva 1-2 minutos). Rode de novo para atualizar.
node .agents/skills/leis/scripts/leis.mjs indice

# 2. Procura pelo caminho (aceita vários termos; todos precisam aparecer)
node .agents/skills/leis/scripts/leis.mjs buscar federal leis-ordinarias 13709
node .agents/skills/leis/scripts/leis.mjs buscar resolucao-cd-anpd

# 3. Baixa e imprime o texto
node .agents/skills/leis/scripts/leis.mjs ler federal/leis-ordinarias/2018/lei-13709-2018-08-14.md

# 4. Procura dentro das ementas dos arquivos já baixados ou de uma pasta pequena
node .agents/skills/leis/scripts/leis.mjs ementas federal/leis-ordinarias/2026 "proteção de dados"
```

Sem o script, um arquivo avulso sai direto pelo raw do GitHub:
`https://raw.githubusercontent.com/ctresb/leis/main/<caminho>`.

### Como os caminhos são montados

```
constituicao.md
federal/leis-ordinarias/AAAA/lei-NUMERO-AAAA-MM-DD.md      (número sem ponto: 13709)
federal/leis-complementares/AAAA/...
federal/decretos/AAAA/dec-NUMERO-AAAA-MM-DD.md
federal/medidas-provisorias/AAAA/mpv-NUMERO-AAAA-MM-DD.md
estaduais/UF/leis-ordinarias/AAAA/...
municipais/UF/<municipio>/...
reguladores/<orgao>/<tipo>/AAAA/...                          (ANPD fica em reguladores/mj/)
jurisprudencia/<tribunal>/...
```

## Normas relevantes que NÃO estão no acervo (confira na fonte oficial)

Em out/2026 o acervo não traz os regulamentos da ANPD que mais pesam para o Pulse. Consulte-os em
gov.br/anpd antes de citar:

- **Resolução CD/ANPD nº 2/2022**: regulamento para agentes de tratamento de pequeno porte
  (dispensa de encarregado, prazos em dobro), salvo tratamento de alto risco.
- **Resolução CD/ANPD nº 15/2024**: comunicação de incidente à ANPD e aos titulares em **3 dias
  úteis** e registro de incidentes por 5 anos.
- **Resolução CD/ANPD nº 18/2024**: encarregado; identidade e contato divulgados publicamente.
- **Resolução CD/ANPD nº 19/2024**: transferência internacional e cláusulas-padrão contratuais.

Marco legal da IA (PL 2338/2023): aprovado no Senado em dez/2024, ainda em tramitação na Câmara
em out/2026. Não é lei; não cite como vigente.

## Regras ao usar

1. Leia o cabeçalho: `versao_texto: "original"` não traz alterações posteriores; `"compilada"`
   traz, mas pode estar atrasada (caso da LGPD x Lei 15.352/2026). Procure leis posteriores que
   alterem a norma (`ementas ... "altera a Lei nº ..."`).
2. Os textos são conversões automáticas e OCR. **Não substituem o Diário Oficial**: confira o link
   do campo `fonte` antes de citar artigo e número em documento público.
3. Ao mudar `src/app/termos/page.tsx` ou `src/app/privacidade/page.tsx`, troque
   `LEGAL_DOCS_VERSION` em `src/lib/legal.ts` para a data do dia. É isso que pede um novo aceite a
   quem aceitou a versão anterior.
4. Documento jurídico gerado com ajuda desta skill deve ser revisado por advogado antes de ir ao ar.
