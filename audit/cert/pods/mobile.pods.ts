/**
 * Mobile implementation of Journey against the DEDICATED /m shell (NOT the web routes
 * under a small viewport). Runs under Playwright device emulation. The mobile Form Kit
 * uses BottomSheets (role=dialog, aria-label=title) and .m-qfield wrappers whose labels
 * are DIVs (not <label htmlFor>), so fields are reached by placeholder or by scoping to
 * the .m-qlabel text — every such case is a data-testid candidate (TESTID-CANDIDATES.md).
 */
import { type Page } from "@playwright/test";
import type { Journey, MoneyInput, OnboardingInput } from "./journey";
import { isVisibleSoon, VISIBLE_TIMEOUT } from "./util";
import {
  uploadReceipt,
  fillAndConfirmReceipt,
  readPrefillAndConfirmReceipt,
  askAdvisorOnPage,
} from "./ai-shared";

/** CRC/es grouping: 12345 → "12.345" (dot thousands), for matching money on screen. */
function grouped(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * The month-rhythm nudge (`m-rhythm-nudge`, role=status) is mounted on EVERY /m/(app) screen and
 * sits "anclada abajo, sobre el Fab", overlaying the primary CTA and intercepting its clicks.
 * Dismiss it via its "Cerrar aviso" button before interacting. (Also a real UX-audit finding: a
 * status nudge covering the primary action on an empty screen.)
 */
async function dismissNudge(page: Page): Promise<void> {
  const close = page.getByRole("button", { name: "Cerrar aviso" });
  for (let i = 0; i < 2 && (await close.isVisible().catch(() => false)); i++) {
    await close.click().catch(() => {});
    await page.waitForTimeout(150);
  }
}

export class MobileJourney implements Journey {
  readonly surface = "mobile" as const;
  constructor(private readonly page: Page) {}

  async gotoHome(): Promise<void> {
    await this.page.goto("/m");
    await this.page.waitForLoadState("networkidle");
  }

  async createIncome({ name, amount }: MoneyInput): Promise<void> {
    const page = this.page;
    await page.goto("/m/ingresos");
    await page.waitForLoadState("networkidle");
    await dismissNudge(page);
    // The FAB (button.m-fab) is the robust trigger: single per screen, always present, and after the
    // nudge is dismissed it's the topmost element (the inline empty-state button gets overlapped by
    // the FAB itself). testid candidate. 0 sources → opens "Registrar ingreso" directly; ≥1 → a
    // choice sheet ("Ingresos") first.
    await page.locator("button.m-fab").click();
    const choice = page.getByRole("dialog", { name: "Ingresos" });
    const sheet = page.getByRole("dialog", { name: "Registrar ingreso" });
    await Promise.race([
      choice.waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT }).catch(() => {}),
      sheet.waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT }).catch(() => {}),
    ]);
    if (await choice.isVisible().catch(() => false)) {
      await choice.getByRole("button", { name: /Crear fuente nueva/ }).click();
    }
    await sheet.waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });
    await sheet.getByPlaceholder("Salario, alquiler, comisión…").fill(name);
    await sheet.getByPlaceholder("0").fill(String(amount)); // MoneyField "Monto"
    // "Tipo de ingreso" defaults to Activo. Subcategoría is REQUIRED (SheetSelect):
    // open it and pick the first option. testid candidate.
    await sheet
      .locator('.m-qfield:has(.m-qlabel:has-text("Subcategoría")) button.m-sheetselect')
      .click();
    await page.getByRole("dialog", { name: "Subcategoría" }).locator(".m-opt").first().click();
    await sheet.getByRole("button", { name: "Guardar ingreso" }).click();
    await sheet.waitFor({ state: "hidden", timeout: VISIBLE_TIMEOUT });
  }

  async createExpense({ name, amount }: MoneyInput): Promise<void> {
    const page = this.page;
    await page.goto("/m/gastos");
    await page.waitForLoadState("networkidle");
    await dismissNudge(page);
    // The FAB (button.m-fab) always opens the choice sheet on /m/gastos → "Registrar un gasto".
    // Robust + topmost after the nudge is dismissed. testid candidate.
    await page.locator("button.m-fab").click();
    await page
      .getByRole("dialog", { name: "Gastos" })
      .getByRole("button", { name: /Registrar un gasto/ })
      .click();
    const sheet = page.getByRole("dialog", { name: "Registrar gasto" });
    await sheet.waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });
    await sheet.getByPlaceholder("0").fill(String(amount)); // MoneyField "Monto"
    await sheet.getByPlaceholder("Súper, gasolina, farmacia…").fill(name);
    // "Sobre *" is REQUIRED: open the picker and take the first envelope. testid candidate.
    await sheet
      .locator('.m-qfield:has(.m-qlabel:has-text("Sobre")) button.m-sheetselect')
      .click();
    await page.getByRole("dialog", { name: "Elige un sobre" }).locator(".m-opt").first().click();
    await sheet.getByRole("button", { name: "Registrar gasto" }).click();
    await sheet.waitFor({ state: "hidden", timeout: VISIBLE_TIMEOUT });
  }

  async incomeVisible(name: string): Promise<boolean> {
    await this.page.goto("/m/ingresos");
    await this.page.waitForLoadState("networkidle");
    return isVisibleSoon(this.page, name);
  }

  async expenseVisible(name: string): Promise<boolean> {
    await this.page.goto("/m/transacciones");
    await this.page.waitForLoadState("networkidle");
    return isVisibleSoon(this.page, name);
  }

  async readMonthFlow(): Promise<string | null> {
    const page = this.page;
    await page.goto("/m");
    await page.waitForLoadState("networkidle");
    const label = page.getByText("Flujo del mes", { exact: false }).first();
    if (!(await label.isVisible().catch(() => false))) return null;
    return label
      .locator("xpath=ancestor-or-self::*[position()<=3]")
      .last()
      .innerText()
      .then((t) => t.replace(/\s+/g, " ").trim())
      .catch(() => null);
  }

  // ── Onboarding (journey #1) ─────────────────────────────────────────────────
  // Web asserts the /dashboard→/bienvenida redirect; the /m wizard lives at
  // /m/perfil-financiero, so here "gate reached" = the wizard is reachable + renders
  // step 1 for a not-onboarded user (its auto-redirect behavior is noted in the report).
  async onboardingGateReached(): Promise<boolean> {
    await this.page.goto("/m/perfil-financiero");
    await this.page.waitForLoadState("networkidle");
    return isVisibleSoon(this.page, "¿Cómo quieres que te llamemos?");
  }

  async completeOnboarding({ displayName, nucleusLabel }: OnboardingInput): Promise<void> {
    const page = this.page;
    if (!page.url().includes("/m/perfil-financiero")) await page.goto("/m/perfil-financiero");
    await page.waitForLoadState("networkidle");
    // Step 1 · DNA we assert: displayName (text) + financial_nucleus (m-opt card, robust).
    await page.getByPlaceholder("Memo, Caro…").fill(displayName, { timeout: VISIBLE_TIMEOUT });
    // Non-exact: the m-opt card's accessible name includes its glyph; substring is robust.
    await page.getByRole("button", { name: nucleusLabel }).first().click({ timeout: VISIBLE_TIMEOUT });
    // Advance until "Finalizar" (all steps optional), then finish.
    for (let i = 0; i < 20; i++) {
      const finalizar = page.getByRole("button", { name: "Finalizar" });
      if (await finalizar.isVisible().catch(() => false)) {
        await finalizar.click();
        break;
      }
      await page.getByRole("button", { name: "Siguiente" }).click();
      await page.waitForTimeout(250);
    }
    await page.getByText(/Generando tu perfil/).waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
  }

  async dashboardRenders(): Promise<boolean> {
    const page = this.page;
    await page.goto("/m");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("perfil-financiero") || page.url().includes("bienvenida")) return false;
    // Mobile home shows the month-flow pillar too; fall back to any /m app chrome.
    return (await isVisibleSoon(page, "Flujo del mes")) || (await isVisibleSoon(page, "Inicio"));
  }

  // ── Money loop (journey #2) ─────────────────────────────────────────────────
  async expenseReflectedInJar(amount: number): Promise<boolean> {
    await this.page.goto("/m/gastos");
    await this.page.waitForLoadState("networkidle");
    await dismissNudge(this.page);
    return isVisibleSoon(this.page, grouped(amount));
  }

  // ── Debt payment (journey #3) ───────────────────────────────────────────────
  async payDebt(debt: { id: string; name: string }, { amount }: { amount: number }): Promise<void> {
    const page = this.page;
    // A prior payment's router.refresh() may still be navigating (webkit is strict about a
    // concurrent goto → "interrupted by another navigation"). Let it settle, then navigate
    // with a one-shot retry so the second payment isn't racing the first's refresh.
    await page.waitForLoadState("networkidle").catch(() => {});
    for (let i = 0; ; i++) {
      try {
        await page.goto("/m/deudas");
        break;
      } catch (e) {
        if (i >= 2) throw e;
        await page.waitForTimeout(400);
      }
    }
    await page.waitForLoadState("networkidle");
    await dismissNudge(page);
    // Scope "Reportar pago" to THIS debt's row (the list renders one button per debt): the
    // smallest container that holds both the debt name and the button. testid candidate.
    const row = page
      .locator("div")
      .filter({ hasText: debt.name })
      .filter({ has: page.getByRole("button", { name: "Reportar pago" }) })
      .last();
    await row.getByRole("button", { name: "Reportar pago" }).click({ timeout: VISIBLE_TIMEOUT });
    const sheet = page.getByRole("dialog", { name: "Reportar pago" });
    await sheet.waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });
    // Amount only (MoneyField, placeholder "0"). Currency preloaded NATIVE — never changed
    // (the mobile form's own comment flags that preloading the converted value is the #437 P0).
    await sheet.getByPlaceholder("0").first().fill(String(amount));
    await sheet.getByRole("button", { name: "Registrar pago" }).click();
    await sheet.waitFor({ state: "hidden", timeout: VISIBLE_TIMEOUT });
  }

  // ── IA por UI (journey #6) · móvil /m/asistente ─────────────────────────────
  // Same shared ReceiptConfirmCard + chat markup as web (only the skin differs); /m/asistente
  // is NOT under the /m/(app) layout, so the rhythm nudge isn't mounted — dismissNudge is a
  // defensive no-op here.
  async scanReceiptConfirm(input: {
    imagePath: string;
    merchant: string;
    amount: number;
    currency: string;
    pickSobre?: boolean;
  }): Promise<{ occurredOn: string; sobrePicked: boolean }> {
    const page = this.page;
    await page.goto("/m/asistente");
    await page.waitForLoadState("networkidle");
    await dismissNudge(page);
    const card = await uploadReceipt(page, input.imagePath);
    return fillAndConfirmReceipt(page, card, input);
  }

  async scanReceiptLive(imagePath: string): Promise<{
    prefillMerchant: string;
    prefillAmount: string;
    merchant: string;
    occurredOn: string;
  }> {
    const page = this.page;
    await page.goto("/m/asistente");
    await page.waitForLoadState("networkidle");
    await dismissNudge(page);
    const card = await uploadReceipt(page, imagePath);
    return readPrefillAndConfirmReceipt(page, card);
  }

  async askAdvisor(message: string): Promise<{ status: number; reply: string; bubbleText: string }> {
    const page = this.page;
    await page.goto("/m/asistente");
    await page.waitForLoadState("networkidle");
    // Mobile Enter = newline → MUST send via the "Enviar" button; bubble class is `.m-bubble`.
    return askAdvisorOnPage(page, message, { send: "button", bubbleSel: ".m-bubble" });
  }
}
