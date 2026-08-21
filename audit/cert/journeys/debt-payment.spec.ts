/**
 * Debt-payment journey (#3, P0, high-risk — the linked-transaction orchestrator + FX).
 *
 * Precondition (SERVER-SIDE, never a raw INSERT): two debts seeded via the app's createDebt(ctx)
 * — one in the primary currency (CRC) and one in USD (the FX case) — run out-of-process by the
 * debt fixture (tsx + server-only stub), the same headless path the sim uses. The PAYMENT goes
 * through the real UI (web /deudas · mobile /m/deudas). apr:0 so the derived balance falls by the
 * full payment.
 *
 * HARD deterministic gate (the #437 regression anchor): `debt_payments` has NO currency column,
 * so its amount is the debt's NATIVE currency. A USD payment must land as $50 native — NEVER
 * 50×rate. If it stored the converted value → P0 PRODUCT regression (#437), never masked.
 * FX DISPLAY gate (robust to the rate): the USD debt's balance IN CRC (getDebtsOverview) must be
 * the CONVERTED value (≫ native, not 1:1). Uses the app's own conversion + getFxRates; if that's
 * flaky, it degrades to "converted, not raw" — the native gate never degrades.
 */
import { test, expect } from "../fixtures";
import {
  createCertUser,
  deleteCertUser,
  seedDebtsViaService,
  readDebtsViaService,
  findDebtPayments,
  findLinkedDebtTxn,
} from "../lib/seed";
import { loginWeb, loginMobile } from "../pods/login";

test.use({ storageState: { cookies: [], origins: [] } });

const CRC_DEBT = { name: "Tarjeta CRC", balance: 500_000, minPayment: 25_000, currency: "CRC" };
const USD_DEBT = { name: "Prestamo USD", balance: 1_000, minPayment: 50, currency: "USD" };
const CRC_PAY = 100_000; // cuota 25.000 + extra 75.000 → total 100.000 (assert on the total)
const USD_PAY = 50; // = cuota → debt_payments.amount === 50 NATIVE (the #437 anchor)

