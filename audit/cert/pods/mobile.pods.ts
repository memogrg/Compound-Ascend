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
    // Fresh user → 0 sources → the FAB opens "Alta" directly with this label.
    await page.getByRole("button", { name: "Nueva fuente de ingreso" }).click();
    const sheet = page.getByRole("dialog", { name: "Registrar ingreso" });
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
    // FAB → choice sheet → "Registrar un gasto" → the AddSpend sheet.
    await page.getByRole("button", { name: "Registrar gasto o crear sobre" }).click();
    await page
      .getByRole("dialog", { name: "Gastos" })
      .getByRole("button", { name: /Registrar un gasto/ })
      .click();
    const sheet = page.getByRole("dialog", { name: "Registrar gasto" });
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
