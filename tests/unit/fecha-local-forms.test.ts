import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captureToday, todayISOInTz, currentPeriodInTz } from "@/lib/time/user-time-core";

/**
 * Delta 1 · #90 — el default de fecha de los formularios WEB de movimiento pasó de
 * `new Date().toISOString().slice(0, 10)` (UTC: de noche en América adelanta un día —y a
 * fin de mes, un mes—) a `useCaptureToday()`, que calcula "hoy" en la zona del PERFIL.
 *
 * (a) Prueba PURA tz→fecha del núcleo que consume `useCaptureToday` (`captureToday`): el
 *     caso que rompía es la NOCHE en Costa Rica (UTC−6), cuando en UTC ya es el día —o el
 *     mes— siguiente.
 */
describe("#90(a) · captureToday de noche: manda la zona del perfil, no UTC", () => {
  // 23:00 en Costa Rica del 15-ago == 05:00 UTC del 16-ago (día+1 en UTC).
  const NOCHE_15 = new Date("2026-08-16T05:00:00Z");

  it("23:00 CR → el default es el día LOCAL (15), no el de UTC (16)", () => {
    expect(captureToday("America/Costa_Rica", NOCHE_15)).toBe("2026-08-15");
    // Lo que grababa el bug (default UTC de la BD/`toISOString`) era el día siguiente:
    expect(todayISOInTz("UTC", NOCHE_15)).toBe("2026-08-16");
  });

  // 23:00 CR del ÚLTIMO DÍA de agosto == 05:00 UTC del 1-sep (mes+1 en UTC).
  const NOCHE_FIN_MES = new Date("2026-09-01T05:00:00Z");

  it("último día del mes de noche → queda en el mes en curso (ago), no el siguiente (sep)", () => {
    expect(captureToday("America/Costa_Rica", NOCHE_FIN_MES)).toBe("2026-08-31");
    expect(currentPeriodInTz("America/Costa_Rica", NOCHE_FIN_MES).month).toBe(8);
    // El bug UTC lo empujaba a septiembre (mes equivocado → cae en el presupuesto que no es):
    expect(todayISOInTz("UTC", NOCHE_FIN_MES)).toBe("2026-09-01");
    expect(currentPeriodInTz("UTC", NOCHE_FIN_MES).month).toBe(9);
  });
});

/**
 * (b) Regresión de barrido: ningún formulario WEB de movimiento tocado en delta 1 vuelve a
 *     usar el default UTC, y todos capturan "hoy" con el hook de zona del perfil.
 */
describe("#90(b) · regresión: los forms web tocados no usan el default UTC", () => {
  const FORMS = [
    "src/modules/control/components/debt-detail.tsx",
    "src/modules/control/components/debts-view.tsx",
    "src/modules/control/components/goal-withdraw-button.tsx",
    "src/modules/control/components/goal-spend-button.tsx",
    "src/modules/financial-base/components/v2/register-income-modal.tsx",
    "src/modules/financial-base/components/v2/income-sources.tsx",
    "src/modules/financial-base/components/v2/transfer-modal.tsx",
    "src/modules/financial-base/components/v2/transaction-composer.tsx",
    "src/modules/wealth/components/holding-detail-modal.tsx",
    "src/modules/wealth/components/add-holding-wizard.tsx",
    "src/modules/wealth/components/portfolio-view.tsx",
  ];

  it.each(FORMS)("%s — sin default UTC y usando useCaptureToday", (rel) => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    // El patrón del bug (UTC):
    expect(src).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/);
    // El helper device-local que reemplazamos tampoco debe quedar residual:
    expect(src).not.toMatch(/function todayISO\(\): string/);
    // Y sí debe capturar "hoy" en la zona del perfil:
    expect(src).toContain("useCaptureToday");
  });
});
