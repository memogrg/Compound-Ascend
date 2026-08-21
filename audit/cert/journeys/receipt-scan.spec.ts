/**
 * Receipt-scan journey (#6a, IA por UI) — the FLOW + the confirmed WRITE, deterministic.
 *
 * Provider: the default config forces the StubProvider (GEMINI_API_KEY:"" → getProvider falls
 * to the stub), so `vision()` returns "{}" → an EMPTY extract → the ReceiptConfirmCard opens
 * blank WITHOUT error. That's exactly what we want here: the SCAN path is exercised (upload →
 * POST /api/assistant/scan-receipt → card) and the values are ours — the write is 100%
 * test-controlled (aPayloadRecibo takes the EDITED card values; the OCR never re-intervenes).
 * The REAL-vision pre-population is covered by the gated live spec (audit/cert/live/).
 *
 * HARD gate (confirmed values → BD): a transaction is written with the amount/currency the user
 * confirmed — NATIVE, never coerced/converted. We confirm in USD while the user's primary is CRC:
 * if the row stored CRC (or a converted amount) → P0 PRODUCT (currency discipline, the receipt
 * analogue of #437), never masked. Plus origin='scanned' (came through the scanner, not manual),
 * linked_kind='none' (a plain expense), the confirmed date, and the household tag.
 *
 * The currency-confirm chip ("Sí, es …") is an OBLIGATORY POM step: the guessed-currency card
 * has monedaOk=false and confirmar() returns silently until it's clicked — so a passing test here
 * genuinely means the write happened, not that the button was a no-op.
 */
import { test, expect } from "../fixtures";
import { join } from "node:path";
import { createCertUser, deleteCertUser, findReceiptTxn } from "../lib/seed";
import { loginWeb, loginMobile } from "../pods/login";

test.use({ storageState: { cookies: [], origins: [] } });

const RECEIPT_IMG = join(__dirname, "..", "fixtures", "receipt.png");
const AMOUNT = 50; // USD 50 — must land NATIVE ($50), never coerced to CRC or converted.
const CURRENCY = "USD"; // user primary is CRC → proves the receipt's currency isn't overridden.

test("recibo IA: subir → confirmar card → transacción en BD (monto/moneda NATIVOS, origin=scanned)", async (
  { page, journey, admin, evidence },
  testInfo,
) => {
  test.setTimeout(180_000);
  const surface = (testInfo.project.metadata as { surface?: string }).surface === "mobile" ? "mobile" : "web";
  const runId = `receipt-${testInfo.project.name}-${Date.now()}`;
  const merchant = `Recibo Cert ${testInfo.project.name} ${Date.now()}`;

  const user = await createCertUser(runId, { onboarding: true });
  try {
    if (surface === "mobile") await loginMobile(page, { email: user.email, password: user.password });
    else await loginWeb(page, { email: user.email, password: user.password });

    // ── Upload → the scan opens the editable card (no error) → confirm our values ──
    // pickSobre:false on purpose — the sobre is OUTSIDE the hard gate, and a fresh onboarded user
    // has no favorite leaves (only "Sin sobre"), so there's nothing to pick. The pipeline
    // auto-categorizes or falls to "Por clasificar"; category is documented-soft below.
    const { occurredOn, sobrePicked } = await journey.scanReceiptConfirm({
      imagePath: RECEIPT_IMG,
      merchant,
      amount: AMOUNT,
      currency: CURRENCY,
      pickSobre: false,
    });
    evidence.check("Scan produjo la card sin error + confirmó", true, `sobre elegido=${sobrePicked}`);
    await evidence.shot(page, "receipt-registered");

    // ── HARD gate · la transacción confirmada quedó en BD con los valores NATIVOS ──
    const txn = await findReceiptTxn(admin, user.userId, merchant);
    evidence.check("Transacción del recibo en BD", Boolean(txn), JSON.stringify(txn));
    expect(txn, "el recibo confirmado no escribió transacción").toBeTruthy();

    evidence.check("Monto NATIVO (no convertido)", txn?.amount === AMOUNT, `amount=${txn?.amount} (esperado ${AMOUNT})`);
    expect(txn?.amount, "el monto no quedó nativo").toBe(AMOUNT);

    evidence.check("Moneda NATIVA (USD, no coercionada a CRC)", txn?.currency === CURRENCY, `currency=${txn?.currency}`);
    expect(txn?.currency, "REGRESIÓN moneda: el recibo USD no quedó en USD (¿coercionado a la primaria?)").toBe(CURRENCY);

    evidence.check("origin=scanned (vino por el escáner)", txn?.origin === "scanned", `origin=${txn?.origin}`);
    expect(txn?.origin, "la transacción no quedó marcada como 'scanned'").toBe("scanned");

    evidence.check("linked_kind=none (gasto llano)", (txn?.linkedKind ?? "none") === "none", `linked_kind=${txn?.linkedKind}`);
    expect(txn?.linkedKind ?? "none", "el recibo no debería nacer vinculado").toBe("none");

    evidence.check("Fecha confirmada persistida", txn?.occurredOn === occurredOn, `occurred_on=${txn?.occurredOn} (card=${occurredOn})`);
    expect(txn?.occurredOn, "la fecha confirmada no persistió").toBe(occurredOn);

    evidence.check("Comercio confirmado persistido", txn?.label === merchant, `label=${txn?.label}`);
    expect(txn?.label, "el comercio confirmado no persistió").toBe(merchant);

    evidence.check("Etiquetada al household", Boolean(txn?.householdId), txn?.householdId ?? "null");
    expect(txn?.householdId, "la transacción no quedó etiquetada al household").toBeTruthy();

    // ── SOFT · sobre fuera del gate duro: sin sobre → el pipeline auto-categoriza o 'Por clasificar' ──
    if (sobrePicked) {
      evidence.check("Sobre confirmado → category_id", Boolean(txn?.categoryId), txn?.categoryId ?? "null");
      expect(txn?.categoryId, "se eligió sobre pero la transacción no quedó categorizada").toBeTruthy();
    } else {
      evidence.check("Sin sobre (fuera del gate) → auto-categoría/Por clasificar", true, `category_id=${txn?.categoryId ?? "null"}`);
    }
  } finally {
    await deleteCertUser(user.userId);
  }
});
