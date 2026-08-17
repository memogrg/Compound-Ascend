/**
 * Mobile implementation of Journey against the DEDICATED /m shell (NOT the web routes
 * under a small viewport). Runs under Playwright device emulation. The mobile Form Kit
 * uses BottomSheets (role=dialog, aria-label=title) and .m-qfield wrappers whose labels
 * are DIVs (not <label htmlFor>), so fields are reached by placeholder or by scoping to
 * the .m-qlabel text — every such case is a data-testid candidate (TESTID-CANDIDATES.md).
 */
import { type Page } from "@playwright/test";
import type { Journey, MoneyInput } from "./journey";
import { isVisibleSoon, VISIBLE_TIMEOUT } from "./util";

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
}
