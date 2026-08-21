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

/** Data the onboarding wizard captures that we set + assert (DNA, not money amounts). */
export interface OnboardingInput {
  /** Plain text input in step 1 → persists to profiles.display_name. */
  displayName: string;
  /**
   * Nucleus OptionCard to click in step 1 (its label) → personal_profiles.financial_nucleus.
   * A robust, clickable card (getByRole button) — the DNA datum that proves the wizard
   * captured a behavioral choice, not just the free-text name. (The goal step is RankedChips
   * and the wizard's finish only writes goal NAMES, no target_amount — left out as fragile.)
   */
  nucleusLabel: string;
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

  // ── Cluster 1 · Onboarding (journey #1) ─────────────────────────────────────
  /** After a fresh (not-onboarded) login: did the app's gate land us on the wizard? */
  onboardingGateReached(): Promise<boolean>;
  /** Drive the DNA wizard to completion (start guided → set displayName → finish). */
  completeOnboarding(input: OnboardingInput): Promise<void>;
  /** Home renders usable content and does NOT bounce back to the onboarding wizard. */
  dashboardRenders(): Promise<boolean>;

  // ── Cluster 1 · Money loop (journey #2) ─────────────────────────────────────
  /** After creating an expense: does its jar/frasco show the consumption (amount reflected)? */
  expenseReflectedInJar(amount: number): Promise<boolean>;

  // ── Cluster 2 · Debt payment (journey #3) ───────────────────────────────────
  /**
   * Register a payment on a debt through the UI. The currency is the debt's own (the form
   * preloads it) — we NEVER change it (the service rejects a cross-currency payment, the #437
   * guard). `amount` is in the debt's native currency.
   */
  payDebt(debt: { id: string; name: string }, input: { amount: number }): Promise<void>;
}
