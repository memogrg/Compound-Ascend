/**
 * Reference journey — proves the harness end-to-end on BOTH surfaces (web-desktop and
 * the /m mobile shell): login (already done via storageState in setup) → create income
 * → create expense → verify persistence.
 *
 * PRIMARY gate (unambiguous): the created element is visible after a reload AND the row
 * is confirmed via service-role (monto · moneda · household). The derived "Flujo del
 * mes" number is SECONDARY/informative only — Fase 0 flagged it ambiguous, so it never
 * fails the test (number-vs-oracle is Fase 4/5).
 */
import { test, expect } from "../fixtures";
import { findIncomeRow, findExpenseRow, type ConfirmedRow } from "../lib/seed";

const INCOME_AMOUNT = 815_000;
const EXPENSE_AMOUNT = 12_345;
const CURRENCY = "CRC";

/** Poll a service-role read briefly (write→read consistency). */
async function pollRow(
  fn: () => Promise<ConfirmedRow | null>,
  timeoutMs = 8_000,
): Promise<ConfirmedRow | null> {
  const start = Date.now();
  for (;;) {
    const row = await fn();
    if (row) return row;
    if (Date.now() - start > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 500));
  }
}

test("login → crear ingreso → crear gasto → persistencia (UI + BD)", async (
  { page, journey, run, admin, evidence },
  testInfo,
) => {
  test.setTimeout(180_000);
  const tag = testInfo.project.name;
  const incomeName = `Ingreso cert ${tag}`;
  const expenseName = `Gasto cert ${tag}`;

  await journey.gotoHome();
  await evidence.shot(page, "home");

  // ── Create ────────────────────────────────────────────────────────────────
  await journey.createIncome({ name: incomeName, amount: INCOME_AMOUNT, currency: CURRENCY });
  await evidence.shot(page, "income-created");

  await journey.createExpense({ name: expenseName, amount: EXPENSE_AMOUNT, currency: CURRENCY });
  await evidence.shot(page, "expense-created");

  // ── PRIMARY 1 · UI persistence after reload ─────────────────────────────────
  const incomeSeen = await journey.incomeVisible(incomeName);
  evidence.check("Ingreso visible tras recargar", incomeSeen, incomeName);
  await evidence.shot(page, "income-persisted");
  expect(incomeSeen, "El ingreso creado no aparece tras recargar").toBeTruthy();

  const expenseSeen = await journey.expenseVisible(expenseName);
  evidence.check("Gasto visible tras recargar", expenseSeen, expenseName);
  await evidence.shot(page, "expense-persisted");
  expect(expenseSeen, "El gasto creado no aparece tras recargar").toBeTruthy();

  // ── PRIMARY 2 · service-role row confirmation (monto · moneda · household) ───
  const incomeRow = await pollRow(() => findIncomeRow(admin, run.userId, incomeName));
  evidence.check("Fila de ingreso en budget_items", Boolean(incomeRow), JSON.stringify(incomeRow));
  expect(incomeRow, "No se encontró la fila de ingreso (budget_items)").not.toBeNull();
  expect(incomeRow?.amount).toBe(INCOME_AMOUNT);
  expect(incomeRow?.currency).toBe(CURRENCY);
  expect(incomeRow?.household_id, "El ingreso no quedó etiquetado al household").toBe(run.householdId);

  const expenseRow = await pollRow(() => findExpenseRow(admin, run.userId, expenseName));
  evidence.check("Fila de gasto en transactions", Boolean(expenseRow), JSON.stringify(expenseRow));
  expect(expenseRow, "No se encontró la fila de gasto (transactions)").not.toBeNull();
  expect(expenseRow?.amount).toBe(EXPENSE_AMOUNT);
  expect(expenseRow?.currency).toBe(CURRENCY);
  expect(expenseRow?.household_id, "El gasto no quedó etiquetado al household").toBe(run.householdId);

  // ── SECONDARY · informative only (never gates) ──────────────────────────────
  const flow = await journey.readMonthFlow();
  evidence.check("Flujo del mes (secundario, informativo)", true, flow ?? "(no legible)");
  await evidence.shot(page, "month-flow");
});
