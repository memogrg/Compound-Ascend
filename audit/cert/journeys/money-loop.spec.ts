/**
 * Money-loop journey (#2) — extends the reference's expense creation with the two gates
 * the reference left out: the expense is REFLECTED in its jar/frasco (UI) and in the
 * period's real-expense total (BD). Runs on all 3 surfaces.
 *
 * Uses its OWN fresh onboarded user (not the shared storageState) so the jar's cumulative
 * spent equals THIS expense — the exact amount shows on every surface and there's no
 * cross-journey contamination (the shared user accumulates every journey's expenses, which
 * made a literal-amount match pass on web by ordering luck and fail on mobile).
 *
 * Gates: UI = frasco shows the consumption + row visible in /transacciones; BD = the
 * transactions row (kind gasto · monto · household) AND periodExpenseTotal includes it.
 * The exact "Flujo del mes" number is NEVER scraped (number-vs-oracle is Fase 4/5).
 */
import { test, expect } from "../fixtures";
import {
  createCertUser,
  deleteCertUser,
  findExpenseRow,
  periodExpenseTotal,
  resolveHouseholdId,
  type ConfirmedRow,
} from "../lib/seed";
import { loginWeb, loginMobile } from "../pods/login";

const EXPENSE_AMOUNT = 7_777;
const CURRENCY = "CRC";

// Fresh, isolated onboarded user per test → own login (not the shared storageState).
test.use({ storageState: { cookies: [], origins: [] } });

async function pollRow(fn: () => Promise<ConfirmedRow | null>, timeoutMs = 8_000): Promise<ConfirmedRow | null> {
  const start = Date.now();
  for (;;) {
    const row = await fn();
    if (row) return row;
    if (Date.now() - start > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** First day of the current month as YYYY-MM-DD (occurred_on is a date). */
function monthStartISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

test("loop de dinero: gasto → frasco + período + transacciones (UI + BD)", async (
  { page, journey, admin, evidence },
  testInfo,
) => {
  test.setTimeout(180_000);
  const surface = (testInfo.project.metadata as { surface?: string }).surface === "mobile" ? "mobile" : "web";
  const tag = testInfo.project.name;
  const runId = `loop-${tag}-${Date.now()}`;
  const name = `Gasto loop ${tag}`;

  const user = await createCertUser(runId, { onboarding: true });
  try {
    if (surface === "mobile") await loginMobile(page, { email: user.email, password: user.password });
    else await loginWeb(page, { email: user.email, password: user.password });

    await journey.gotoHome();
    await journey.createExpense({ name, amount: EXPENSE_AMOUNT, currency: CURRENCY });
    await evidence.shot(page, "expense-created");

    // ── UI 1 · the frasco reflects the consumption (fresh user → exact amount shows) ──
    const inJar = await journey.expenseReflectedInJar(EXPENSE_AMOUNT);
    evidence.check("El gasto se refleja en el frasco (consumo)", inJar, String(EXPENSE_AMOUNT));
    await evidence.shot(page, "jar-consumption");
    expect(inJar, "El gasto creado no se refleja en su frasco").toBeTruthy();

    // ── UI 2 · visible in /transacciones after reload ───────────────────────────
    const seen = await journey.expenseVisible(name);
    evidence.check("Gasto visible en transacciones", seen, name);
    await evidence.shot(page, "expense-persisted");
    expect(seen, "El gasto no aparece en /transacciones").toBeTruthy();

    // ── BD 1 · the transactions row (monto · household) ─────────────────────────
    const householdId = await resolveHouseholdId(admin, user.userId);
    const row = await pollRow(() => findExpenseRow(admin, user.userId, name));
    evidence.check("Fila de gasto en transactions", Boolean(row), JSON.stringify(row));
    expect(row, "No se encontró la fila de gasto (transactions)").not.toBeNull();
    expect(row?.amount).toBe(EXPENSE_AMOUNT);
    expect(row?.currency).toBe(CURRENCY);
    expect(row?.household_id, "El gasto no quedó etiquetado al household").toBe(householdId);

    // ── BD 2 · the period total INCLUDES the amount (unambiguous dashboard reflection) ──
    const total = await periodExpenseTotal(admin, user.userId, monthStartISO());
    evidence.check("periodExpenseTotal incluye el gasto", total >= EXPENSE_AMOUNT, `total=${total} ≥ ${EXPENSE_AMOUNT}`);
    expect(total, "El gasto no entró en el total real del período").toBeGreaterThanOrEqual(EXPENSE_AMOUNT);
  } finally {
    await deleteCertUser(user.userId);
  }
});
