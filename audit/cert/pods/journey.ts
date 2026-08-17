/**
 * The surface-agnostic journey contract. One spec is written against this interface;
 * each Playwright project injects the WebJourney or MobileJourney implementation (see
 * fixtures.ts). ALL selectors live inside the two implementations — one place per
 * element — so swapping a text/role selector for a data-testid later is a one-line edit
 * (see audit/cert/TESTID-CANDIDATES.md).
 */
export interface MoneyInput {
  /** Name/merchant typed into the form and later matched in the DB. */
  name: string;
  amount: number;
  currency: string;
}

export interface Journey {
  readonly surface: "web" | "mobile";
  /** Land on the home surface (web /dashboard · mobile /m). */
  gotoHome(): Promise<void>;
  /** Create an income SOURCE (persists to budget_items). */
  createIncome(input: MoneyInput): Promise<void>;
  /** Create an expense (persists to transactions, kind gasto). */
  createExpense(input: MoneyInput): Promise<void>;
  /** After a fresh reload: is the created income source visible in the list? */
  incomeVisible(name: string): Promise<boolean>;
  /** After a fresh reload: is the created expense visible in the movements list? */
  expenseVisible(name: string): Promise<boolean>;
  /**
   * SECONDARY / informative only: the derived "Flujo del mes" figure if legible, else
   * null. Fase 0 flagged this number as ambiguous, so it is NEVER a hard gate here —
   * number-vs-oracle validation is Fase 4/5.
   */
  readMonthFlow(): Promise<string | null>;
}
