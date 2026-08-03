/**
 * Los TRES formatos de pegado, y qué camino toma cada uno.
 *
 * OJO — los fixtures están RECONSTRUIDOS a partir de la descripción del usuario, no son su pegado
 * real. Prueban lo que el código promete (elegir el monto y no el saldo, limpiar el ruido del
 * banco, aceptar fechas mixtas); cuando aparezcan los bloques de verdad hay que reemplazarlos,
 * porque la forma exacta que exporta el banco es lo único que cierra el caso.
 */
import { describe, it, expect } from "vitest";
import {
  parseStatement,
  pareceBloqueDeEstado,
  esFilaLimpia,
  bloqueEsLimpio,
  montosEnLinea,
} from "@/lib/ai/statement-parse";

// ── FORMATO A · limpio y tabular. Fast-path: se resuelve sin LLM.
const LIMPIO = `246276  2026-07-17  SUBWAY LAGUNILLA  3,900.00  COL  D
246277  2026-07-18  FRESH MARKET ESCAZU  24,150.00  COL  D
246281  2026-07-20  OLIVE GARDEN  18,700.00  COL  D`;

// ── FORMATO B · columnas extra: el ÚLTIMO número es el SALDO de la cuenta.
// El patrón posicional se queda con el de la derecha y registra el saldo como si fuera el gasto.
const CON_SALDO = `246276  2026-07-17  SUBWAY LAGUNILLA  3,900.00  COL  D  1,125,430.00
246277  2026-07-18  FRESH MARKET ESCAZU  24,150.00  COL  D  1,101,280.00
246281  2026-07-20  OLIVE GARDEN  18,700.00  COL  D  1,082,580.00`;

// ── FORMATO C · comercio en la última columna, con fecha de posteo y ruido del banco.
const COMERCIO_AL_FINAL = `17/07/2026  3,900.00  COL  D  2026-07-19 SUBWAY LAGUNILLA SAN JOSE CRI/BNCR
18/07/2026  24,150.00  COL  D  2026-07-20 FRESH MARKET ESCAZU HEREDIA CRI/BNCR
20/07/2026  18,700.00  COL  D  2026-07-22 OLIVE GARDEN TARJETA COLONES CRI/BNCR`;

describe("montosEnLinea · el guard contra el fallo silencioso", () => {
  it("una fila limpia trae UN importe", () => {
    expect(montosEnLinea("246276  2026-07-17  SUBWAY LAGUNILLA  3,900.00  COL  D")).toBe(1);
  });

  it("con saldo trae DOS: por eso no se puede resolver posicionalmente", () => {
    expect(
      montosEnLinea("246276  2026-07-17  SUBWAY LAGUNILLA  3,900.00  COL  D  1,125,430.00"),
    ).toBe(2);
  });

  it("un número chico en el nombre del comercio NO cuenta como importe", () => {
    expect(montosEnLinea("2026-07-17  SUBWAY 221  3,900.00  COL  D")).toBe(1);
  });

  it("la referencia del banco y la fecha no cuentan", () => {
    expect(montosEnLinea("246276  17/07/2026  POPS  1,500.00  COL  D")).toBe(1);
  });
});

describe("FORMATO A · limpio → fast-path determinista, sin LLM", () => {
  it("es un bloque y es limpio", () => {
    expect(pareceBloqueDeEstado(LIMPIO)).toBe(true);
    expect(bloqueEsLimpio(LIMPIO)).toBe(true);
  });

  it("parsea las tres filas con el monto correcto", () => {
    const { filas, ignoradas } = parseStatement(LIMPIO);
    expect(filas).toHaveLength(3);
    expect(ignoradas).toHaveLength(0);
    expect(filas.map((f) => f.monto)).toEqual([3900, 24150, 18700]);
    expect(filas[0]?.comercio).toBe("SUBWAY LAGUNILLA");
    expect(filas[0]?.moneda).toBe("CRC");
  });
});

describe("FORMATO B · columnas extra → NO se resuelve solo, va al LLM", () => {
  it("sigue detectándose como bloque (para no perderlo)", () => {
    expect(pareceBloqueDeEstado(CON_SALDO)).toBe(true);
  });

  it("pero NO es limpio: cada línea trae monto Y saldo", () => {
    expect(bloqueEsLimpio(CON_SALDO)).toBe(false);
    for (const l of CON_SALDO.split("\n")) expect(esFilaLimpia(l)).toBe(false);
  });

  it("y se ve POR QUÉ hace falta: el patrón se queda con el SALDO", () => {
    // Este es el fallo silencioso que motivó el cambio: parsea "bien" un número equivocado.
    const { filas } = parseStatement(CON_SALDO);
    expect(filas[0]?.monto).toBe(1_125_430); // ← el saldo, no los ₡3.900 del consumo
  });
});

describe("FORMATO C · comercio al final con ruido → va al LLM", () => {
  it("se detecta como bloque", () => {
    expect(pareceBloqueDeEstado(COMERCIO_AL_FINAL)).toBe(true);
  });

  it("NO es limpio: el patrón posicional no lo cubre", () => {
    expect(bloqueEsLimpio(COMERCIO_AL_FINAL)).toBe(false);
  });

  it("el parser determinista NO lo puede leer: por eso existe el extractor", () => {
    const { filas } = parseStatement(COMERCIO_AL_FINAL);
    // Cero filas: el patrón espera `fecha comercio monto` y acá el comercio va al final.
    expect(filas).toHaveLength(0);
  });

  it("REGRESIÓN: se detecta como bloque AUNQUE el patrón no lo lea", () => {
    // Este era el agujero de raíz: la detección dependía del parser estricto, así que el formato
    // más sucio —el que más necesita el LLM— ni siquiera entraba al carril de conciliación y se
    // iba al chat normal. Detectar y leer son decisiones distintas.
    expect(pareceBloqueDeEstado(COMERCIO_AL_FINAL)).toBe(true);
    expect(bloqueEsLimpio(COMERCIO_AL_FINAL)).toBe(false);
  });
});

describe("mezcla de formatos y fechas", () => {
  it("un bloque con fechas ISO y DD/MM/AAAA se sigue detectando", () => {
    const mixto = `2026-07-17  SUBWAY  3,900.00  COL  D\n18/07/2026  POPS  1,500.00  COL  D`;
    expect(pareceBloqueDeEstado(mixto)).toBe(true);
    const { filas } = parseStatement(mixto);
    expect(filas.map((f) => f.fecha)).toEqual(["2026-07-17", "2026-07-18"]);
  });

  it("si UNA sola línea es sucia, el bloque entero deja de ser limpio", () => {
    const mixto = `${LIMPIO}\n246290  2026-07-25  POPS  1,500.00  COL  D  1,081,080.00`;
    expect(bloqueEsLimpio(mixto)).toBe(false);
  });
});
