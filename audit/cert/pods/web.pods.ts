/**
 * Web-desktop implementation of Journey. Every selector for the web surface lives here.
 * Preference order per the founder's guidance: getByRole / getByLabel first; text/CSS
 * only where the DOM offers no accessible handle — each such case is a data-testid
 * candidate (see TESTID-CANDIDATES.md).
 */
import { expect, type Page } from "@playwright/test";
import type { Journey, MoneyInput } from "./journey";
import { isVisibleSoon, VISIBLE_TIMEOUT } from "./util";

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
}
