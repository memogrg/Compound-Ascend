/**
 * `esPeriodoAnterior` — la comparación que decide si una LECTURA puede escribir.
 *
 * `loadBaseView` la usa para no llamar a `syncDerivedBudget` en meses pasados. Si esta
 * comparación se equivoca por un mes, vuelve el bug que fabricaba presupuesto retroactivo
 * con los montos de hoy.
 */
import { describe, it, expect, afterEach } from "vitest";

import { esPeriodoAnterior, monthPeriod } from "@/modules/financial-base/engine/period";

describe("esPeriodoAnterior", () => {
  it("anterior, igual y posterior dentro del mismo año", () => {
    const ago = monthPeriod(2026, 8);
    const sep = monthPeriod(2026, 9);
    expect(esPeriodoAnterior(ago, sep)).toBe(true);
    expect(esPeriodoAnterior(sep, sep)).toBe(false); // igual NO es anterior
    expect(esPeriodoAnterior(sep, ago)).toBe(false);
  });

  it("cruza el año: dic 2025 es anterior a ene 2026", () => {
    const dic = monthPeriod(2025, 12);
    const ene = monthPeriod(2026, 1);
    expect(esPeriodoAnterior(dic, ene)).toBe(true);
    expect(esPeriodoAnterior(ene, dic)).toBe(false);
  });

  it("no compara como texto: sep 2026 NO es posterior a oct 2026", () => {
    // "2026-9" > "2026-10" en orden lexicográfico. Este es el error que la función evita.
    expect(esPeriodoAnterior(monthPeriod(2026, 9), monthPeriod(2026, 10))).toBe(true);
    expect(esPeriodoAnterior(monthPeriod(2026, 10), monthPeriod(2026, 9))).toBe(false);
  });

  it("un año entero de diferencia", () => {
    expect(esPeriodoAnterior(monthPeriod(2025, 9), monthPeriod(2026, 9))).toBe(true);
    expect(esPeriodoAnterior(monthPeriod(2027, 1), monthPeriod(2026, 12))).toBe(false);
  });

  it("es estricta y antisimétrica en todos los pares", () => {
    const meses = [
      monthPeriod(2025, 11),
      monthPeriod(2025, 12),
      monthPeriod(2026, 1),
      monthPeriod(2026, 9),
      monthPeriod(2026, 10),
    ];
    for (let i = 0; i < meses.length; i++) {
      for (let j = 0; j < meses.length; j++) {
        const a = meses[i]!;
        const b = meses[j]!;
        if (i === j) expect(esPeriodoAnterior(a, b)).toBe(false);
        else expect(esPeriodoAnterior(a, b)).toBe(i < j);
      }
    }
  });
});

describe("no depende de la zona horaria", () => {
  const tzOriginal = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tzOriginal;
  });

  it("el resultado es el mismo en UTC, en Costa Rica y en Kiritimati", () => {
    // La función solo mira `year` y `month`, dos enteros que ya vienen resueltos en la zona
    // del usuario por `userCurrentPeriod()`. Este test fija esa propiedad: si alguien la
    // reescribiera con `new Date(...)`, el borde de fin de mes volvería a depender del TZ
    // del servidor (Vercel corre en UTC).
    const a = monthPeriod(2026, 9);
    const b = monthPeriod(2026, 10);
    for (const tz of ["UTC", "America/Costa_Rica", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      expect(esPeriodoAnterior(a, b), tz).toBe(true);
      expect(esPeriodoAnterior(b, a), tz).toBe(false);
      expect(esPeriodoAnterior(a, a), tz).toBe(false);
    }
  });

  it("no usa Date ni Intl en su implementación", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const fuente = readFileSync(
      path.join(process.cwd(), "src/modules/financial-base/engine/period.ts"),
      "utf8",
    );
    const cuerpo = /export function esPeriodoAnterior[^}]*}/.exec(fuente)?.[0] ?? "";
    expect(cuerpo).not.toMatch(/new Date|Intl\./);
    expect(cuerpo).toContain("year");
    expect(cuerpo).toContain("month");
  });
});
