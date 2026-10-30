import { describe, expect, it } from "vitest";
import { accumulate, addMonths, adjustedValue, indexWindow, nextDueDate } from "./contract-math";

describe("addMonths", () => {
  it("mantém o dia e vira o ano", () => {
    expect(addMonths("2025-11-10", 3)).toBe("2026-02-10");
    expect(addMonths("2026-03-10", -12)).toBe("2025-03-10");
  });
  it("não passa do fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2023-02-28", 12)).toBe("2024-02-28");
  });
});

describe("nextDueDate", () => {
  it("primeiro aniversário depois da data-base", () => {
    expect(nextDueDate("2025-03-10", 12, null)).toBe("2026-03-10");
  });
  it("depois do último reajuste aplicado", () => {
    expect(nextDueDate("2023-03-10", 12, "2025-03-10")).toBe("2026-03-10");
  });
  it("reajuste esquecido fica no passado", () => {
    expect(nextDueDate("2020-05-01", 12, null)).toBe("2021-05-01");
  });
  it("semestral", () => {
    expect(nextDueDate("2026-01-15", 6, "2026-07-15")).toBe("2027-01-15");
  });
});

describe("indexWindow", () => {
  it("12 meses com 1 mês de defasagem", () => {
    const w = indexWindow("2026-03-10", 12, 1);
    expect(w[0]).toBe("2025-03");
    expect(w.at(-1)).toBe("2026-02");
    expect(w).toHaveLength(12);
  });
  it("sem defasagem termina no próprio mês", () => {
    expect(indexWindow("2026-03-10", 12, 0).at(-1)).toBe("2026-03");
  });
});

describe("accumulate", () => {
  it("compõe os meses em vez de somar", () => {
    const values = new Map([["2026-01", 1], ["2026-02", 1]]);
    expect(accumulate(["2026-01", "2026-02"], values).pct).toBe(2.01);
  });
  it("aponta os meses que ainda não saíram", () => {
    const r = accumulate(["2026-01", "2026-02"], new Map([["2026-01", 0.5]]));
    expect(r.missing).toEqual(["2026-02"]);
    expect(r.pct).toBe(0.5);
  });
});

describe("adjustedValue", () => {
  it("aplica a variação", () => {
    expect(adjustedValue(250000, 4.5, false)).toBe(261250);
  });
  it("índice negativo não reduz, a menos que o contrato permita", () => {
    expect(adjustedValue(250000, -1.2, false)).toBe(250000);
    expect(adjustedValue(250000, -1.2, true)).toBe(247000);
  });
});
