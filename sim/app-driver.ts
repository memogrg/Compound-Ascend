/**
 * App driver: thin, typed wrappers over the REAL ctx-aware services — no
 * shortcuts, no direct table writes for money events. Setup and events go
 * through the exact functions the app uses in production, with the simulation's
 * `AuthContext` injected. The only direct `ctx.db` reads here are id read-backs
 * for the void-returning setup writes (`createBudgetItem`, `createDebt`), which
 * the services don't return.
 *
 * All amounts are in the run's single currency, so `convertCurrency` is identity
 * everywhere downstream and invariants are exact.
 */
import type { AuthContext } from "@/lib/auth/auth-context";
import type { Period } from "@/modules/financial-base/types";
import { setOpeningBalance } from "@/modules/financial-base/services/liquidity-service";
import { createIncome, createExpense } from "@/modules/financial-base/services/base-service";
import { createBudgetItem, receivePartialIncome } from "@/modules/financial-base/services/budget-service";
import { createTransaction } from "@/modules/financial-base/services/transaction-service";
import {
  createDebt,
  createGoal,
  addDebtPayment,
  addGoalContribution,
  spendFromGoal,
  withdrawFromGoal,
} from "@/modules/control/services/control-service";
import { createHolding, contributeToHolding } from "@/modules/wealth/services/holdings-service";
import type { EventLog } from "./event-log";

export class AppDriver {
  /** Set by the runner before each phase so log lines carry the virtual day. */
  day = 0;

  constructor(
    private readonly ctx: AuthContext,
    private readonly currency: string,
    private readonly log: EventLog,
  ) {}

  // ---- SETUP writes ----

  async openingBalance(amount: number): Promise<void> {
    await setOpeningBalance(amount, this.ctx);
    this.log.record("setup", "saldo inicial (apertura)", this.day, { amount, currency: this.currency });
  }

  async addIncomeSource(name: string, amountMonthly: number): Promise<void> {
    await createIncome(
      {
        name,
        incomeType: "activo",
        amount: amountMonthly,
        currency: this.currency,
        frequency: "mensual",
        isFixed: true,
        ownerScope: "usuario",
        includeInBudget: true,
      },
      this.ctx,
    );
    this.log.record("setup", `fuente de ingreso "${name}"`, this.day, { amountMonthly });
  }

  async addExpenseItem(name: string, amountMonthly: number): Promise<void> {
    await createExpense(
      {
        name,
        nature: "esencial",
        amount: amountMonthly,
        currency: this.currency,
        frequency: "mensual",
        isFixed: true,
        ownerScope: "usuario",
      },
      this.ctx,
    );
    this.log.record("setup", `ítem de gasto "${name}"`, this.day, { amountMonthly });
  }

