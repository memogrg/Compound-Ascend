/**
 * Holding-purchase journey (#5, P1-strong — the wealth→financial-base orchestrator, its own write
 * path). The alta IS the journey action (no seed): buy a QUOTED crypto holding through the UI on
 * each surface (web /patrimonio · mobile /m/inversiones).
 *
 * Inputs are chosen so buildHoldingPayload derives EXACT integers (holding-payload.ts): invested
 * 1000 / unitPrice 100 → quantity 10, average_cost 100, cost_basis 1000. Currency USD while the
 * user's primary is CRC (currency discipline, the #437 analogue). registerExpense = ON (mandatory
 * POM step) so the linked money-event transaction is created.
 *
 * HARD gate (BD, service-role, NO market price — all from the user's inputs):
 *   1. investment_holdings   {quantity, average_cost, cost_basis, currency USD NATIVE, asset_type}
 *   2. investment_transactions 'compra' {amount=qty×price, quantity, currency USD}   (DCA history)
 *   3. transactions linked   {linked_kind='holding', linked_id, currency USD, amount, kind gasto}  (the seam)
 * If USD were coerced to CRC (or the amount converted) in ANY of these → P0 PRODUCT, never masked.
 *
 * SOFT gate (robust to the live price, via the headless portfolio fixture): the investments value
 * the app computes (getPortfolioMarketValues) INCLUDES the holding, is > 0 and CONVERTED to CRC
 * (≫ the native USD figure — crypto keyless should give a live price; else cost-basis fallback,
 * still converted). A raw/1:1 value here would be a P0 currency bug in aggregation.
 */
import { test, expect } from "../fixtures";
import {
  createCertUser,
  deleteCertUser,
  findHolding,
  findHoldingPurchaseTx,
  findLinkedHoldingTxn,
  readPortfolioViaService,
} from "../lib/seed";
import { loginWeb, loginMobile } from "../pods/login";

test.use({ storageState: { cookies: [], origins: [] } });

const HOLDING = {
  category: "cripto",
  categoryLabel: "Cripto y activos digitales",
  symbol: "BTC",
  currency: "USD", // user primary is CRC → proves the holding's currency isn't overridden
  invested: 1000,
  unitPrice: 100, // → quantity = 1000/100 = 10 · average_cost = 100 · cost_basis = 1000
};
const EXP_QTY = 10;
const EXP_AVG = 100;
const EXP_COST_BASIS = 1000;
const EXP_LINKED_AMOUNT = 1000; // purchaseExpenseAmount = qty×avg = 10×100