test("pago de deuda: linked-transaction + FX (CRC directo · USD convertido, no crudo)", async (
  { page, journey, admin, evidence },
  testInfo,
) => {
  test.setTimeout(240_000);
  const surface = (testInfo.project.metadata as { surface?: string }).surface === "mobile" ? "mobile" : "web";
  const runId = `debt-${testInfo.project.name}-${Date.now()}`;

  const user = await createCertUser(runId, { onboarding: true });
  try {
    // ── Precondition · seed the two debts via the app service (server-side) ──────
    const seeded = seedDebtsViaService(user.email, user.password, [CRC_DEBT, USD_DEBT]);
    const crc = { id: seeded[CRC_DEBT.name]!.id, name: CRC_DEBT.name };
    const usd = { id: seeded[USD_DEBT.name]!.id, name: USD_DEBT.name };
    expect(crc.id, "no se sembró la deuda CRC").toBeTruthy();
    expect(usd.id, "no se sembró la deuda USD").toBeTruthy();

    if (surface === "mobile") await loginMobile(page, { email: user.email, password: user.password });
    else await loginWeb(page, { email: user.email, password: user.password });

    // ── Pay each debt through the UI (currency preloaded = the debt's own) ───────
    await journey.payDebt(crc, { amount: CRC_PAY });
    await evidence.shot(page, "crc-paid");
    await journey.payDebt(usd, { amount: USD_PAY });
    await evidence.shot(page, "usd-paid");

    // ── HARD gate · debt_payments.amount is NATIVE (the #437 regression anchor) ──
    const crcPays = await findDebtPayments(admin, crc.id);
    const usdPays = await findDebtPayments(admin, usd.id);
    const crcTotal = crcPays.reduce((s, p) => s + p.amount + p.extraAmount, 0);
    const usdTotal = usdPays.reduce((s, p) => s + p.amount + p.extraAmount, 0);
    evidence.check("Pago CRC nativo en debt_payments", crcTotal === CRC_PAY, `total=${crcTotal}`);
    evidence.check("Pago USD nativo en debt_payments (#437)", usdTotal === USD_PAY, `total=${usdTotal} (esperado ${USD_PAY}, NO 50×rate)`);
    expect(crcTotal, "el pago CRC no quedó nativo en debt_payments").toBe(CRC_PAY);
    expect(usdTotal, "REGRESIÓN #437: el pago USD no quedó NATIVO ($50) en debt_payments").toBe(USD_PAY);

    // ── Linked transaction · linked_kind/linked_id + currency = debt currency ────
    const crcTxn = await findLinkedDebtTxn(admin, user.userId, crc.id);
    const usdTxn = await findLinkedDebtTxn(admin, user.userId, usd.id);
    evidence.check("Transacción vinculada CRC", Boolean(crcTxn), JSON.stringify(crcTxn));
    evidence.check("Transacción vinculada USD", Boolean(usdTxn), JSON.stringify(usdTxn));
    expect(crcTxn?.linkedId, "la transacción CRC no quedó vinculada a la deuda").toBe(crc.id);
    expect(crcTxn?.currency, "la transacción CRC no quedó en la moneda de la deuda").toBe("CRC");
    expect(crcTxn?.householdId, "la transacción CRC no quedó etiquetada al household").toBeTruthy();
    expect(usdTxn?.linkedId, "la transacción USD no quedó vinculada a la deuda").toBe(usd.id);
    expect(usdTxn?.currency, "la transacción USD no quedó en USD").toBe("USD");
    // Trazabilidad origen→destino: el debt_payment referencia su transacción.
    evidence.check("Trazabilidad debt_payment→transacción (USD)", Boolean(usdPays[0]?.transactionId), usdPays[0]?.transactionId ?? "null");
    expect(usdPays[0]?.transactionId, "el debt_payment USD no referencia su transacción").toBeTruthy();

    // ── Derived native balance (apr:0 → ancla − pagos) + FX display (converted) ──
    const overview = readDebtsViaService(user.email, user.password);
    const crcRow = overview.debts.find((d) => d.id === crc.id);
    const usdRow = overview.debts.find((d) => d.id === usd.id);
    // Native: CRC 400.000 · USD 950 (exact, no FX).
    evidence.check("Saldo nativo CRC baja al total", crcRow?.nativeBalance === CRC_DEBT.balance - CRC_PAY, `${crcRow?.nativeBalance}`);
    evidence.check("Saldo nativo USD baja al total", usdRow?.nativeBalance === USD_DEBT.balance - USD_PAY, `${usdRow?.nativeBalance}`);
    expect(crcRow?.nativeBalance).toBe(CRC_DEBT.balance - CRC_PAY);
    expect(usdRow?.nativeBalance).toBe(USD_DEBT.balance - USD_PAY);
    // FX display robust: CRC identity; USD converted ≫ native (rate ~450), NEVER 1:1/raw.
    expect(crcRow?.convertedBalance, "CRC no debería convertirse (identidad)").toBeCloseTo(CRC_DEBT.balance - CRC_PAY, -1);
    const usdNative = usdRow?.nativeBalance ?? 0;
    const usdConverted = usdRow?.convertedBalance ?? 0;
    evidence.check("Saldo USD convertido a CRC (no crudo)", usdConverted > usdNative * 50, `conv=${usdConverted} nativo=${usdNative} (ratio≈${Math.round(usdConverted / (usdNative || 1))})`);
    expect(usdConverted, "REGRESIÓN FX: el saldo USD en CRC no está convertido (quedó ~crudo/1:1)").toBeGreaterThan(usdNative * 50);

    // ── Liquidez · el pago salió al gasto real del período (USD convertido incluido) ──
    // Raw-bug (USD tratado como CRC) daría ~100.050; convertido correcto ≈ 100.000 + 50×rate.
    evidence.check("Liquidez: gasto del período incluye el pago USD convertido", overview.periodRealExpense > 105_000, `periodRealExpense=${overview.periodRealExpense}`);
    expect(overview.periodRealExpense, "el pago no entró (convertido) en el gasto del período").toBeGreaterThan(105_000);
    await evidence.shot(page, "traceability");
  } finally {
    await deleteCertUser(user.userId);
  }
});
