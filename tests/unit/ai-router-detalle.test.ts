/**
 * Ruteo determinista del DETALLE por dominio (consulta_detalle).
 *
 * El orden importa: va antes de cuota_deuda / metas / resumen_inversiones, que
 * responden la FOTO (saldo, progreso, valor actual) cuando la pregunta es por el
 * HISTORIAL de movimientos. Cada caso tiene su gemelo de no regresión.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { matchIntent, extractNombreDominio } from "@/lib/ai/router";

const intentOf = (q: string) => matchIntent(q)?.intent ?? null;
const paramsOf = (q: string) => matchIntent(q)?.params ?? {};

describe("extractNombreDominio", () => {
  it("saca el nombre de la entidad tras el verbo", () => {
    expect(extractNombreDominio("¿cuánto le he pagado a la Tarjeta BAC?")).toBe("Tarjeta BAC");
    expect(extractNombreDominio("mis aportes a Viaje a Japón")).toBe("Viaje a Japón");
  });

  it("corta el marcador temporal pegado al nombre", () => {
    expect(extractNombreDominio("cuánto he pagado a la Tarjeta BAC este mes")).toBe("Tarjeta BAC");
  });

  it("una palabra genérica del dominio no es un nombre propio", () => {
    expect(extractNombreDominio("¿cuánto he pagado de deudas?")).toBeNull();
    expect(extractNombreDominio("¿cuánto he aportado a mis metas?")).toBeNull();
  });
});

describe("deudas", () => {
  it("'¿cuánto le he pagado a la tarjeta?' → detalle, no la cuota del mes", () => {
    expect(intentOf("¿cuánto le he pagado a la tarjeta?")).toBe("consulta_detalle");
    expect(paramsOf("¿cuánto le he pagado a la tarjeta?")).toMatchObject({ dominio: "deudas" });
  });

  it("'¿cuál fue mi último pago?' pide UN movimiento", () => {
    expect(paramsOf("¿cuál fue mi último pago de la tarjeta?")).toMatchObject({
      dominio: "deudas",
      tope: 1,
    });
  });

  it("'llevo pagado' también es acumulado", () => {
    expect(intentOf("¿cuánto llevo pagado del préstamo?")).toBe("consulta_detalle");
  });
});

describe("metas", () => {
  it("'¿cuánto he aportado a mi meta?' → detalle de aportes", () => {
    expect(paramsOf("¿cuánto he aportado a mi meta de viaje?")).toMatchObject({ dominio: "metas" });
  });
});

describe("inversiones y dividendos", () => {
  it("'mis dividendos' entra directo (la palabra es inequívoca)", () => {
    expect(intentOf("mostrame mis dividendos")).toBe("consulta_detalle");
    expect(paramsOf("mostrame mis dividendos")).toMatchObject({ dominio: "dividendos" });
  });

  it("'¿cuánto he invertido en cripto?' → detalle de compras", () => {
    expect(paramsOf("¿cuánto he invertido en cripto?")).toMatchObject({ dominio: "inversiones" });
  });

  it("'mis compras de VOO' → detalle de compras", () => {
    expect(intentOf("mostrame todas mis compras de VOO")).toBe("consulta_detalle");
  });
});

describe("liquidez", () => {
  it("'¿de dónde salió esa plata?' → trazabilidad", () => {
    expect(paramsOf("¿de dónde salió esa plata?")).toMatchObject({ dominio: "liquidez" });
  });

  it("'¿cuánto he sacado de la cuenta?' → detalle de liquidez", () => {
    expect(intentOf("¿cuánto he sacado de la cuenta?")).toBe("consulta_detalle");
  });
});

describe("NO REGRESIÓN: la foto sigue siendo la foto", () => {
  it("'¿cuánto pago de la tarjeta?' sigue siendo cuota_deuda (la cuota, no el historial)", () => {
    expect(intentOf("¿cuánto pago de la tarjeta?")).toBe("cuota_deuda");
  });

  it("'mis metas' sigue siendo metas (progreso, no aportes)", () => {
    expect(intentOf("mostrame mis metas")).toBe("metas");
    // OJO: "¿cómo van mis metas?" NO llega acá — REASONING_CUES atrapa "cómo" antes.
    // Es un hueco PREEXISTENTE (idéntico en main), no una regresión de este cambio.
    expect(intentOf("¿cómo van mis metas?")).toBeNull();
  });

  it("'¿cuánto tengo invertido?' sigue siendo resumen_inversiones", () => {
    expect(intentOf("¿cuánto tengo invertido?")).toBe("resumen_inversiones");
  });

  it("'¿cuál es mi saldo?' sigue siendo saldo_liquidez", () => {
    expect(intentOf("¿cuál es mi saldo?")).toBe("saldo_liquidez");
  });

  it("P1 intacto: '¿qué días gasto más?' sigue en el libro diario", () => {
    expect(intentOf("¿qué días gasto más?")).toBe("consulta_transacciones");
  });

  it("P2 intacto: '¿cómo cambió mi patrimonio?' sigue en historial", () => {
    expect(intentOf("¿cómo cambió mi patrimonio?")).toBe("consulta_historial");
  });

  it("sin dominio reconocible no entra (no se adivina)", () => {
    expect(intentOf("¿cuánto he pagado?")).not.toBe("consulta_detalle");
  });
});
