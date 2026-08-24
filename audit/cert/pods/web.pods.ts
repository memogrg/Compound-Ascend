/**
 * Web-desktop implementation of Journey. Every selector for the web surface lives here.
 * Preference order per the founder's guidance: getByRole / getByLabel first; text/CSS
 * only where the DOM offers no accessible handle — each such case is a data-testid
 * candidate (see TESTID-CANDIDATES.md).
 */
import { expect, type Page } from "@playwright/test";
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

export class WebJourney implements Journey {
  readonly surface = "web" as const;
  constructor(private readonly page: Page) {}

  async gotoHome(): Promise<void> {
    await this.page.goto("/dashboard");
    await this.page.waitForLoadState("networkidle");
  }

  async createIncome({ name, amount }: MoneyInput): Promise<void> {
    const page = this.page;
    await page.goto("/ingresos");
    await page.getByRole("button", { name: "Registrar ingreso" }).click();
    const modal = page.getByRole("dialog", { name: "Registrar ingreso" });
    await modal.getByPlaceholder("Salario, alquiler, comisión…").fill(name);
    // Money input — the only placeholder "0" inside the modal.
    await modal.getByPlaceholder("0").fill(String(amount));
    // Income type defaults to "Activo". Subcategoría is REQUIRED: pick the first
    // system leaf (the leaf buttons precede the "+ Otro" button). testid candidate.
    await modal
      .locator('.fld:has(label:has-text("Subcategoría")) button')
      .first()
      .click();
    await modal.getByRole("button", { name: "Guardar ingreso" }).click();
    // Success closes the modal (finish → onClose). More robust than racing the toast.
    await modal.waitFor({ state: "hidden", timeout: VISIBLE_TIMEOUT });
  }

  async createExpense({ name, amount }: MoneyInput): Promise<void> {
    const page = this.page;
    await page.goto("/gastos");
    await page.getByRole("button", { name: "Registrar gasto" }).click();
    const modal = page.getByRole("dialog", { name: "Registrar gasto" });
    await modal.getByPlaceholder("Automercado, Uber, Netflix…").fill(name);
    await modal.getByPlaceholder("0").fill(String(amount));
    // Category is required: the "(general)" envelope of the first jar. testid candidate.
    await modal.getByRole("button", { name: /\(general\)/ }).first().click();
    await modal.getByRole("button", { name: /Guardar/ }).click();
    await expect(page.getByText("Gasto registrado")).toBeVisible({ timeout: VISIBLE_TIMEOUT });
  }

  async incomeVisible(name: string): Promise<boolean> {
    await this.page.goto("/ingresos");
    await this.page.waitForLoadState("networkidle");
    return isVisibleSoon(this.page, name);
  }

  async expenseVisible(name: string): Promise<boolean> {
    await this.page.goto("/transacciones");
    await this.page.waitForLoadState("networkidle");
    return isVisibleSoon(this.page, name);
  }

  async readMonthFlow(): Promise<string | null> {
    const page = this.page;
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const label = page.getByText("Flujo del mes", { exact: false }).first();
    if (!(await label.isVisible().catch(() => false))) return null;
    // Best-effort: the pillar card's own text. Informative only — never a gate.
    return label
      .locator("xpath=ancestor-or-self::*[position()<=3]")
      .last()
      .innerText()
      .then((t) => t.replace(/\s+/g, " ").trim())
      .catch(() => null);
  }

  // ── Onboarding (journey #1) ─────────────────────────────────────────────────
  async onboardingGateReached(): Promise<boolean> {
    // A fresh login is redirected here by the /dashboard gate; also accept the StartChoice.
    await this.page.waitForLoadState("networkidle").catch(() => {});
    if (this.page.url().includes("/bienvenida")) return true;
    return isVisibleSoon(this.page, "¿Cómo quieres");
  }

  async completeOnboarding({ displayName, nucleusLabel }: OnboardingInput): Promise<void> {
    const page = this.page;
    if (!page.url().includes("/bienvenida")) await page.goto("/bienvenida");
    await page.waitForLoadState("networkidle");
    // StartChoice → guided path (starts the step wizard). testid candidate.
    const guided = page.getByRole("button", { name: /Guíame paso a paso/ });
    if (await guided.isVisible().catch(() => false)) await guided.click();
    // Step 1 · DNA we assert: displayName (text) + financial_nucleus (OptionCard, robust).
    await page.getByPlaceholder("Memo, Caro…").fill(displayName, { timeout: VISIBLE_TIMEOUT });
    // Non-exact: the OptionCard's accessible name includes the check/icon glyph, so an exact
    // "Personal" match finds nothing. Substring is robust; short timeout fails fast if it breaks.
    await page.getByRole("button", { name: nucleusLabel }).first().click({ timeout: VISIBLE_TIMEOUT });
    // All steps are optional (goNext never blocks). Advance until "Finalizar", then finish.
    for (let i = 0; i < 20; i++) {
      const finalizar = page.getByRole("button", { name: "Finalizar" });
      if (await finalizar.isVisible().catch(() => false)) {
        await finalizar.click();
        break;
      }
      await page.getByRole("button", { name: /^Continuar/ }).click();
      await page.waitForTimeout(250);
    }
    // completeOnboardingAction runs on finish ("Generando tu perfil…"); wait for it to settle.
    await page.getByText(/Generando tu perfil/).waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
  }

