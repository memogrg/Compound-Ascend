/**
 * Selectors for the SHARED AI UI (`src/components/ai/assistant-conversation.tsx`) — the same
 * ReceiptConfirmCard and chat markup render on web `/asistente` and mobile `/m/asistente`, so
 * their selectors live ONCE here (the two POMs only differ in route + send trigger). Every
 * text/CSS handle below is a data-testid candidate (TESTID-CANDIDATES.md).
 */
import { expect, type Page, type Locator } from "@playwright/test";
import { VISIBLE_TIMEOUT } from "./util";

const CARD = ".ac-rc-card";
/** Post-confirm success state: "✓ Registrado: …" (or "✓ Ya lo registré." when re-mounted). */
const DONE = /✓ Registrado|✓ Ya lo registré/;

/**
 * Upload a receipt image on the HIDDEN file input (the visible camera button only opens the OS
 * picker via fileRef.click(), so a test sets files directly) and wait for the editable card.
 * The card appearing WITHOUT an error is itself the proof the scan didn't error (stub → empty
 * extract, but still a card; a real failure shows an error toast and never mounts the card).
 */
export async function uploadReceipt(page: Page, imagePath: string): Promise<Locator> {
  await page.locator('input[aria-label="Escanear recibo con la cámara"]').setInputFiles(imagePath);
  const card = page.locator(CARD).last();
  await card.waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });
  return card;
}

/**
 * Click the currency-confirm chip ("Sí, es …") when the currency was GUESSED. This is
 * OBLIGATORY: the card starts with monedaOk=false (necesitaConfirmarMoneda) and confirmar()
 * returns SILENTLY while it's false — skipping this would produce a green that never wrote.
 */
async function confirmCurrencyIfNeeded(card: Locator): Promise<void> {
  const chip = card.getByRole("button", { name: /^Sí, es/ });
  if (await chip.isVisible().catch(() => false)) await chip.click();
}

/**
 * Pick the first REAL envelope (option[0] is "Sin sobre"). ALWAYS closes the listbox before
 * returning — an open list overlays the Confirmar button and intercepts its click (Escape does
 * NOT dismiss this combobox, so we CLICK an option to close it). A fresh onboarded user has no
 * favorite leaves → only "Sin sobre" shows → returns false (category stays null, documented).
 */
async function pickFirstSobre(page: Page, card: Locator): Promise<boolean> {
  const combo = card.getByRole("combobox", { name: "Sobre" });
  await combo.click();
  const options = page.getByRole("option");
  try {
    await options.first().waitFor({ state: "visible", timeout: 3_000 });
  } catch {
    return false; // combobox opened no list → already "Sin sobre"
  }
  const hasReal = (await options.count()) > 1;
  if (hasReal) await options.nth(1).click(); // first real envelope
  // CLOSE the list before returning (an open list overlays Confirmar). NB: the PRODUCT closes it on
  // select/Escape/blur (sobre-combobox.tsx choose()→close()); this is a Playwright-only artifact —
  // its synthetic click on the custom <li role=option> (under the <ul onMouseDown preventDefault>
  // focus-retention pattern) doesn't settle setOpen(false) in time. Blurring to Comercio — what a
  // human does moving on — closes it deterministically.
  await card.getByLabel("Comercio").click();
  await options.first().waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
  return hasReal;
}

export interface ReceiptInput {
  merchant: string;
  amount: number;
  currency: string;
  pickSobre?: boolean;
}

/**
 * STUB path: OVERWRITE every field with the confirmed values, then Confirmar. `aPayloadRecibo`
 * takes the EDITED values (the OCR never re-intervenes), so the write is fully test-controlled.
 * Returns the date the card carried (read from the field → tz-safe) + whether a sobre was picked.
 */
export async function fillAndConfirmReceipt(
  page: Page,
  card: Locator,
  input: ReceiptInput,
): Promise<{ occurredOn: string; sobrePicked: boolean }> {
  await card.getByLabel("Comercio").fill(input.merchant);
  await card.getByLabel("Monto").fill(String(input.amount));
  await card.getByLabel("Moneda").selectOption(input.currency);
  await confirmCurrencyIfNeeded(card);
  const occurredOn = await card.getByLabel("Fecha").inputValue();
  const sobrePicked = input.pickSobre ? await pickFirstSobre(page, card) : false;
  await card.getByRole("button", { name: "Confirmar" }).click();
  await page.getByText(DONE).first().waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });
  return { occurredOn, sobrePicked };
}

/**
 * LIVE path: read the model's PRE-FILL (merchant + amount, BEFORE any edit → proof the real
 * vision populated the card), ensure the amount is > 0 (validarRecibo requires it; fill a
 * fallback only if the model missed it), then Confirmar.
 */
export async function readPrefillAndConfirmReceipt(
  page: Page,
  card: Locator,
): Promise<{ prefillMerchant: string; prefillAmount: string; merchant: string; occurredOn: string }> {
  const prefillMerchant = (await card.getByLabel("Comercio").inputValue()).trim();
  const prefillAmount = (await card.getByLabel("Monto").inputValue()).trim();
  let merchant = prefillMerchant;
  if (!merchant) {
    merchant = "Recibo live (comercio no leído)";
    await card.getByLabel("Comercio").fill(merchant);
  }
  if (!prefillAmount) await card.getByLabel("Monto").fill("12345");
  await confirmCurrencyIfNeeded(card);
  const occurredOn = await card.getByLabel("Fecha").inputValue();
  await card.getByRole("button", { name: "Confirmar" }).click();
  await page.getByText(DONE).first().waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });
  return { prefillMerchant, prefillAmount, merchant, occurredOn };
}

/**
 * Chat round-trip. Waits for `POST /api/assistant/chat` (NOT chat-retention — matched by exact
 * pathname) and returns its status + reply, then settles on the LAST bubble's text (user and
 * assistant share the bubble class, so the assistant's answer is the last bubble ≠ the sent
 * message). Provider-agnostic: 200 + non-empty reply holds for the stub OR the live model.
 */
export async function askAdvisorOnPage(
  page: Page,
  message: string,
  opts: { send: "enter" | "button"; bubbleSel: string },
): Promise<{ status: number; reply: string; bubbleText: string }> {
  const box = page.getByRole("textbox", { name: "Mensaje para My Agent C+" });
  await box.waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });
  await box.fill(message);
  const respPromise = page.waitForResponse(
    (r) => {
      try {
        return new URL(r.url()).pathname === "/api/assistant/chat" && r.request().method() === "POST";
      } catch {
        return false;
      }
    },
    { timeout: 45_000 },
  );
  // `exact: true`: a non-exact "Enviar" also matches "✉︎ Enviarme el transcript" (substring) →
  // strict-mode violation on mobile. The send button's aria-label is exactly "Enviar".
  if (opts.send === "enter") await box.press("Enter");
  else await page.getByRole("button", { name: "Enviar", exact: true }).click();
  const resp = await respPromise;
  const status = resp.status();
  const json = (await resp.json().catch(() => ({}))) as { reply?: unknown };
  const reply = typeof json.reply === "string" ? json.reply : "";
  // The assistant's answer settles as the LAST bubble (it's appended after the user echo).
  let bubbleText = "";
  await expect
    .poll(
      async () => {
        bubbleText = (await page.locator(opts.bubbleSel).last().innerText().catch(() => "")).trim();
        return bubbleText && bubbleText !== message ? "ready" : "";
      },
      { timeout: VISIBLE_TIMEOUT },
    )
    .toBe("ready")
    .catch(() => {});
  return { status, reply, bubbleText };
}
