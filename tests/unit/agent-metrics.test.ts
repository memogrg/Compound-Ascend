/**
 * TABLERO DE CALIDAD — el motor puro del rollup diario.
 *
 * Todo el criterio del tablero vive acá, así que acá se prueba. Las decisiones que tienen test
 * propio son las que, si se rompen en silencio, dejan un número que MIENTE — que es peor que no
 * tener tablero:
 *
 *  1. UN CARRIL DESCONOCIDO CUENTA COMO LLM. El error seguro infla la cifra que queremos bajar en
 *     vez de esconderla: un carril nuevo que nadie agregó al set no puede aparecer como "cobertura".
 *  2. LAS ACCIONES SE CUENTAN POR SEPARADO. Una propuesta puede confirmarse al día siguiente;
 *     emparejar filas haría el rollup dependiente del orden.
 *  3. SIN BASE NO HAY TASA. 0 turnos ⇒ `null`, nunca 0% — un 0 inventado lee como "está pésimo".
 *  4. EN LA VENTANA, LOS USUARIOS NO SE SUMAN. Sumarlos contaría al mismo usuario una vez por día.
 */
import { describe, it, expect } from "vitest";
import {
  PRECIO_POR_MILLON,
  delta,
  esCarrilDeterminista,
  estimarCosto,
  pct,
  percentil,
  rollupDay,
  sumarVentana,
  tasas,
  type MetricEvent,
} from "@/lib/ai/agent-metrics";

const ev = (over: Partial<MetricEvent> = {}): MetricEvent => ({
  event: "lane",
  name: "reasoning",
  ms: 100,
  ok: true,
  tokensIn: 0,
  tokensOut: 0,
  userId: "u1",
  ...over,
});

describe("esCarrilDeterminista", () => {
  it("reconoce los carriles que no pagan razonamiento", () => {
    expect(esCarrilDeterminista("template")).toBe(true);
    expect(esCarrilDeterminista("lite")).toBe(true);
    expect(esCarrilDeterminista("deterministic")).toBe(true);
  });

  it("un carril DESCONOCIDO cuenta como LLM (el error seguro infla, no esconde)", () => {
    expect(esCarrilDeterminista("carril-nuevo-que-nadie-registro")).toBe(false);
    expect(esCarrilDeterminista("reasoning")).toBe(false);
    expect(esCarrilDeterminista(null)).toBe(false);
    expect(esCarrilDeterminista(undefined)).toBe(false);
  });
});

describe("percentil", () => {
  it("nearest-rank sobre la lista ordenada", () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentil(xs, 50)).toBe(50);
    expect(percentil(xs, 100)).toBe(100);
  });

  it("con pocas muestras el p95 colapsa al máximo: con 3 turnos no hay un p95 real", () => {
    expect(percentil([100, 200, 900], 95)).toBe(900);
  });

  it("una sola muestra es su propio p50 y p95", () => {
    expect(percentil([42], 50)).toBe(42);
    expect(percentil([42], 95)).toBe(42);
  });

  it("sin muestras → null (no hay percentil que reportar)", () => {
    expect(percentil([], 50)).toBeNull();
  });

  it("descarta lo que no es un número válido o es negativo", () => {
    expect(percentil([Number.NaN, -5, 100, Number.POSITIVE_INFINITY], 50)).toBe(100);
    expect(percentil([Number.NaN, -1], 50)).toBeNull();
  });
});

describe("estimarCosto", () => {
  it("aplica el precio por millón de entrada y salida", () => {
    expect(estimarCosto(1_000_000, 1_000_000)).toBe(
      Math.round((PRECIO_POR_MILLON.in + PRECIO_POR_MILLON.out) * 10_000) / 10_000,
    );
  });

  it("redondea a 4 decimales (la columna es numeric(12,4))", () => {
    const c = estimarCosto(1234, 5678);
    expect(c).toBe(Math.round(c * 10_000) / 10_000);
  });

  it("sin tokens no hay costo", () => {
    expect(estimarCosto(0, 0)).toBe(0);
  });

  it("acepta un precio inyectado (se puede pisar por entorno sin tocar código)", () => {
    expect(estimarCosto(1_000_000, 0, { in: 2, out: 99 })).toBe(2);
  });
});

