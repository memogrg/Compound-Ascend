/**
 * GATED LIVE receipt spec (#6a, real vision) — closes the gap the stub run can't: "visión real →
 * card PRE-POBLADA → escritura". Runs ONLY under playwright.cert.live.config.ts (web-desktop,
 * real GEMINI_API_KEY). SELF-SKIPS when no key is present, so the default run is never touched.
 *
 * A legible synthetic receipt (audit/cert/fixtures/receipt-live.png — "SUPER CERT", TOTAL CRC
 * 12.345, same kind as the #657 smoke) is uploaded; the real model pre-fills the card.
 *
 *  · SOFT (tolerant to model variation): the card PRE-FILL ~matches — merchant mentions the store
 *    and/or the amount parses to ~12.345. The hard proof that vision ran is that the card was
 *    pre-populated at all (non-empty merchant OR amount before any edit).
 *  · HARD: after confirm, a transaction is written (the end-to-end flow completes against the real
 *    model, repeatably).
 */
import { test, expect } from "../fixtures";
import { join } from "node:path";
import { createCertUser, deleteCertUser, findReceiptTxn } from "../lib/seed";
import { loginWeb } from "../pods/login";

test.use({ storageState: { cookies: [], origins: [] } });

const RECEIPT_IMG = join(__dirname, "..", "fixtures", "receipt-live.png");

test.skip(
  !process.env.GEMINI_API_KEY,
  "live receipt spec: define GEMINI_API_KEY (real) para ejercer la visión real",
);

test("recibo IA (LIVE): visión real pre-puebla la card → confirmar → transacción en BD", async (
  { page, journey, admin, evidence },
) => {
  test.setTimeout(180_000);
  const runId = `receipt-live-${Date.now()}`;

  const user = await createCertUser(runId, { onboarding: true });
  try {
    await loginWeb(page, { email: user.email, password: user.password });

    // ── Upload → the REAL model pre-fills the card; read the pre-fill before editing ──
    const { prefillMerchant, prefillAmount, merchant, occurredOn } = await journey.scanReceiptLive(RECEIPT_IMG);
    await evidence.shot(page, "live-receipt-registered");

    // SOFT · the model extracted SOMETHING into the card (proof vision ran on the image).
    const gotPrefill = prefillMerchant.length > 0 || prefillAmount.length > 0;
    evidence.check("Card pre-poblada por visión real", gotPrefill, `comercio="${prefillMerchant}" monto="${prefillAmount}"`);
    expect(gotPrefill, "la visión real no pre-pobló ningún campo de la card").toBeTruthy();

    // SOFT · tolerant matches (never gate on exact model output).
    const merchantMatch = /super|cert|market/i.test(prefillMerchant);
    evidence.check("Comercio ~coincide (SUPER CERT)", merchantMatch, `leído="${prefillMerchant}"`);
    const amount = Number(prefillAmount.replace(/[^\d]/g, ""));
    const amountMatch = amount >= 11_000 && amount <= 13_500; // total real = 12.345
    evidence.check("Monto ~coincide (~12.345)", amountMatch, `leído="${prefillAmount}" → ${amount}`);

    // ── HARD · el flujo completó y escribió una transacción contra el modelo real ──
    const txn = await findReceiptTxn(admin, user.userId, merchant);
    evidence.check("Transacción escrita (flujo live completo)", Boolean(txn), JSON.stringify(txn));
    expect(txn, "el recibo live confirmado no escribió transacción").toBeTruthy();
    evidence.check("origin=scanned", txn?.origin === "scanned", `origin=${txn?.origin}`);
    expect(txn?.origin, "la transacción live no quedó marcada 'scanned'").toBe("scanned");
    evidence.check("Etiquetada al household", Boolean(txn?.householdId), txn?.householdId ?? "null");
    expect(txn?.householdId).toBeTruthy();
    evidence.check("Fecha persistida", txn?.occurredOn === occurredOn, `occurred_on=${txn?.occurredOn} (card=${occurredOn})`);
  } finally {
    await deleteCertUser(user.userId);
  }
});
