import { describe, expect, it } from "vitest";
import { parseMoney } from "@/lib/money";
import { IMPORT_TEMPLATE, normalize, parseTeamCsv, roleFromText } from "@/lib/team-import";

describe("planilha de equipe", () => {
  it("lê o modelo com cabeçalho e ponto e vírgula", () => {
    const rows = parseTeamCsv(IMPORT_TEMPLATE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ line: 2, fullName: "Maria Souza", email: "maria@imobiliaria.com.br", role: "corretor", team: "Equipe Norte" });
  });

  it("aceita vírgula, aspas, colunas em outra ordem e BOM do Excel", () => {
    const rows = parseTeamCsv('﻿E-mail,Nome,Equipe,Cargo\r\nJOAO@X.COM,"Silva, João",Equipe Sul,Gerente\r\n');
    expect(rows[0]).toMatchObject({ fullName: "Silva, João", email: "joao@x.com", team: "Equipe Sul", role: "Gerente" });
  });

  it("entende cargo e equipe sem acento e sem diferença de maiúsculas", () => {
    expect(roleFromText("Corretora")).toBe("broker");
    expect(roleFromText("GERENTE")).toBe("manager");
    expect(roleFromText("")).toBe("broker");
    expect(roleFromText("diretor")).toBeNull();
    expect(normalize("  Equipe   São  Paulo ")).toBe("equipe sao paulo");
  });
});

describe("valores em reais", () => {
  it.each([
    ["1.500,00", 150000],
    ["450.000", 45000000],
    ["R$ 1.234,56", 123456],
    ["1234.56", 123456],
    ["", null],
    ["0", null],
  ])("%s vira %s centavos", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });
});
