import { describe, expect, it } from "vitest";
import { isCpfOrCnpj } from "@/lib/document";
import { passwordIssues } from "@/lib/password";
import { formatPhoneBR, validatePhoneBR } from "@/lib/phone";
import { safeNext } from "@/lib/safe-redirect";
import { fullNameSchema, passwordSchema } from "@/lib/validation";

describe("senha", () => {
  it("aceita senha que cumpre todas as regras", () => {
    expect(passwordIssues("Pulse@Teste2026")).toHaveLength(0);
    expect(passwordSchema.safeParse("Pulse@Teste2026").success).toBe(true);
  });

  it.each([
    ["curta", "Ab1!"],
    ["sem maiúscula", "pulse@teste2026"],
    ["sem minúscula", "PULSE@TESTE2026"],
    ["sem número", "Pulse@TesteForte"],
    ["sem símbolo", "PulseTeste2026"],
  ])("recusa senha %s", (_, value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });
});

describe("nome completo", () => {
  it("exige nome e sobrenome", () => {
    expect(fullNameSchema.safeParse("Alan").success).toBe(false);
    expect(fullNameSchema.safeParse("Alan Felipe").success).toBe(true);
  });

  it("recusa números e símbolos", () => {
    expect(fullNameSchema.safeParse("Alan 123").success).toBe(false);
    expect(fullNameSchema.safeParse("Alan <b>Felipe</b>").success).toBe(false);
  });

  it("aceita acentos e nomes compostos", () => {
    expect(fullNameSchema.safeParse("João da Silva Araújo").success).toBe(true);
  });
});

describe("telefone", () => {
  it("formata enquanto digita", () => {
    expect(formatPhoneBR("11987654321")).toBe("(11) 98765 4321");
    expect(formatPhoneBR("5511987654321")).toBe("(11) 98765 4321");
    expect(formatPhoneBR("1133334444")).toBe("(11) 3333 4444");
  });

  it("valida DDD e formato", () => {
    expect(validatePhoneBR("(11) 98765 4321")).toEqual({ ok: true, digits: "11987654321" });
    expect(validatePhoneBR("(20) 98765 4321").ok).toBe(false);
    expect(validatePhoneBR("(11) 88765 4321").ok).toBe(false);
    expect(validatePhoneBR("(11) 99999 9999").ok).toBe(false);
    expect(validatePhoneBR("1198765").ok).toBe(false);
  });
});

describe("CPF e CNPJ", () => {
  it("confere os dígitos verificadores", () => {
    expect(isCpfOrCnpj("529.982.247-25")).toBe(true);
    expect(isCpfOrCnpj("529.982.247-26")).toBe(false);
    expect(isCpfOrCnpj("111.111.111-11")).toBe(false);
    expect(isCpfOrCnpj("11.222.333/0001-81")).toBe(true);
    expect(isCpfOrCnpj("11.222.333/0001-82")).toBe(false);
  });
});

describe("redirecionamento depois do login", () => {
  it.each([
    ["/agenda", "/agenda"],
    ["/equipe?x=1", "/equipe?x=1"],
    ["//evil.com", "/painel"],
    ["/\\evil.com", "/painel"],
    ["/\t/evil.com", "/painel"],
    ["/.//evil.com", "/painel"],
    ["/..//evil.com", "/painel"],
    ["/%2e//evil.com", "/painel"],
    ["https://evil.com", "/painel"],
    ["javascript:alert(1)", "/painel"],
  ])("%s vira %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
