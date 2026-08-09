import "server-only";

/**
 * Restante de un SOBRE (categoría hoja) para el mes de una transacción, en la moneda de
 * VISUALIZACIÓN. Reusa getBudgetTotals/getRealTotals (mismos totales por category_id que el tab
 * de Gastos) — NO recalcula a mano. Pensado para el mensaje de éxito del chat tras registrar un
 * gasto: como getRealTotals lee fresco, el restante YA descuenta la transacción recién creada.
 */
import { getBudgetTotals } from "@/modules/financial-base/services/budget-service";
import { getRealTotals } from "@/modules/financial-base/services/transaction-service";
import { listCategories } from "@/modules/financial-base/services/categories-service";
import type { SobreRemaining } from "@/modules/financial-base/engine/sobre-remaining-copy";
import { monthPeriod } from "@/modules/financial-base/engine/period";

// El TIPO vive en el engine puro (sobre-remaining-copy.ts), junto al copy que lo consume:
// este archivo es `server-only` y los componentes cliente de web y móvil necesitan la forma.
// Antes se redeclaraba a mano en assistant-conversation.tsx — dos definiciones de lo mismo.
export type { SobreRemaining } from "@/modules/financial-base/engine/sobre-remaining-copy";

/**
 * `occurredOn` es "YYYY-MM-DD"; el periodo es el MES de esa fecha (así el gasto recién creado
 * cae dentro y su presupuesto es el correcto). Devuelve null si la fecha o el sobre no son
 * válidos (el llamador degrada a un mensaje genérico, sin inventar cifras).
 */
export async function getSobreRemaining(
  categoryId: string,
  occurredOn: string,
): Promise<SobreRemaining | null> {
  const [y, m] = occurredOn.split("-").map(Number);
  if (!y || !m) return null;
  const period = monthPeriod(y, m);
  try {
    const [budget, real, cats] = await Promise.all([
      getBudgetTotals(period),
      getRealTotals(period),
      listCategories(),
    ]);
    const leaf = cats.find((c) => c.id === categoryId);
    if (!leaf) return null;
    const frasco = leaf.parentId ? (cats.find((c) => c.id === leaf.parentId)?.name ?? null) : null;
    const path = frasco ? `${frasco} › ${leaf.name}` : leaf.name;

    const b = budget.expenseByKey[categoryId];
    const spent = real.expenseByKey[categoryId]?.value ?? 0;
    if (!b)
      return { path, currency: real.currency, budget: 0, spent, remaining: 0, hasBudget: false };
    return {
      path,
      currency: real.currency,
      budget: b.value,
      spent,
      remaining: b.value - spent,
      hasBudget: true,
    };
  } catch {
    return null;
  }
}
