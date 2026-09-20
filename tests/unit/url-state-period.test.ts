/**
 * Parsers de URL (src/lib/url-state/period.ts).
 *
 * Dos cosas que estos tests fijan y conviene no perder:
 *  1. El módulo es CLIENT-SAFE. Si alguien le mete `server-only` o `userCurrentPeriod()`
 *     para "tener un default", el build del bundle de cliente se rompe — y el mes por
 *     defecto pasaría a calcularse con el reloj del servidor (UTC en Vercel), que le
 *     muestra otro mes a quien está en Costa Rica.
 *  2. El regex es ESTRICTO (01-12). `parseMonthParam` del engine usa `^\d{4}-\d{2}$` y
 *     `monthPeriod` clampea, así que "2026-13" ahí se convierte en diciembre en silencio.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import {
  isMonthParam,
  periodParser,
  comparisonParser,
  COMPARISON_MODES,
} from "@/lib/url-state/period";

describe("isMonthParam", () => {
  it("acepta meses 01-12", () => {
    for (const v of ["2026-01", "2026-09", "2026-12", "1999-06", "2100-11"]) {
      expect(isMonthParam(v)).toBe(true);
    }
  });

  it("rechaza el mes 00 y el 13 (el engine los clamparía en silencio)", () => {
    expect(isMonthParam("2026-00")).toBe(false);
    expect(isMonthParam("2026-13")).toBe(false);
    expect(isMonthParam("2026-99")).toBe(false);
  });

  it("rechaza formatos cortos, largos o con basura", () => {
    for (const v of ["2026-1", "26-01", "2026-012", "2026/01", "2026-01-15", "enero", ""]) {
      expect(isMonthParam(v)).toBe(false);
    }
  });

  it("rechaza espacios alrededor (no recorta)", () => {
    expect(isMonthParam(" 2026-01")).toBe(false);
    expect(isMonthParam("2026-01 ")).toBe(false);
    expect(isMonthParam("2026 -01")).toBe(false);
  });
});

describe("periodParser", () => {
  it("parse devuelve la cadena cuando es válida", () => {
    expect(periodParser.parse("2026-09")).toBe("2026-09");
  });

  it("parse devuelve null cuando no lo es: el consumidor decide el fallback", () => {
    expect(periodParser.parse("2026-13")).toBeNull();
    expect(periodParser.parse("")).toBeNull();
    expect(periodParser.parse("cualquier cosa")).toBeNull();
  });

  it("ida y vuelta: serialize(parse(v)) === v", () => {
    for (const v of ["2026-01", "2026-09", "2026-12"]) {
      const parsed = periodParser.parse(v);
      expect(parsed).not.toBeNull();
      expect(periodParser.serialize(parsed!)).toBe(v);
    }
  });

  it("no trae default propio: un valor ausente no inventa un mes", () => {
    // withDefault agregaría `defaultValue`; su ausencia es la garantía de que el período
    // lo pone el servidor, que es el único que conoce la zona del usuario.
    expect((periodParser as { defaultValue?: unknown }).defaultValue).toBeUndefined();
  });
});

describe("comparisonParser", () => {
  it("acepta los cuatro modos de la lista", () => {
    for (const modo of COMPARISON_MODES) {
      expect(comparisonParser.parse(modo)).toBe(modo);
    }
  });

  it("aplica el default 'prev' cuando el valor está fuera de la lista", () => {
    expect(comparisonParser.parse("inventado")).toBeNull();
    expect(comparisonParser.defaultValue).toBe("prev");
  });

  it("la lista es la fuente del tipo, no una copia a mano", () => {
    expect([...COMPARISON_MODES]).toEqual(["prev", "yoy", "budget", "avg3"]);
  });
});

describe("el módulo es client-safe", () => {
  const fuente = readFileSync(path.join(process.cwd(), "src/lib/url-state/period.ts"), "utf8");

  it("no importa server-only", () => {
    expect(fuente).not.toMatch(/^\s*import\s+["']server-only["']/m);
  });

  it("no importa userCurrentPeriod ni nada de @/modules", () => {
    expect(fuente).not.toMatch(/^\s*import[^;]*userCurrentPeriod/m);
    expect(fuente).not.toMatch(/^\s*import[^;]*from\s+["']@\/modules/m);
  });
});
