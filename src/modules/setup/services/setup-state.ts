import "server-only";

import { cache } from "react";

import {
  getBudgetTotals,
  getPrimaryCurrency,
  listCategoryTree,
  monthPeriod,
} from "@/modules/financial-base";
import { listDebts, listGoals } from "@/modules/control";
import {
  getDefenseFundsReport,
  getDesiredMonthlyLifestyle,
  listHoldings,
  listPolicies,
} from "@/modules/wealth";
import { deriveSetupProgress } from "@/modules/setup/engine/progress";
import type {
  SetupHolding,
  SetupSnapshot,
  SetupSobre,
  SetupWizardProgress,
} from "@/modules/setup/types";

/**
 * Lectura del estado REAL para los asistentes de configuración.
 *
 * ── SIN ESTADO PARALELO ─────────────────────────────────────────────────────
 * Este archivo SOLO LEE, y lo hace por los mismos servicios que alimentan las
 * pantallas: `getBudgetTotals` (lo mismo que /ingresos y /gastos),
 * `listCategoryTree` (los sobres del tab de Gastos), `listDebts`/`listGoals`
 * (Control), `getDefenseFundsReport` (Defensa) y `listHoldings` (Patrimonio).
 * No hay tabla `setup_*` ni bandera de progreso: el progreso se calcula de
 * estos datos en `engine/progress.ts`. Por eso el cambio no lleva migración.
 *
 * Las ESCRITURAS no pasan por acá: cada paso del asistente llama al mismo
 * Server Action que el modal correspondiente de la app.
 */

/** Fecha del periodo en curso; el asistente configura el mes actual. */
function currentPeriod() {
  const now = new Date();
  return monthPeriod(now.getFullYear(), now.getMonth() + 1);
}

async function _getSetupSnapshot(): Promise<SetupSnapshot> {
  const period = currentPeriod();

  // Todo best-effort e independiente: que Patrimonio falle no debe dejar sin
  // asistente al Presupuesto. Un módulo caído se lee como "sin datos", que es
  // exactamente lo que el progreso derivado debe reportar.
  const [currency, budget, tree, debts, goals, defense, policies, holdings, lifestyle] =
    await Promise.all([
      getPrimaryCurrency().catch(() => "CRC"),
      getBudgetTotals(period).catch(() => null),
      listCategoryTree("expense").catch(() => []),
      listDebts().catch(() => []),
      listGoals().catch(() => []),
      getDefenseFundsReport().catch(() => null),
      listPolicies().catch(() => []),
      listHoldings().catch(() => []),
      getDesiredMonthlyLifestyle().catch(() => null),
    ]);

  const items = budget?.items ?? [];
  const incomeItems = items.filter((i) => i.type === "income");
  const expenseItems = items.filter((i) => i.type === "expense");

  // Presupuesto por categoría, en la moneda de configuración de cada línea.
  const byCategory = new Map<string, { amount: number; currency: string; locked: boolean }>();
  for (const it of expenseItems) {
    if (!it.categoryId) continue;
    const prev = byCategory.get(it.categoryId);
    // `source_kind` distinto de 'manual' = línea derivada de una entidad: el
    // asistente la muestra, pero se edita en su módulo (igual que en /gastos).
    const locked = Boolean(it.sourceKind && it.sourceKind !== "manual");
    byCategory.set(it.categoryId, {
      amount: (prev?.amount ?? 0) + it.amount,
      currency: prev?.currency ?? it.currency,
      locked: (prev?.locked ?? false) || locked,
    });
  }

  const jars = tree.map((g) => ({ id: g.id, name: g.name, key: g.key }));
  const sobres: SetupSobre[] = [];
  for (const jar of tree) {
    for (const leaf of jar.children) {
      const b = byCategory.get(leaf.id);
      sobres.push({
        id: leaf.id,
        name: leaf.name,
        jarId: jar.id,
        jarName: jar.name,
        jarKey: jar.key,
        isSystem: leaf.isSystem,
        isFavorite: leaf.isFavorite,
        isEssential: leaf.isEssential,
        icon: leaf.icon,
        color: leaf.color,
        budget: b?.amount ?? null,
        budgetCurrency: b?.currency ?? null,
        locked: b?.locked ?? false,
      });
    }
  }

  const em = defense?.emergency ?? null;
  const pz = defense?.peace ?? null;
  // El objetivo del fondo de paz ES `meses × gasto esencial` (computeDefenseFunds),
  // así que el esencial se despeja de ahí en vez de repetir la consulta.
  const essentialMonthly = pz && pz.months > 0 ? pz.target / pz.months : 0;

  return {
    currency,
    period: { year: period.year, month: period.month },

    incomes: incomeItems.map((i) => ({
      id: i.id,
      name: i.name,
      amount: i.amount,
      // El presupuesto del mes ya está mensualizado por definición: una línea
      // del periodo es lo que entra ESE mes.
      amountMonthly: i.amount,
      currency: i.currency,
      incomeType: i.incomeType ?? "activo",
      frequency: i.frequency,
      recurrent: Boolean(i.recurringItemId),
    })),
    incomeMonthly: budget?.budgetIncome ?? 0,
    jars,
    sobres,
    budgetedMonthly: budget?.budgetExpense ?? 0,

    debts: debts.map((d) => ({
      id: d.id,
      name: d.name,
      balance: d.balance,
      minPayment: d.minPayment,
      apr: d.apr ?? null,
      currency: d.currency,
    })),
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind ?? "meta",
      goalType: g.goalType ?? null,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      monthlyContribution: g.monthlyContribution,
      recurrence: g.recurrence ?? "ninguna",
      currency: g.currency,
    })),

    emergency: em ? { ...em, registered: Boolean(defense?.emergencyRegistered) } : null,
    peace: pz
      ? {
          ...pz,
          registered: Boolean(defense?.peaceRegistered),
        }
      : null,
    essentialMonthly,
    policies: policies.map((p) => ({
      id: p.id,
      policyType: p.policyType,
      provider: p.provider ?? null,
      coverage: p.coverage ?? null,
      premium: p.premium ?? null,
      currency: p.currency,
    })),

    holdings: holdings.map((h): SetupHolding => ({
      id: h.id,
      label: h.label ?? h.symbol,
      symbol: h.symbol,
      assetType: h.assetType,
      quantity: h.quantity,
      averageCost: h.averageCost,
      currency: h.currency,
      monthlyContribution: h.monthlyContribution ?? 0,
      isRecurring: Boolean(h.isRecurring),
    })),
    desiredLifestyle: lifestyle ? { amount: lifestyle.amount, currency: lifestyle.currency } : null,
  };
}

/**
 * Dedup por request: el hub del panel y la página del asistente pueden pedirla
 * en el mismo render.
 */
export const getSetupSnapshot = cache(_getSetupSnapshot);

/** Progreso de los cuatro asistentes, derivado del estado real. */
export async function getSetupProgress(): Promise<SetupWizardProgress[]> {
  return deriveSetupProgress(await getSetupSnapshot());
}
