/**
 * Cleanup project (runs after the journeys): compile the per-run report and cascade-
 * delete the ephemeral user from the TEST project. Referenced as the `teardown` of the
 * setup project so it always runs, even if a journey failed.
 */
import { test as teardown } from "@playwright/test";
import { readContext } from "./lib/context";
import { deleteCertUser } from "./lib/seed";
import { compileReport } from "./lib/evidence";

teardown("compila reporte + borra usuario de prueba", async () => {
  const ctx = readContext();
  const { total, passed } = compileReport(ctx.runId);
  console.log(`[cert] Reporte: ${passed}/${total} journeys en verde → audit/evidence/${ctx.runId}/report.md`);
  await deleteCertUser(ctx.userId);
  console.log(`[cert] Usuario de prueba ${ctx.email} borrado del proyecto TEST.`);
});
