/**
 * Verifica la costura headless de consultar_historial (Tarea B): gated en SUPABASE_TEST_*
 * (NO necesita Gemini). Siembra una persona con snapshots de patrimonio y confirma que
 * `consultarHistorial` RECHAZA sin withSimAuth (requireUser/cookies headless) pero RESUELVE
 * bajo withSimAuth — i.e. ya no cae al camino de error (ok:false) del tool. Corre con
 * `npm run ai-audit` (config del audit: ws polyfill + env→TEST). `.spec.ts` para que
 * `npm test` (root, *.test.ts) no lo levante sin ese setup.
 */
import { describe, it, expect } from "vitest";
import { SIM_DB_READY } from "../../../sim/env";
import { createSimUser } from "../../../sim/harness";
import { AppDriver } from "../../../sim/app-driver";
import { onMonthDay } from "../../../sim/clock";
import { EventLog } from "../../../sim/event-log";
import { withSimAuth } from "@/lib/auth/sim-auth";
import { generateNetWorthSnapshot } from "@/modules/rich-life/services/net-worth-snapshot-service";
import { userCurrentPeriod } from "@/lib/time/user-time";
import { consultarHistorial } from "@/lib/ai/history-query-service";

describe.skipIf(!SIM_DB_READY)("ai-audit · consultar_historial headless (withSimAuth)", () => {
  it(
    "rechaza sin withSimAuth y resuelve con él (net_worth_snapshots de la persona)",
    async () => {
      const log = new EventLog();
      const sim = await createSimUser({ seed: 0xa11ce5, currency: "CRC", nowStamp: Date.now(), log });
      try {
        const driver = new AppDriver(sim.ctx, "CRC", log);
        await onMonthDay(0, 1, () => driver.openingBalance(500_000));
        // 3 cierres → net_worth_snapshots con ≥2 puntos (serie con tendencia).
        for (let m = 0; m < 3; m++) {
          await onMonthDay(m, 28, async () => {
            const period = await userCurrentPeriod(sim.ctx);
            await generateNetWorthSnapshot({ year: period.year, month: period.month }, sim.ctx, {
              precios: "cache",
            });
          });
        }

        // Control negativo: SIN withSimAuth, el reader cookie-based explota headless.
        await expect(consultarHistorial({ metrica: "patrimonio", meses: 6 }, "CRC")).rejects.toBeDefined();

        // Con withSimAuth: resuelve (ya no es el camino de error/ok:false del tool).
        const r = await withSimAuth(sim.ctx, () =>
          consultarHistorial({ metrica: "patrimonio", meses: 6 }, "CRC"),
        );
        expect(typeof r.resumen_md).toBe("string");
        expect(r.resumen_md.length).toBeGreaterThan(0);
      } finally {
        await sim.teardown();
      }
    },
    120_000,
  );
});
