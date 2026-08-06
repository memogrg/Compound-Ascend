import { describe, it, expect } from "vitest";
import { composeLiquidity } from "@/modules/rich-life/engine/liquidity-composition";
import { sumAssetsByClass } from "@/modules/wealth/engine/patrimonio-mappers";
import type { Asset } from "@/modules/rich-life/types";

/**
 * El tooltip de "Meses de colchón" explica QUÉ está contando como líquido. Si el
 * desglose no sumara lo mismo que `liquidWealth`, el tooltip mentiría — que es
 * justo el problema que vino a resolver.
 */
const a = (name: string, assetClass: Asset["assetClass"], value: number): Asset => ({
  id: name,
  name,
  assetClass,
  value,
  currency: "USD",
  generatesIncome: false,
});

// Forma de un caso real: el líquido NO es solo el fondo de defensa.
const ASSETS: Asset[] = [
  a("ROP David", "liquido", 77_600),
  a("Ahorro Asociación", "liquido", 42_000),
  a("Fondo de paz", "liquido", 39_710),
  a("Ahorro Viaje", "liquido", 1_390),
  a("Dentista", "liquido", 212),
  a("Inversiones sin vincular", "inversion", 607_998),
  a("Toyota Fortuner", "uso_personal", 65_000),
];

describe("composeLiquidity", () => {
  it("el total coincide con el liquidWealth que usa el motor patrimonial", () => {
    expect(composeLiquidity(ASSETS).total).toBe(sumAssetsByClass(ASSETS).liquido);
  });

  it("muestra los componentes más pesados y agrega el resto", () => {
    const c = composeLiquidity(ASSETS);
    expect(c.top.map((x) => x.name)).toEqual(["ROP David", "Ahorro Asociación", "Fondo de paz"]);
    expect(c.restCount).toBe(2);
    expect(c.restValue).toBe(1_390 + 212);
    // Nada se pierde entre lo mostrado y lo agregado.
    expect(c.top.reduce((s, x) => s + x.value, 0) + c.restValue).toBe(c.total);
  });

  it("ignora clases no líquidas y montos en cero", () => {
    const c = composeLiquidity([...ASSETS, a("Meta vacía", "liquido", 0)]);
    expect(c.top.some((x) => x.name === "Inversiones sin vincular")).toBe(false);
    expect(c.restCount).toBe(2); // la meta en 0 no suma un renglón
  });

  it("sin líquido no inventa renglones", () => {
    const c = composeLiquidity([a("Casa", "uso_personal", 100)]);
    expect(c).toEqual({ total: 0, top: [], restCount: 0, restValue: 0 });
  });
});
