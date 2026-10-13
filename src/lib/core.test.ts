import { describe, expect, it } from "vitest";
import { compareRank, conversion, emptyTotals } from "@/lib/metrics";
import { fingerprintOf, sanitizeMeta } from "@/lib/ops";
import { monthlyPriceCents, PRICE_PER_SEAT_CENTS } from "@/lib/plans";
import { minutesNowIn, slotState, startOfWeek, todayIn, zonedToIso } from "@/lib/time";

describe("fuso horário", () => {
  it("21h30 em Brasília continua no mesmo dia (falha do sistema antigo)", () => {
    const at = new Date("2026-10-14T00:30:00Z");
    expect(todayIn("America/Sao_Paulo", at)).toBe("2026-10-13");
    expect(minutesNowIn("America/Sao_Paulo", at)).toBe(21 * 60 + 30);
  });

  it("converte horário local para instante", () => {
    expect(zonedToIso("2026-10-13", "14:30", "America/Sao_Paulo")).toBe("2026-10-13T17:30:00.000Z");
  });

  it("janela do relatório abre 10 min antes e atrasa 15 min depois", () => {
    expect(slotState("15:00", 14 * 60 + 49)).toBe("upcoming");
    expect(slotState("15:00", 14 * 60 + 50)).toBe("open");
    expect(slotState("15:00", 15 * 60 + 15)).toBe("late");
  });

  it("semana começa na segunda", () => {
    expect(startOfWeek("2026-10-18")).toBe("2026-10-12");
  });
});

describe("métricas", () => {
  it("uma venda vale mais que muitos leads no ranking", () => {
    const seller = { ...emptyTotals(), sales: 1 };
    const busy = { ...emptyTotals(), leads: 99 };
    expect(compareRank(seller, busy)).toBeLessThan(0);
  });

  it("formata conversão", () => {
    expect([conversion(0, 5), conversion(3, 1), conversion(200, 3)]).toEqual(["0%", "33%", "1,5%"]);
  });
});

describe("preço", () => {
  it("aplica o desconto do cupom", () => {
    expect(monthlyPriceCents(10)).toBe(10 * PRICE_PER_SEAT_CENTS);
    expect(monthlyPriceCents(10, 20)).toBe(Math.round(10 * PRICE_PER_SEAT_CENTS * 0.8));
  });
});

describe("registro de erros", () => {
  it("agrupa o mesmo erro com ids e números diferentes", () => {
    const a = fingerprintOf("cron", "Falhou para a org 3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90 após 3 tentativas");
    const b = fingerprintOf("cron", "Falhou para a org 0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e após 12 tentativas");
    expect(a).toBe(b);
    expect(fingerprintOf("webhook", "Falhou")).not.toBe(fingerprintOf("cron", "Falhou"));
  });

  it("esconde segredos e dados pessoais nos detalhes", () => {
    const meta = sanitizeMeta({ token: "abc", password: "x", cpfCnpj: "123", status: 500, message: "fora" });
    expect(meta).toEqual({ token: "[oculto]", password: "[oculto]", cpfCnpj: "[oculto]", status: 500 });
  });
});