  /** Creates an income budget line and reads its id back (the write returns void). */
  async addIncomeBudgetLine(name: string, amount: number, period: Period): Promise<string> {
    await createBudgetItem(
      {
        type: "income",
        name,
        amount,
        currency: this.currency,
        frequency: "mensual",
        periodMonth: period.month,
        periodYear: period.year,
        incomeType: "activo",
      },
      this.ctx,
    );
    const { data, error } = await this.ctx.db
      .from("budget_items")
      .select("id")
      .eq("user_id", this.ctx.userId)
      .eq("type", "income")
      .eq("name", name)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) throw new Error(`no encontré la línea de ingreso "${name}": ${error?.message ?? "sin fila"}`);
    this.log.record("setup", `línea de presupuesto (ingreso) "${name}"`, this.day, { amount, id: data.id });
    return data.id;
  }

  async addExpenseBudgetLine(name: string, amount: number, period: Period): Promise<void> {
    await createBudgetItem(
      {
        type: "expense",
        name,
        amount,
        currency: this.currency,
        frequency: "mensual",
        periodMonth: period.month,
        periodYear: period.year,
      },
      this.ctx,
    );
    this.log.record("setup", `línea de presupuesto (gasto) "${name}"`, this.day, { amount });
  }

  /** Creates a debt (write returns void) and reads its id back. */
  async addDebt(name: string, balance: number, minPayment: number): Promise<string> {
    await createDebt(
      {
        name,
        balance,
        minPayment,
        currentPayment: minPayment,
        // apr 0: a payment reduces the balance by its full amount (no interest),
        // keeping the debt side of the net-worth identity deterministic.
        apr: 0,
        currency: this.currency,
      },
      this.ctx,
    );
    const { data, error } = await this.ctx.db
      .from("debts")
      .select("id")
      .eq("user_id", this.ctx.userId)
      .eq("name", name)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) throw new Error(`no encontré la deuda "${name}": ${error?.message ?? "sin fila"}`);
    this.log.record("setup", `deuda "${name}"`, this.day, { balance, minPayment, id: data.id });
    return data.id;
  }

  /** Creates a savings goal (returns its id). */
  async addGoal(name: string, target: number): Promise<string> {
    const id = await createGoal(
      {
        name,
        kind: "meta",
        targetAmount: target,
        currentAmount: 0,
        monthlyContribution: 0,
        currency: this.currency,
        recurrence: "ninguna",
      },
      this.ctx,
    );
    this.log.record("setup", `meta "${name}"`, this.day, { target, id });
    return id;
  }

  /** Creates a NON-quoted holding (certificado): valued at its manual value, no
   *  live price fetch, no linked purchase txn (registerExpense off). Reads the id
   *  back (the write returns void) so the motor can contribute to it later. */
  async addHolding(label: string, value: number): Promise<string> {
    await createHolding(
      {
        assetType: "certificado",
        label,
        quantity: 1,
        averageCost: value,
        currentValueManual: value,
        currency: this.currency,
        registerExpense: false,
      },
      this.ctx,
    );
    const { data, error } = await this.ctx.db
      .from("investment_holdings")
      .select("id")
      .eq("user_id", this.ctx.userId)
      .eq("label", label)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) throw new Error(`no encontré la inversión "${label}": ${error?.message ?? "sin fila"}`);
    this.log.record("setup", `inversión no cotizada "${label}"`, this.day, { value, id: data.id });
    return data.id;
  }

  /** Creates a QUOTED, RECURRING holding (etf) for the DCA case: is_recurring +
   *  monthly_contribution make `ensureMonthlyContributions` pick it up. Its market
   *  value uses the live price (mocked via priceCache in the DCA runner), so keep
   *  the price seeded. `registerExpense` off → the initial position is a starting
   *  asset (no cash event). Reads the id back. */
  async addRecurringQuotedHolding(
    label: string,
    symbol: string,
    quantity: number,
    unitCost: number,
    monthlyContribution: number,
  ): Promise<string> {
    await createHolding(
      {
        assetType: "etf",
        label,
        symbol,
        quantity,
        averageCost: unitCost,
        currency: this.currency,
        isRecurring: true,
        monthlyContribution,
        registerExpense: false,
      },
      this.ctx,
    );
    const { data, error } = await this.ctx.db
      .from("investment_holdings")
      .select("id")
      .eq("user_id", this.ctx.userId)
      .eq("label", label)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) throw new Error(`no encontré el holding DCA "${label}": ${error?.message ?? "sin fila"}`);
    this.log.record("setup", `holding cotizado recurrente "${label}" (${symbol})`, this.day, {
      quantity,
      monthlyContribution,
      id: data.id,
    });
    return data.id;
  }

  // ---- EVENTS ----

  async receiveIncome(budgetItemId: string, amount: number, dateISO: string): Promise<void> {
    await receivePartialIncome({ budgetItemId, amount, date: dateISO }, this.ctx);
    this.log.record("event", "ingreso recibido (receivePartialIncome)", this.day, { amount, dateISO });
  }

  async spend(amount: number, dateISO: string, label = "Gasto"): Promise<void> {
    await createTransaction(
      {
        kind: "gasto",
        amount,
        currency: this.currency,
        occurredOn: dateISO,
        status: "confirmed",
        origin: "manual",
        merchantOrSource: label,
      },
      this.ctx,
    );
    this.log.record("event", `gasto · ${label} (createTransaction)`, this.day, { amount, dateISO });
  }

  async payDebt(debtId: string, amount: number, dateISO: string): Promise<void> {
    await addDebtPayment(
      {
        debtId,
        paymentDate: dateISO,
        amount,
        extraAmount: 0,
        kind: "ordinario",
        currency: this.currency,
      },
      this.ctx,
    );
    this.log.record("event", "pago de deuda (addDebtPayment)", this.day, { amount, dateISO });
  }

  async contributeGoal(goalId: string, amount: number, dateISO: string): Promise<void> {
    await addGoalContribution(
      { goalId, amount, contributionDate: dateISO, currency: this.currency },
      this.ctx,
    );
    this.log.record("event", "aporte a meta (addGoalContribution)", this.day, { amount, dateISO });
  }

  async spendGoal(goalId: string, amount: number, dateISO: string): Promise<void> {
    await spendFromGoal(
      { goalId, amount, spendDate: dateISO, categoryId: null, note: "Consumo del frasco" },
      this.ctx,
    );
    this.log.record("event", "consumo de frasco (spendFromGoal)", this.day, { amount, dateISO });
  }

  /** Withdraw from a goal back to liquidity (ingreso linked goal = capital_in). */
  async withdrawGoal(goalId: string, amount: number, dateISO: string): Promise<void> {
    await withdrawFromGoal(
      { goalId, amount, withdrawalDate: dateISO, note: "Retiro para emergencia" },
      this.ctx,
    );
    this.log.record("event", "retiro de meta (withdrawFromGoal)", this.day, { amount, dateISO });
  }

  /** Contribute to an EXISTING non-quoted holding (no unitPrice → manual value
   *  rises by the amount; capital_out expense to liquidity). */
  async contributeInvestment(holdingId: string, amount: number, dateISO: string): Promise<void> {
    await contributeToHolding(
      { holdingId, amount, currency: this.currency, occurredOn: dateISO },
      this.ctx,
    );
    this.log.record("event", "aporte a inversión (contributeToHolding)", this.day, { amount, dateISO });
  }
}