describe("rollupDay", () => {
  it("día vacío: todo en cero, percentiles null", () => {
    const m = rollupDay([]);
    expect(m.turnos).toBe(0);
    expect(m.latP50).toBeNull();
    expect(m.latP95).toBeNull();
    expect(m.usuarios).toBe(0);
    expect(m.guards).toEqual({});
  });

  it("separa turnos deterministas de turnos LLM y suma sus tokens", () => {
    const m = rollupDay([
      ev({ name: "template", tokensIn: 10, tokensOut: 5 }),
      ev({ name: "lite", tokensIn: 20, tokensOut: 10 }),
      ev({ name: "reasoning", tokensIn: 1000, tokensOut: 500 }),
    ]);
    expect(m.turnos).toBe(3);
    expect(m.turnosDet).toBe(2);
    expect(m.turnosLlm).toBe(1);
    expect(m.tokensIn).toBe(1030);
    expect(m.tokensOut).toBe(515);
    expect(m.costoUsd).toBe(estimarCosto(1030, 515));
  });

  it("la latencia se agrupa por carril y también global", () => {
    const m = rollupDay([
      ev({ name: "template", ms: 100 }),
      ev({ name: "template", ms: 300 }),
      ev({ name: "reasoning", ms: 2000 }),
    ]);
    expect(m.latPorCarril.template).toEqual({ p50: 100, p95: 300, n: 2 });
    expect(m.latPorCarril.reasoning).toEqual({ p50: 2000, p95: 2000, n: 1 });
    expect(m.latP95).toBe(2000);
  });

  it("un turno sin ms no aporta latencia pero sí cuenta como turno", () => {
    const m = rollupDay([ev({ name: "template", ms: null })]);
    expect(m.turnos).toBe(1);
    expect(m.latP50).toBeNull();
    expect(m.latPorCarril.template).toBeUndefined();
  });

  it("las herramientas NO entran a la latencia del carril (tienen su propia lectura)", () => {
    const m = rollupDay([
      ev({ event: "tool", name: "datos_de_mercado", ms: 9_999 }),
      ev({ name: "template", ms: 100 }),
    ]);
    expect(m.turnos).toBe(1);
    expect(m.latP95).toBe(100);
  });

  it("los guards se cuentan por causa, no en un total suelto", () => {
    const m = rollupDay([
      ev({ event: "guard", name: "movimientos" }),
      ev({ event: "guard", name: "movimientos" }),
      ev({ event: "guard", name: "tendencia" }),
    ]);
    expect(m.guards).toEqual({ movimientos: 2, tendencia: 1 });
    expect(m.guardsTotal).toBe(3);
  });

  it("un guard sin nombre no se pierde: cae en 'desconocido'", () => {
    const m = rollupDay([ev({ event: "guard", name: null }), ev({ event: "guard", name: "  " })]);
    expect(m.guards).toEqual({ desconocido: 2 });
  });

  it("propuestas y confirmaciones se cuentan por separado (no se emparejan filas)", () => {
    const m = rollupDay([
      ev({ event: "action", name: "propuesta:create_goal" }),
      ev({ event: "action", name: "propuesta:set_dca" }),
      ev({ event: "action", name: "confirmada:create_goal" }),
    ]);
    expect(m.accionesPropuestas).toBe(2);
    expect(m.accionesConfirmadas).toBe(1);
  });

  it("los fallos del proveedor se cuentan por razón real", () => {
    const m = rollupDay([
      ev({ event: "provider_error", name: "http_429" }),
      ev({ event: "provider_error", name: "http_429" }),
      ev({ event: "provider_error", name: "timeout" }),
    ]);
    expect(m.providerErrors).toEqual({ http_429: 2, timeout: 1 });
  });

  it("los usuarios se cuentan únicos, sobre TODOS los eventos", () => {
    const m = rollupDay([
      ev({ userId: "a" }),
      ev({ userId: "a" }),
      ev({ userId: "b" }),
      ev({ event: "guard", name: "x", userId: "c" }),
    ]);
    expect(m.usuarios).toBe(3);
  });
});

