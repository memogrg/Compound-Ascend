import { describe, it, expect } from "vitest";
import {
  primaryOf,
  asRanked,
  formatRanking,
  deUnderscore,
  RANK_WEIGHTS,
} from "@/modules/personal-profile/engine/ranking";
import { applyRankedProfile } from "@/lib/ai/profile-ranking";
import type { FinancialContext } from "@/lib/ai/orchestrator";

describe("ranking · helpers puros", () => {
  it("primaryOf: array → primera; string → sí misma; vacío → undefined", () => {
    expect(primaryOf(["a", "b"])).toBe("a");
    expect(primaryOf("solo")).toBe("solo");
    expect(primaryOf([])).toBeUndefined();
    expect(primaryOf(undefined)).toBeUndefined();
  });

  it("asRanked: normaliza array/string/vacío y descarta no-strings", () => {
    expect(asRanked(["a", "b"])).toEqual(["a", "b"]);
    expect(asRanked("x")).toEqual(["x"]);
    expect(asRanked("")).toEqual([]);
    expect(asRanked(undefined)).toEqual([]);
    expect(asRanked([1, "a", null])).toEqual(["a"]);
  });

  it("formatRanking: 1 valor = pelado; ≥2 = primaria/secundaria/terciaria", () => {
    expect(formatRanking(["vendo"])).toBe("vendo");
    expect(formatRanking(["deudas", "fin_de_mes"], deUnderscore)).toBe(
      "primaria: deudas · secundaria: fin de mes",
    );
    expect(formatRanking(["a", "b", "c"])).toBe("primaria: a · secundaria: b · terciaria: c");
    // Trunca a 3 (defensa; el schema ya capa en 3).
    expect(formatRanking(["a", "b", "c", "d"])).toBe("primaria: a · secundaria: b · terciaria: c");
    expect(formatRanking([])).toBe("");
  });

  it("los pesos de rango son 1 / 0.6 / 0.3", () => {
    expect([...RANK_WEIGHTS]).toEqual([1, 0.6, 0.3]);
  });
});

describe("applyRankedProfile · serialización al contexto de IA", () => {
  it("vuelca la jerarquía como 'primaria/secundaria/terciaria'", () => {
    const ctx: Partial<FinancialContext> = {};
    applyRankedProfile(ctx, {
      lifeStage: ["salir_deudas", "hacer_crecer"],
      mainConcerns: ["deudas"],
      lossReaction: ["mantengo", "espero", "vendo"],
      interventionStyle: ["reto", "recordatorio"],
    });
    expect(ctx.lifeStage).toBe("primaria: salir deudas · secundaria: hacer crecer");
    expect(ctx.topConcern).toBe("deudas");
    expect(ctx.lossReaction).toBe("primaria: mantengo · secundaria: espero · terciaria: vendo");
    // interventionStyle es clave de mapa cerrado → primaria cruda (sin de-underscore).
    expect(ctx.interventionStyle).toBe("reto");
  });

  it("no toca el contexto si el draft es nulo o el campo está vacío", () => {
    const ctx: Partial<FinancialContext> = { lifeStage: "previo" };
    applyRankedProfile(ctx, null);
    expect(ctx.lifeStage).toBe("previo");
    applyRankedProfile(ctx, { lifeStage: [] });
    expect(ctx.lifeStage).toBe("previo"); // no sobrescribe con vacío
  });
});