test("alta de holding: investment_holdings + compra + transacción vinculada (monto/moneda NATIVOS)", async (
  { page, journey, admin, evidence },
  testInfo,
) => {
  test.setTimeout(240_000);
  const surface = (testInfo.project.metadata as { surface?: string }).surface === "mobile" ? "mobile" : "web";
  const runId = `holding-${testInfo.project.name}-${Date.now()}`;
  const name = `Cripto Cert ${testInfo.project.name} ${Date.now()}`;

  const user = await createCertUser(runId, { onboarding: true });
  try {
    if (surface === "mobile") await loginMobile(page, { email: user.email, password: user.password });
    else await loginWeb(page, { email: user.email, password: user.password });

    // ── The journey action: buy the holding through the UI (registerExpense ON) ──
    await journey.buyHolding({ ...HOLDING, name });
    await evidence.shot(page, "holding-created");

    // ── HARD gate 1 · investment_holdings row (native, exact, no market price) ──
    const holding = await findHolding(admin, user.userId, HOLDING.symbol);
    evidence.check("Fila investment_holdings", Boolean(holding), JSON.stringify(holding));
    expect(holding, "el alta no escribió investment_holdings").toBeTruthy();

    evidence.check("Cantidad derivada exacta", holding?.quantity === EXP_QTY, `quantity=${holding?.quantity} (esperado ${EXP_QTY})`);
    expect(holding?.quantity, "quantity derivada incorrecta").toBe(EXP_QTY);
    evidence.check("Costo promedio exacto", holding?.averageCost === EXP_AVG, `average_cost=${holding?.averageCost}`);
    expect(holding?.averageCost, "average_cost incorrecto").toBe(EXP_AVG);
    evidence.check("cost_basis = qty×avg", holding?.costBasis === EXP_COST_BASIS, `cost_basis=${holding?.costBasis}`);
    expect(holding?.costBasis, "cost_basis incorrecto").toBe(EXP_COST_BASIS);
    evidence.check("Moneda NATIVA (USD, no coercionada a CRC)", holding?.currency === "USD", `currency=${holding?.currency}`);
    expect(holding?.currency, "REGRESIÓN moneda: el holding USD no quedó en USD").toBe("USD");
    evidence.check("asset_type cripto", holding?.assetType === "cripto", `asset_type=${holding?.assetType}`);
    expect(holding?.assetType).toBe("cripto");
    evidence.check("Etiquetada al household", Boolean(holding?.householdId), holding?.householdId ?? "null");
    expect(holding?.householdId, "el holding no quedó etiquetado al household").toBeTruthy();

    // ── HARD gate 2 · investment_transactions 'compra' (DCA history) ────────────
    const buyTx = await findHoldingPurchaseTx(admin, holding!.id);
    evidence.check("Fila investment_transactions 'compra'", Boolean(buyTx), JSON.stringify(buyTx));
    expect(buyTx, "no se registró la compra en investment_transactions").toBeTruthy();
    evidence.check("Compra: amount = qty×price", buyTx?.amount === EXP_COST_BASIS, `amount=${buyTx?.amount}`);
    expect(buyTx?.amount, "el monto de la compra no es qty×price").toBe(EXP_COST_BASIS);
    evidence.check("Compra: quantity", buyTx?.quantity === EXP_QTY, `quantity=${buyTx?.quantity}`);
    expect(buyTx?.quantity).toBe(EXP_QTY);
    evidence.check("Compra: moneda USD nativa", buyTx?.currency === "USD", `currency=${buyTx?.currency}`);
    expect(buyTx?.currency, "REGRESIÓN moneda: la compra no quedó en USD").toBe("USD");

    // ── HARD gate 3 · linked transaction (the wealth→financial-base seam + registerExpense) ──
    const linked = await findLinkedHoldingTxn(admin, user.userId, holding!.id);
    evidence.check("Transacción vinculada (linked_kind=holding)", Boolean(linked), JSON.stringify(linked));
    expect(linked, "registerExpense=ON no creó la transacción vinculada").toBeTruthy();
    expect(linked?.linkedKind, "linked_kind incorrecto").toBe("holding");
    expect(linked?.linkedId, "linked_id no apunta al holding").toBe(holding!.id);
    evidence.check("Vinculada: moneda USD nativa", linked?.currency === "USD", `currency=${linked?.currency}`);
    expect(linked?.currency, "REGRESIÓN moneda: la transacción vinculada no quedó en USD").toBe("USD");
    evidence.check("Vinculada: amount = qty×avg", linked?.amount === EXP_LINKED_AMOUNT, `amount=${linked?.amount}`);
    expect(linked?.amount, "el monto de la transacción vinculada es incorrecto").toBe(EXP_LINKED_AMOUNT);
    expect(linked?.kind, "la transacción vinculada debería ser un gasto").toBe("gasto");
    expect(linked?.householdId, "la transacción vinculada no quedó etiquetada al household").toBeTruthy();

    // ── SOFT gate · el holding entra al portafolio, valor>0 y CONVERTIDO a CRC (no crudo/1:1) ──
    const portfolio = readPortfolioViaService(user.email, user.password);
    const ratio = Math.round(portfolio.totalCRC / EXP_COST_BASIS);
    evidence.check("Portafolio incluye el holding", portfolio.holdingsCount >= 1, `holdingsCount=${portfolio.holdingsCount}`);
    expect(portfolio.holdingsCount, "el portafolio no ve el holding").toBeGreaterThanOrEqual(1);
    evidence.check("Valor del portafolio en la primaria (CRC)", portfolio.currency === "CRC", `currency=${portfolio.currency}`);
    expect(portfolio.currency).toBe("CRC");
    evidence.check(
      "Valor CONVERTIDO a CRC (no crudo/1:1)",
      portfolio.totalCRC > EXP_COST_BASIS * 50,
      `totalCRC=${portfolio.totalCRC} nativo=${EXP_COST_BASIS} (ratio≈${ratio})`,
    );
    expect(portfolio.totalCRC, "REGRESIÓN FX: el valor del holding en CRC quedó ~crudo/1:1 (USD tratado como CRC)").toBeGreaterThan(EXP_COST_BASIS * 50);
    await evidence.shot(page, "portfolio-value");
  } finally {
    await deleteCertUser(user.userId);
  }
});
