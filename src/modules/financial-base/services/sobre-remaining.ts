import "server-only";

/**
 * Restante de un SOBRE (categoría hoja) para el mes de una transacción, en la moneda en que el
 * sobre fue CONFIGURADO — no en la de visualización.
 *
 * POR QUÉ. Antes devolvía `currency: real.currency` con `budget` y `spent` ya convertidos: un
 * sobre presupuestado en ₡445.000 se leía "te quedan $345 de $445". Cifras correctas como
 * conversión, pero el usuario nunca escribió ese "445" en dólares — no puede verificarlo y
 * contradice lo que él mismo configuró. La regla general de la app: lo CONFIGURADO o REGISTRADO
 * se muestra en su moneda; solo los AGREGADOS cross-moneda se convierten, y se etiquetan.
 *
 * Reusa getBudgetTotals/getRealTotals (mismos totales por category_id que el tab de Gastos) — NO
 * recalcula a mano. Del presupuesto toma `nativeByKey` (sin convertir) y del real toma
 * `expenseTxns` (cada gasto con SU monto y SU moneda), así el descuento se hace convirtiendo
 * cada gasto a la moneda del sobre en vez de rebotar contra la de visualización.
 *
 * Pensado para el mensaje de éxito del chat tras registrar un gasto: como getRealTotals lee
 * fresco, el restante YA descuenta la transacción recién creada.
 */
import { getBudgetTotals } from "@/modules/financial-base/services/budget-service";
import { getRealTotals } from "@/modules/financial-base/services/transaction-service";
import { listCategories } from "@/modules/financial-base/services/categories-service";
import { montosDelSobre } from "@/modules/financial-base/engine/sobre-moneda";
import type { SobreRemaining } from "@/modules/financial-base/engine/sobre-remaining-copy";
import { monthPeriod } from "@/modules/financial-base/engine/period";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { convertCurrency } from "@/lib/fx";

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
    // Las tasas son best-effort: sin ellas `convertCurrency` no puede traducir un gasto en otra
    // moneda, y es mejor eso que no devolver el restante. El caso normal —todo en la moneda del
    // sobre— no las toca siquiera.
    const [budget, real, cats, rates] = await Promise.all([
      getBudgetTotals(period),
      getRealTotals(period),
      listCategories(),
      getFxRates().catch(() => ({}) as Record<string, number>),
    ]);
    const leaf = cats.find((c) => c.id === categoryId);
    if (!leaf) return null;
    const frasco = leaf.parentId ? (cats.find((c) => c.id === leaf.parentId)?.name ?? null) : null;
    const path = frasco ? `${frasco} › ${leaf.name}` : leaf.name;

    const nativo = budget.nativeByKey?.[categoryId];
    const montos = montosDelSobre({
      categoryId,
      nativo,
      budgetEnVisualizacion: budget.expenseByKey[categoryId]?.value ?? 0,
      displayCurrency: real.currency,
      // `expenseTxns` trae CADA gasto con su monto y su moneda nativos: es lo que permite
      // convertir a la moneda del sobre en vez de rebotar contra la de visualización (que
      // metería dos redondeos y una tasa de más).
      gastos: real.expenseTxns ?? [],
      convert: (amount, from, to) => convertCurrency(amount, from, to, rates),
    });

    const hasBudget = !!budget.expenseByKey[categoryId];
    return {
      path,
      currency: montos.currency,
      budget: hasBudget ? montos.budget : 0,
      spent: montos.spent,
      remaining: hasBudget ? montos.budget - montos.spent : 0,
      hasBudget,
      convertidasDesde: montos.convertidasDesde,
      presupuestoMixto: montos.presupuestoMixto,
    };
  } catch {
    return null;
  }
}
