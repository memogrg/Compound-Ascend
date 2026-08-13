/**
 * Behavioral engine. `decideDayEvents` maps a persona's traits + current state to
 * a deterministic list of REAL app events for one virtual day (executed by the
 * runner via the app-driver under withSimClock). Determinism: one seeded Prng per
 * persona, advanced in a fixed evaluation order across the run — same seed ⇒ same
 * event stream. Amounts are rounded to whole currency units; the runner folds the
 * exact injected amounts into the expectations, so invariants stay exact.
 */
import type { Prng } from "../prng";
import type { PersonaSpec, PlannedEvent, SimState } from "./persona-types";

// Day offsets (within the month) relative to payday for the routine events.
const FIXED_EXPENSE_OFFSET = 1;
const GOAL_OFFSET = 1;
const DEBT_OFFSET = 2;
const INVEST_OFFSET = 3;
/** Fixed late-month day on which disciplined savers make a planned jar purchase. */
const JAR_SPEND_DAY = 20;

const round = (n: number): number => Math.round(n);

export function decideDayEvents(
  persona: PersonaSpec,
  state: SimState,
  _monthIndex: number,
  dayInMonth: number,
  rng: Prng,
): PlannedEvent[] {
  const events: PlannedEvent[] = [];
  const t = persona.traits;
  const s = persona.setup;

  // 1. Income on payday (scaled by any life-event multiplier; jittered if irregular).
  if (dayInMonth === s.payDay) {
    let amount = s.monthlyIncome * state.incomeMultiplier;
    if (!s.incomeRegular) amount *= 0.6 + rng.next() * 0.7; // 0.6–1.3× nominal
    const rounded = round(amount);
    if (rounded > 0) events.push({ kind: "income", amount: rounded });
  }

  // 2. Fixed expense (rent) the day after payday.
  if (dayInMonth === s.payDay + FIXED_EXPENSE_OFFSET && s.fixedExpenseMonthly > 0) {
    events.push({ kind: "expense", amount: round(s.fixedExpenseMonthly), label: "Renta", fixed: true });
  }

  // 3. Discretionary spend — frequency & size ∝ impulsivity (drawn every day).
  if (rng.next() < t.spendImpulsivity * 0.5) {
    const base = s.monthlyIncome * 0.05;
    const amount = round(base * (0.4 + rng.next() * 1.2) * (0.5 + t.spendImpulsivity));
    if (amount > 0) events.push({ kind: "expense", amount, label: "Gasto discrecional", fixed: false });
  }

  // 4. Goal contribution after payday — ∝ saving × compliance, if liquidity covers it.
  if (state.ids.goalId && dayInMonth === s.payDay + GOAL_OFFSET) {
    if (rng.next() < t.savingTendency * t.budgetCompliance + 0.1) {
      const amount = round(s.monthlyIncome * 0.15 * t.savingTendency);
      if (amount > 0 && amount <= state.liquidity) events.push({ kind: "goalContribution", amount });
    }
  }

  // 5. Debt payment — the minimum, plus extra only if disciplined (sobreendeudado
  //    pays just the minimum).
  if (state.ids.debtId && dayInMonth === s.payDay + DEBT_OFFSET && s.debtMinPayment > 0) {
    const extra = t.budgetCompliance > 0.6 ? round(s.debtMinPayment * t.budgetCompliance) : 0;
    const amount = s.debtMinPayment + extra;
    if (amount > 0) events.push({ kind: "debtPayment", amount });
  }

  // 6. Investment buy — only for low risk-aversion investors, if liquidity covers it.
  if (state.ids.holdingId && dayInMonth === s.payDay + INVEST_OFFSET && t.riskAversion < 0.5) {
    if (rng.next() < (1 - t.riskAversion) * t.savingTendency) {
      const amount = round(s.monthlyIncome * 0.1 * (1 - t.riskAversion));
      if (amount > 0 && amount <= state.liquidity) events.push({ kind: "investmentBuy", amount });
    }
  }

  // 7. Planned jar purchase — disciplined savers spend part of the goal (off-budget)
  //    once, late in the month. Deterministic so the "no double count" invariant is
  //    exercised whenever the goal has a balance.
  if (state.ids.goalId && dayInMonth === JAR_SPEND_DAY && t.savingTendency > 0.5 && state.goalCurrent > 0) {
    const amount = round(Math.min(state.goalCurrent * 0.4, state.goalCurrent));
    if (amount > 0) events.push({ kind: "goalSpend", amount });
  }

  // 8. Emergency — probability ∝ sensitivity (drawn every day). Composed: a big
  //    unexpected expense, plus a withdrawal from savings to cover part of it.
  if (rng.next() < t.emergencySensitivity * 0.03) {
    const big = round(s.fixedExpenseMonthly * (0.8 + rng.next() * 1.2));
    if (big > 0) events.push({ kind: "expense", amount: big, label: "Emergencia", fixed: true });
    if (state.ids.goalId && state.goalCurrent > 0 && big > 0) {
      const cover = round(Math.min(big, state.goalCurrent));
      if (cover > 0) events.push({ kind: "goalWithdraw", amount: cover });
    }
  }

  // 9. Life event (job change) — rare; no dedicated app action, scales future
  //    income via the multiplier the runner applies to state.
  if (rng.next() < 0.01) {
    const factor = rng.next() < 0.5 ? 0.85 : 1.2;
    events.push({
      kind: "lifeEvent",
      incomeMultiplier: factor,
      label: factor < 1 ? "Recorte de ingreso" : "Aumento de ingreso",
    });
  }

  return events;
}
