import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isManualEntryClassified } from "@/modules/financial-base/engine/classify";

/**
 * GUARDRAIL — "corta el juego de topos".
 *
 * CONTRATO: en TODO registro manual de INGRESO y de GASTO, si falta la clasificación (subcategoría
 * de ingreso / sobre de gasto), NO se guarda y aparece un WARNING VISIBLE a nivel de campo. La
 * definición de "clasificado" sale de UNA sola fuente: isManualEntryClassified (engine/classify),
 * no se reimplementa por form.
 *
 * Cada superficie debe:
 *  (a) usar isManualEntryClassified, y
 *  (b) exponer el copy del warning ("Seleccioná un sobre / una subcategoría para guardar").
 * Si agregás una superficie nueva, agregala a MANUAL_SURFACES con el contrato. Los forms de FUENTE
 * de ingreso además se detectan solos (importan registerPassiveIncomeWithStubAction) y el test
 * falla si alguno queda fuera de la lista.
 */
const MANUAL_SURFACES = [
  "src/modules/financial-base/components/v2/transaction-composer.tsx", // Transacciones / Gastos (web) — gasto + ingreso
  "src/modules/financial-base/components/v2/register-income-modal.tsx", // Ingresos (web) — ingreso
  "src/app/(mobile)/m/(app)/transacciones/txn-form.tsx", // Transacciones (móvil) — gasto + ingreso
  "src/app/(mobile)/m/(app)/ingresos/income-form.tsx", // Ingresos (móvil) — ingreso
  "src/app/(mobile)/m/(app)/gastos/gastos-forms.tsx", // Gastos (móvil) — gasto
];

const WARNING = /Seleccioná (un sobre|una subcategoría) para guardar/;

const ROOT = process.cwd();
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("guardrail · clasificación obligatoria en registro manual (una sola definición)", () => {
  it("la definición de 'clasificado' vive en isManualEntryClassified", () => {
    // Ingreso: exige subcategoría.
    expect(isManualEntryClassified({ kind: "ingreso", incomeCatId: null })).toBe(false);
    expect(isManualEntryClassified({ kind: "ingreso", incomeCatId: "sub1" })).toBe(true);
    // Gasto: exige sobre o entidad vinculada.
    expect(isManualEntryClassified({ kind: "gasto", categoryId: null })).toBe(false);
    expect(isManualEntryClassified({ kind: "gasto", categoryId: "sobre1" })).toBe(true);
    expect(isManualEntryClassified({ kind: "gasto", linkedId: "d1" })).toBe(true);
    // Transfer/ajuste no llevan categoría → no aplica la regla.
    expect(isManualEntryClassified({ kind: "transferencia" })).toBe(true);
    expect(isManualEntryClassified({ kind: "ajuste" })).toBe(true);
  });

  it("cada superficie (a) usa isManualEntryClassified y (b) expone el warning de campo", () => {
    for (const f of MANUAL_SURFACES) {
      const src = read(f);
      expect(src, `${f} debe usar isManualEntryClassified`).toContain("isManualEntryClassified");
      expect(src, `${f} debe exponer el copy del warning`).toMatch(WARNING);
    }
  });

  it("todo FORM de fuente de ingreso está en la lista (detección por registerPassiveIncomeWithStubAction)", () => {
    const users = walk(path.join(ROOT, "src"))
      .filter((f) => fs.readFileSync(f, "utf8").includes("registerPassiveIncomeWithStubAction"))
      .map(rel)
      .filter((f) => !f.endsWith("/v2-actions.ts")); // la definición de la action, no una superficie
    for (const f of users) {
      expect(
        MANUAL_SURFACES,
        `${f} registra fuentes de ingreso: agregalo a MANUAL_SURFACES CON el contrato`,
      ).toContain(f);
    }
    expect(users).toContain("src/modules/financial-base/components/v2/register-income-modal.tsx");
    expect(users).toContain("src/app/(mobile)/m/(app)/ingresos/income-form.tsx");
  });
});
