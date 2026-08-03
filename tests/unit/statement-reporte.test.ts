/**
 * Reporte de conciliación (tabla + resumen) y ruteo del bloque pegado.
 * El render es puro; el ruteo se prueba con la frase/pegado real.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { renderReporte } from "@/lib/ai/statement-service";
import { conciliar } from "@/lib/ai/statement-reconcile";
import { parseStatement } from "@/lib/ai/statement-parse";
import { matchIntent } from "@/lib/ai/router";

const BLOQUE = `246276  2026-07-17  SUBWAY LAGUNILLA  3,900.00  COL  D
246277  2026-07-18  FRESH MARKET ESCAZU  24,150.00  COL  D
246281  2026-07-20  OLIVE GARDEN  18,700.00  COL  D`;

const { filas } = parseStatement(BLOQUE);
// Solo la primera está registrada.
const registradas = [
  {
    id: "t1",
    amount: 3900,
    currency: "CRC",
    occurredOn: "2026-07-17",
    merchantOrSource: "Subway",
    description: null,
    kind: "gasto",
  },
];
const RATES = { USD: 1, CRC: 500 };

describe("renderReporte · tabla y resumen", () => {
  const r = conciliar(filas, registradas);
  const md = renderReporte(r.filas, { moneda: "CRC", rates: RATES, ignoradas: 0 });

  it("va en TABLA con columna de estado", () => {
    expect(md).toContain("| Fecha | Comercio | Monto | Estado |");
    expect(md).toContain("| --- | --- | --- | --- |");
    expect(md).not.toMatch(/^•/m);
  });

  it("marca cuál está y cuáles faltan", () => {
    expect(md).toMatch(/SUBWAY LAGUNILLA.*✓ registrada/);
    expect(md).toMatch(/FRESH MARKET ESCAZU.*falta/);
    expect(md).toMatch(/OLIVE GARDEN.*falta/);
  });

  it("resume «1 ya está y 2 faltan»", () => {
    expect(md).toMatch(/\*\*1 ya está\*\*/);
    expect(md).toMatch(/\*\*2 faltan\*\*/);
  });

  it("cuando no falta ninguna lo dice y no ofrece registrar nada", () => {
    const todas = conciliar(
      filas,
      filas.map((f, i) => ({
        id: `t${i}`,
        amount: f.monto,
        currency: f.moneda,
        occurredOn: f.fecha,
        merchantOrSource: f.comercio,
        description: null,
        kind: f.tipo,
      })),
    );
    const out = renderReporte(todas.filas, { moneda: "CRC", rates: RATES, ignoradas: 0 });
    expect(out).toMatch(/están todos registrados/i);
    expect(out).not.toMatch(/Podés registrar/);
  });

  it("avisa de las líneas que no pudo leer (no se las traga)", () => {
    const out = renderReporte(conciliar(filas, []).filas, {
      moneda: "CRC",
      rates: RATES,
      ignoradas: 2,
    });
    expect(out).toMatch(/No pude leer 2 líneas/);
  });
});

describe("moneda de visualización", () => {
  it("los colones del estado se muestran en USD si esa es la moneda de display", () => {
    const r = conciliar(filas, []);
    const md = renderReporte(r.filas, { moneda: "USD", rates: RATES, ignoradas: 0 });
    // 3.900 CRC / 500 = 7,8 → $8 (convertirTotal redondea).
    expect(md).toContain("$8");
    expect(md).not.toContain("₡");
  });

  it("sin tasas, cada fila se muestra en su moneda de origen (no se inventa la conversión)", () => {
    const r = conciliar(filas, []);
    const md = renderReporte(r.filas, { moneda: "USD", rates: null, ignoradas: 0 });
    expect(md).toContain("₡");
  });
});

describe("ruteo · el bloque pegado gana antes que cualquier otro carril", () => {
  it("un estado pegado rutea a conciliar_estado con el texto crudo", () => {
    const m = matchIntent(BLOQUE);
    expect(m?.intent).toBe("conciliar_estado");
    expect(m?.params.texto).toBe(BLOQUE);
  });

  it("con una nota alrededor sigue siendo conciliación", () => {
    const m = matchIntent(`estos son mis movimientos:\n${BLOQUE}\n¿cuáles me faltan?`);
    expect(m?.intent).toBe("conciliar_estado");
  });

  it("una consulta normal de transacciones NO cae acá", () => {
    expect(matchIntent("dame las transacciones de restaurantes del mes pasado")?.intent).toBe(
      "consulta_transacciones",
    );
  });

  it("una frase que menciona dos gastos tampoco", () => {
    const m = matchIntent("gasté 3.900 el 17/07 y 5.000 el 18/07, ¿los tengo anotados?");
    expect(m?.intent).not.toBe("conciliar_estado");
  });
});