  async dashboardRenders(): Promise<boolean> {
    const page = this.page;
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // Gate: onboarded users STAY on /dashboard (a not-onboarded one bounces to /bienvenida).
    if (page.url().includes("/bienvenida")) return false;
    // "Centro de mando" (sidebar nav) is present on BOTH the populated and the fresh
    // empty-state dashboard ("Construyamos tu panel") — the data pillar "Flujo del mes"
    // is NOT shown for a brand-new user with no income/expense yet, so we don't key on it.
    return isVisibleSoon(page, "Centro de mando");
  }

  // ── Money loop (journey #2) ─────────────────────────────────────────────────
  async expenseReflectedInJar(amount: number): Promise<boolean> {
    await this.page.goto("/gastos");
    await this.page.waitForLoadState("networkidle");
    // The jar row prints the envelope's spent as formatMoney(spent). For a fresh user the
    // envelope's cumulative spent equals this expense → the grouped amount shows on screen.
    return isVisibleSoon(this.page, grouped(amount));
  }

  // ── Debt payment (journey #3) ───────────────────────────────────────────────
  async payDebt(debt: { id: string; name: string }, { amount }: { amount: number }): Promise<void> {
    const page = this.page;
    // The debt detail page's PRIMARY "Reportar pago" (btn-primary) — unambiguous vs the schedule
    // table's per-row "Pagar" buttons. Its ReportPaymentModal captures in the debt's NATIVE
    // currency (no currency selector; submit uses vm.nativa.currency) — the #437-correct path.
    await page.goto(`/deudas/${debt.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Reportar pago" }).first().click({ timeout: VISIBLE_TIMEOUT });
    const modal = page.getByRole("dialog", { name: "Reportar pago" });
    await modal.waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });
    // "Monto de la cuota" — the first money input; overwrite the preloaded cuota. Leave the
    // "Pago extra" input empty so the whole payment lands as the ordinary amount.
    await modal.locator('.inp-money input[type="number"]').first().fill(String(amount));
    await modal.getByRole("button", { name: /Registrar pago|Guardar/ }).click();
    await modal.waitFor({ state: "hidden", timeout: VISIBLE_TIMEOUT });
  }

  // ── IA por UI (journey #6) · web /asistente ─────────────────────────────────
  async scanReceiptConfirm(input: {
    imagePath: string;
    merchant: string;
    amount: number;
    currency: string;
    pickSobre?: boolean;
  }): Promise<{ occurredOn: string; sobrePicked: boolean }> {
    const page = this.page;
    await page.goto("/asistente");
    await page.waitForLoadState("networkidle");
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
    await page.goto("/asistente");
    await page.waitForLoadState("networkidle");
    const card = await uploadReceipt(page, imagePath);
    return readPrefillAndConfirmReceipt(page, card);
  }

  async askAdvisor(message: string): Promise<{ status: number; reply: string; bubbleText: string }> {
    const page = this.page;
    await page.goto("/asistente");
    await page.waitForLoadState("networkidle");
    // Web sends on Enter; the assistant bubble class is `.coach-bubble`.
    return askAdvisorOnPage(page, message, { send: "enter", bubbleSel: ".coach-bubble" });
  }

  // ── Holding purchase (journey #5) · web /patrimonio ─────────────────────────
  async buyHolding(input: {
    category: string;
    name: string;
    symbol: string;
    invested: number;
    unitPrice: number;
    currency: string;
    categoryLabel: string;
  }): Promise<void> {
    const page = this.page;
    await page.goto("/patrimonio");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Agregar inversión" }).first().click();
    // Step 1: pick the category. Crypto is a GROWTH category → the "Crecimiento" <select>; the
    // option value is the category key (selectOption by value, label-independent). Advances to step 2.
    await page
      .getByRole("combobox", { name: "Tipo de inversión · Crecimiento" })
      .selectOption(input.category, { timeout: VISIBLE_TIMEOUT });
    // Step 2: the wizard dialog is the only dialog carrying a "Guardar" button (a nested currency
    // sheet won't) — filter by it so the locator survives the title changing to the category label.
    const wiz = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Guardar" }) });
    // Labels are <label class="fld-label"> with no htmlFor → scope by the .fld wrapper (testid candidates).
    const field = (label: string) => wiz.locator(`.fld:has(.fld-label:has-text("${label}"))`);
    await field("Nombre").locator("input.inp").fill(input.name);
    // Set the currency FIRST (default is the user's primary CRC) so the money prefix + live-price
    // comparison use USD; the payload reads it at submit regardless.
    await field("Moneda").locator("select.sel").selectOption(input.currency);
    await field("Monto invertido").locator(".inp-money input").fill(String(input.invested));
    await field("Símbolo").locator("input.inp").fill(input.symbol);
    // Fill the price EXPLICITLY (overrides any debounced live-price prefill → deterministic average_cost).
    await field("Precio de compra").locator(".inp-money input").fill(String(input.unitPrice));
    // registerExpense = ON (MANDATORY): the radio label whose text starts "La compré ahora…".
    await wiz.getByText("La compré ahora", { exact: false }).click();
    await wiz.getByRole("button", { name: "Guardar" }).click();
    // Wait for the SUCCESS toast — it fires only after addHoldingAction resolves ok (the holding is
    // persisted by then). NOT a dialog-hidden wait: the Save button flips to "Guardando…", so a
    // locator filtered by name "Guardar" would match nothing and a hidden-wait would pass vacuously
    // while the async save is still in flight (racing the DB read).
    await page.getByText("Posición agregada").waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });
  }
}
