/**
 * El instante congelado NO puede quedar en el futuro.
 *
 * Costó el rojo de `main` del 28-sep y casi cuatro horas de diagnóstico en la dirección
 * equivocada. El mecanismo, medido:
 *
 *   · Los tokens de sesión los emite gotrue con la hora REAL. La app los valida contra su
 *     hora CONGELADA.
 *   · El instante por defecto era «hoy 12:00 en Costa Rica» = 18:00 UTC. Cualquier corrida
 *     ANTES de las 18:00 UTC congelaba la app en el futuro.
 *   · Con el reloj adelantado, el token parece vencido en cada render, cada componente de
 *     servidor pide refrescarlo a la vez, y gotrue responde 409 «Too many concurrent token
 *     refresh requests». La página no termina de cargar nunca.
 *
 * Y el síntoma no se parece a la causa: las corridas de CI de la madrugada (reloj en AYER
 * 18:00 UTC, o sea en el pasado) iban a 39,6 s las 25 pruebas; la de las 06:58 UTC (reloj en
 * HOY 18:00 UTC, once horas adelante) tardó 8,7 min y falló seis casos por «elemento no
 * visible». Parecía un selector, o el runner, o el PR que se acababa de mergear.
 *
 * Medido con el mismo build, la misma base y la misma sesión, cambiando solo el instante:
 *
 *   congelado 2026-09-18T18:00Z → /dashboard 200 en 1.571 ms
 *   congelado 2026-09-28T18:00Z → /dashboard TIMEOUT a 45.000 ms, con el 409 en bucle
 */
import { describe, it, expect } from "vitest";

// @ts-expect-error — `.mjs` sin tipos: es un script del arnés, no código de la app.
import { instanteCongelado } from "../../scripts/qa/snap.mjs";

/** 2026-09-28 a las 07:00 UTC: la 01:00 en Costa Rica, ANTES del mediodía de allá. */
const MADRUGADA = new Date("2026-09-28T07:00:00Z");
/** 2026-09-28 a las 20:00 UTC: las 14:00 en Costa Rica, DESPUÉS del mediodía. */
const TARDE = new Date("2026-09-28T20:00:00Z");

describe("instanteCongelado", () => {
  it("por defecto nunca devuelve un instante futuro, ni de madrugada", () => {
    const i = instanteCongelado(undefined, MADRUGADA);
    expect(
      i.getTime(),
      `devolvió ${i.toISOString()} con ahora=${MADRUGADA.toISOString()}`,
    ).toBeLessThanOrEqual(MADRUGADA.getTime());
  });

  it("de madrugada usa el mediodía de AYER, que es el último ya ocurrido", () => {
    expect(instanteCongelado(undefined, MADRUGADA).toISOString()).toBe("2026-09-27T18:00:00.000Z");
  });

  it("pasado el mediodía de Costa Rica usa el de hoy", () => {
    expect(instanteCongelado(undefined, TARDE).toISOString()).toBe("2026-09-28T18:00:00.000Z");
  });

  it("un instante explícito en el futuro se rechaza, no se corrige a escondidas", () => {
    // Corregirlo en silencio sería peor: quien lo pidió mediría otra cosa sin saberlo.
    expect(() => instanteCongelado("2026-12-31T00:00:00Z", TARDE)).toThrow(/futuro/i);
  });

  it("un instante explícito en el pasado se respeta tal cual", () => {
    expect(instanteCongelado("2026-09-18T18:00:00Z", TARDE).toISOString()).toBe(
      "2026-09-18T18:00:00.000Z",
    );
  });
});
