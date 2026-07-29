import { describe, it, expect } from "vitest";
import { detectCreateAction, extractSymbol, extractMoney } from "@/lib/ai/action-lane";

const OPTS = { currency: "CRC", today: "2026-07-29", holdings: [] };

describe("extractMoney · números con separadores", () => {
  it("$1 → 1; 5000 → 5000; 1.000 → 1000 (miles); 1,5 → 1.5", () => {
    expect(extractMoney("una alerta a $1")).toBe(1);
    expect(extractMoney("gasto de 5000")).toBe(5000);
    expect(extractMoney("meta de 1.000")).toBe(1000);
    expect(extractMoney("a 1,5")).toBe(1.5);
    expect(extractMoney("sin numeros")).toBeNull();
  });
});

describe("extractSymbol · ticker o posición conocida", () => {
  it("ticker en mayúscula", () => {
    expect(extractSymbol("alerta en JUP a $1")).toBe("JUP");
  });
  it("por nombre de la posición", () => {
    expect(extractSymbol("avisame cuando bitcoin llegue a 100000", [{ symbol: "BTC", name: "Bitcoin" }])).toBe("BTC");
  });
});

describe("detectCreateAction · ALERTA DE PRECIO (el bug reportado)", () => {
  it('"generame una alerta en JUP a $1" → propone create_price_alert (JUP, 1, cripto)', () => {
    const r = detectCreateAction("generame una alerta en JUP a $1", OPTS);
    expect(r?.action?.type).toBe("create_price_alert");
    expect(r?.action?.payload).toMatchObject({ symbol: "JUP", targetPrice: 1, assetType: "cripto", currency: "USD" });
    // NO afirma que no puede.
    expect(r?.reply).not.toMatch(/no (puedo|tengo)/i);
  });

  it("sin precio → pide SOLO el precio (no rechaza)", () => {
    const r = detectCreateAction("ponme una alerta en JUP", OPTS);
    expect(r?.action).toBeNull();
    expect(r?.reply).toMatch(/a qué precio/i);
  });

  it("sin símbolo → pide SOLO el símbolo", () => {
    const r = detectCreateAction("avisame cuando llegue a $2", OPTS);
    expect(r?.action).toBeNull();
    expect(r?.reply).toMatch(/símbolo|ticker/i);
  });

  it("assetType de la posición del usuario (ETF) cuando la tiene", () => {
    const r = detectCreateAction("alerta en VOO a 600", { ...OPTS, holdings: [{ symbol: "VOO", name: "Vanguard", assetType: "etf" }] });
    expect(r?.action?.payload).toMatchObject({ symbol: "VOO", assetType: "etf", currency: "CRC" });
  });
});

describe("detectCreateAction · sobre, meta, gasto", () => {
  it('"creá un sobre de emergencia" → create_goal kind=sobre', () => {
    const r = detectCreateAction("creá un sobre de emergencia", OPTS);
    expect(r?.action?.type).toBe("create_goal");
    expect(r?.action?.payload).toMatchObject({ kind: "sobre", name: "emergencia", currency: "CRC" });
  });

  it('"creá una meta de ahorro de 500000 para viaje" → create_goal kind=meta con monto', () => {
    const r = detectCreateAction("creá una meta de ahorro de 500000 para viaje", OPTS);
    expect(r?.action?.type).toBe("create_goal");
    expect(r?.action?.payload).toMatchObject({ kind: "meta", targetAmount: 500000, currency: "CRC" });
    expect(String((r?.action?.payload as { name: string }).name)).toMatch(/viaje/i);
  });

  it('"registrá un gasto de 5000 en super" → create_transaction gasto', () => {
    const r = detectCreateAction("registrá un gasto de 5000 en super", OPTS);
    expect(r?.action?.type).toBe("create_transaction");
    expect(r?.action?.payload).toMatchObject({ kind: "gasto", amount: 5000, currency: "CRC", occurredOn: "2026-07-29" });
    expect(String((r?.action?.payload as { description: string }).description)).toMatch(/super/i);
  });

  it("meta sin monto → pide SOLO el monto", () => {
    const r = detectCreateAction("creá una meta de ahorro para el carro", OPTS);
    expect(r?.action).toBeNull();
    expect(r?.reply).toMatch(/de cuánto/i);
  });
});

describe("detectCreateAction · no secuestra otras consultas", () => {
  it("pregunta de CONSEJO ('¿debería crear una meta?') → null (va al razonamiento)", () => {
    expect(detectCreateAction("¿debería crear una meta o pagar deuda primero?", OPTS)).toBeNull();
  });
  it("consulta que no es crear → null", () => {
    expect(detectCreateAction("¿cuánto tengo en JUP?", OPTS)).toBeNull();
  });
});
