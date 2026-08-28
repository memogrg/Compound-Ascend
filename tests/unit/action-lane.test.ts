import { describe, it, expect } from "vitest";
import {
  detectCreateAction,
  extractSymbol,
  extractMoney,
  pideMontoDeMetaDiscrecional,
} from "@/lib/ai/action-lane";

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
    expect(
      extractSymbol("avisame cuando bitcoin llegue a 100000", [{ symbol: "BTC", name: "Bitcoin" }]),
    ).toBe("BTC");
  });
});

describe("detectCreateAction · ALERTA DE PRECIO (el bug reportado)", () => {
  it('"generame una alerta en JUP a $1" → propone create_price_alert (JUP, 1, cripto)', () => {
    const r = detectCreateAction("generame una alerta en JUP a $1", OPTS);
    expect(r?.action?.type).toBe("create_price_alert");
    expect(r?.action?.payload).toMatchObject({
      symbol: "JUP",
      targetPrice: 1,
      assetType: "cripto",
      currency: "USD",
    });
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
    const r = detectCreateAction("alerta en VOO a 600", {
      ...OPTS,
      holdings: [{ symbol: "VOO", name: "Vanguard", assetType: "etf" }],
    });
    expect(r?.action?.payload).toMatchObject({ symbol: "VOO", assetType: "etf", currency: "CRC" });
  });
});

describe("detectCreateAction · sobre, meta, gasto", () => {
  it('"creá un sobre de emergencia" → create_goal kind=sobre', () => {
    const r = detectCreateAction("creá un sobre de emergencia", OPTS);
    expect(r?.action?.type).toBe("create_goal");
    expect(r?.action?.payload).toMatchObject({
      kind: "sobre",
      name: "emergencia",
      currency: "CRC",
    });
  });

  it('"creá una meta de ahorro de 500000 para viaje" → create_goal kind=meta con monto', () => {
    const r = detectCreateAction("creá una meta de ahorro de 500000 para viaje", OPTS);
    expect(r?.action?.type).toBe("create_goal");
    expect(r?.action?.payload).toMatchObject({
      kind: "meta",
      targetAmount: 500000,
      currency: "CRC",
    });
    expect(String((r?.action?.payload as { name: string }).name)).toMatch(/viaje/i);
  });

  it('"registrá un gasto de 5000 en super" → create_transaction gasto', () => {
    const r = detectCreateAction("registrá un gasto de 5000 en super", OPTS);
    expect(r?.action?.type).toBe("create_transaction");
    expect(r?.action?.payload).toMatchObject({
      kind: "gasto",
      amount: 5000,
      currency: "CRC",
      occurredOn: "2026-07-29",
    });
    expect(String((r?.action?.payload as { description: string }).description)).toMatch(/super/i);
  });

  it("meta sin monto → pide SOLO el monto", () => {
    const r = detectCreateAction("creá una meta de ahorro para el carro", OPTS);
    expect(r?.action).toBeNull();
    expect(r?.reply).toMatch(/de cuánto/i);
  });
});

describe("detectCreateAction · GASTO no secuestra el análisis de gastos", () => {
  // El bug: el patrón viejo (/\b(gast|compr|…)/) veía "gast" en "gastos" y contestaba
  // "¿de cuánto fue el gasto?" a una pregunta de dónde recortar.
  it('"¿dónde puedo recortar gastos?" → null (análisis, no captura)', () => {
    expect(detectCreateAction("¿dónde puedo recortar gastos?", OPTS)).toBeNull();
  });

  it.each([
    "donde recorto gastos",
    "en qué se me va la plata",
    "¿cuáles son mis gastos más grandes?",
    "cómo reduzco mis gastos fijos",
    "recortá mis gastos discrecionales",
    "quiero bajar mis gastos",
  ])('"%s" → null', (q) => {
    expect(detectCreateAction(q, OPTS)).toBeNull();
  });

  it("una PREGUNTA con monto tampoco captura", () => {
    expect(detectCreateAction("¿me conviene un gasto de 5000 en esto?", OPTS)).toBeNull();
  });
});

describe("detectCreateAction · GASTO sigue capturando lo que debe", () => {
  it.each([
    ["registrá un gasto de 5000 en super", 5000],
    ["anotá una compra de 12000 en farmacia", 12000],
    ["apuntá un gasto de 3000 en gasolina", 3000],
    ["gasté 5000 en el super", 5000],
    ["pagué 25000 de luz", 25000],
    ["compré 8000 en ropa", 8000],
  ])('"%s" → create_transaction por %i', (frase, monto) => {
    const r = detectCreateAction(frase, OPTS);
    expect(r?.action?.type).toBe("create_transaction");
    expect(r?.action?.payload).toMatchObject({ kind: "gasto", amount: monto });
  });

  it("orden de registro SIN monto → pide solo el monto (no rechaza)", () => {
    const r = detectCreateAction("registrá un gasto en el super", OPTS);
    expect(r?.action).toBeNull();
    expect(r?.reply).toMatch(/de cuánto fue el gasto/i);
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

describe("pideMontoDeMetaDiscrecional (Paso 3.13 · guard de meta imprudente)", () => {
  const msgLujo = "Abrime una meta de ahorro para un viaje de lujo el próximo año";
  const msgFondo = "Creá una meta de fondo de emergencia";

  it("meta DISCRECIONAL sin monto (el carril pide '¿de cuánto?') → true (reconducir)", () => {
    const created = detectCreateAction(msgLujo, OPTS);
    expect(created?.reply).toMatch(/¿de cuánto es la meta/i); // el carril está pidiendo el monto
    expect(created?.action).toBeNull();
    expect(pideMontoDeMetaDiscrecional(created, msgLujo)).toBe(true);
  });

  it("meta de DEFENSA (fondo) sin monto → false (el fondo ES la prioridad; se pide normal)", () => {
    const created = detectCreateAction(msgFondo, OPTS);
    expect(created?.reply).toMatch(/¿de cuánto es la meta/i);
    expect(pideMontoDeMetaDiscrecional(created, msgFondo)).toBe(false);
  });

  it("meta CON monto (ya propone create_goal, action ≠ null) → false", () => {
    const created = detectCreateAction("Creá una meta de ahorro de ₡500.000 para un viaje", OPTS);
    expect(created?.action?.type).toBe("create_goal");
    expect(
      pideMontoDeMetaDiscrecional(created, "Creá una meta de ahorro de ₡500.000 para un viaje"),
    ).toBe(false);
  });

  it("created null (el carril no interceptó) → false", () => {
    expect(pideMontoDeMetaDiscrecional(null, msgLujo)).toBe(false);
  });

  it("otras familias de defensa (deuda/tarjeta) tampoco disparan", () => {
    const created = { reply: '¿De cuánto es la meta "pagar la tarjeta"?', action: null };
    expect(pideMontoDeMetaDiscrecional(created, "Creá una meta para pagar mi tarjeta")).toBe(false);
  });
});