describe("pct y tasas", () => {
  it("porcentaje a un decimal", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(1, 2)).toBe(50);
  });

  it("sin base → null, NUNCA 0 (un 0 inventado lee como 'está pésimo')", () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(5, -1)).toBeNull();
  });

  it("las tres tasas salen del rollup", () => {
    const m = rollupDay([
      ev({ name: "template" }),
      ev({ name: "reasoning" }),
      ev({ event: "guard", name: "movimientos" }),
      ev({ event: "action", name: "propuesta:create_goal" }),
      ev({ event: "action", name: "confirmada:create_goal" }),
    ]);
    expect(tasas(m)).toEqual({ coberturaDet: 50, tasaGuard: 50, tasaAccion: 100 });
  });

  it("un día sin turnos da las tres tasas en null", () => {
    expect(tasas(rollupDay([]))).toEqual({
      coberturaDet: null,
      tasaGuard: null,
      tasaAccion: null,
    });
  });
});

describe("delta", () => {
  it("resta las tasas a un decimal", () => {
    const d = delta(
      { coberturaDet: 60, tasaGuard: 5, tasaAccion: 40 },
      { coberturaDet: 45.5, tasaGuard: 8, tasaAccion: 40 },
    );
    expect(d).toEqual({ coberturaDet: 14.5, tasaGuard: -3, tasaAccion: 0 });
  });

  it("null de un lado → null en el delta (sin base no hay comparación)", () => {
    const d = delta(
      { coberturaDet: 60, tasaGuard: null, tasaAccion: 40 },
      { coberturaDet: null, tasaGuard: 8, tasaAccion: 40 },
    );
    expect(d.coberturaDet).toBeNull();
    expect(d.tasaGuard).toBeNull();
    expect(d.tasaAccion).toBe(0);
  });
});

describe("sumarVentana", () => {
  const dia = (over: Partial<ReturnType<typeof rollupDay>> = {}) => ({
    ...rollupDay([]),
    ...over,
  });

  it("ventana vacía → la fila base en cero", () => {
    const v = sumarVentana([]);
    expect(v.turnos).toBe(0);
    expect(v.latP50).toBeNull();
  });

  it("suma los contadores y los mapas por clave", () => {
    const v = sumarVentana([
      dia({ turnos: 10, turnosDet: 6, turnosLlm: 4, guards: { movimientos: 2 }, guardsTotal: 2, tokensIn: 100, tokensOut: 50 }),
      dia({ turnos: 5, turnosDet: 1, turnosLlm: 4, guards: { movimientos: 1, tendencia: 3 }, guardsTotal: 4, tokensIn: 10, tokensOut: 5 }),
    ]);
    expect(v.turnos).toBe(15);
    expect(v.turnosDet).toBe(7);
    expect(v.guards).toEqual({ movimientos: 3, tendencia: 3 });
    expect(v.guardsTotal).toBe(6);
    expect(v.tokensIn).toBe(110);
  });

  it("los USUARIOS no se suman: se toma el máximo diario (cota inferior honesta)", () => {
    const v = sumarVentana([dia({ usuarios: 8 }), dia({ usuarios: 3 }), dia({ usuarios: 5 })]);
    expect(v.usuarios).toBe(8);
  });

  it("los percentiles NO se promedian: se ponderan por las muestras de cada día", () => {
    // Un día de 1 turno lentísimo no puede mover el p50 de una ventana con 999 turnos rápidos.
    const v = sumarVentana([
      dia({ turnos: 999, latP50: 100, latP95: 200 }),
      dia({ turnos: 1, latP50: 9_000, latP95: 9_000 }),
    ]);
    expect(v.latP50).toBe(100);
  });

  it("un día sin latencia no aporta muestras", () => {
    const v = sumarVentana([dia({ turnos: 5, latP50: null, latP95: null })]);
    expect(v.latP50).toBeNull();
  });

  it("el costo de la ventana queda redondeado a 4 decimales", () => {
    const v = sumarVentana([dia({ costoUsd: 0.0001 }), dia({ costoUsd: 0.0002 })]);
    expect(v.costoUsd).toBe(0.0003);
  });

  it("la latencia por carril acumula n y toma el peor p95", () => {
    const v = sumarVentana([
      dia({ turnos: 2, latPorCarril: { template: { p50: 100, p95: 150, n: 2 } } }),
      dia({ turnos: 3, latPorCarril: { template: { p50: 200, p95: 900, n: 3 } } }),
    ]);
    expect(v.latPorCarril.template!.n).toBe(5);
    expect(v.latPorCarril.template!.p95).toBe(900);
  });
});
