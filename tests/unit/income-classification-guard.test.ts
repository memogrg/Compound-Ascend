import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isManualEntryClassified } from "@/modules/financial-base/engine/classify";

/**
 * GUARDRAIL — "corta el juego de topos".
 *
 * Un ingreso MANUAL no se puede guardar sin subcategoría. La definición de "clasificado" sale de
 * UNA sola fuente: isManualEntryClassified (engine/classify.ts). TODAS las superficies de registro
 * manual de ingreso deben reusar esa fn para bloquear el guardado — sin duplicar la lógica.
 *
 * Si agregás una superficie de ingreso NUEVA, agregala a INCOME_SURFACES **con** el guard. Los
 * forms de FUENTE de ingreso además se detectan solos (importan registerPassiveIncomeWithStubAction)
 * y el test falla si alguno queda fuera de la lista.
 */
const INCOME_SURFACES = [
  "src/modules/financial-base/components/v2/transaction-composer.tsx", // Transacciones (web)
  "src/modules/financial-base/components/v2/register-income-modal.tsx", // Ingresos (web)
  "src/app/(mobile)/m/(app)/transacciones/txn-form.tsx", // Transacciones (móvil)
  "src/app/(mobile)/m/(app)/ingresos/income-form.tsx", // Ingresos (móvil)
];

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

describe("guardrail · subcategoría de ingreso obligatoria (una sola definición)", () => {
  it("la definición de 'clasificado' para ingreso vive en isManualEntryClassified", () => {
    expect(isManualEntryClassified({ kind: "ingreso", incomeCatId: null })).toBe(false);
    expect(isManualEntryClassified({ kind: "ingreso", incomeCatId: "sub1" })).toBe(true);
    // Transfer/ajuste no llevan categoría → no aplica la regla.
    expect(isManualEntryClassified({ kind: "transferencia" })).toBe(true);
    expect(isManualEntryClassified({ kind: "ajuste" })).toBe(true);
  });

  it("cada superficie de ingreso reusa isManualEntryClassified (no duplica la lógica)", () => {
    for (const f of INCOME_SURFACES) {
      expect(read(f), `${f} debe usar isManualEntryClassified`).toContain("isManualEntryClassified");
    }
  });

  it("todo FORM de fuente de ingreso está en la lista (detección por registerPassiveIncomeWithStubAction)", () => {
    const users = walk(path.join(ROOT, "src"))
      .filter((f) => fs.readFileSync(f, "utf8").includes("registerPassiveIncomeWithStubAction"))
      .map(rel)
      .filter((f) => !f.endsWith("/v2-actions.ts")); // la definición de la action, no una superficie
    for (const f of users) {
      expect(
        INCOME_SURFACES,
        `${f} registra fuentes de ingreso: agregalo a INCOME_SURFACES CON el guard`,
      ).toContain(f);
    }
    // Sanity: las dos superficies de FUENTE deben detectarse.
    expect(users).toContain("src/modules/financial-base/components/v2/register-income-modal.tsx");
    expect(users).toContain("src/app/(mobile)/m/(app)/ingresos/income-form.tsx");
  });
});
