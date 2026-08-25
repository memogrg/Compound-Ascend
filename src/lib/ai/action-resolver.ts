import "server-only";

/**
 * RESOLVEDOR DE ACCIONES PROPUESTAS.
 *
 * El modelo puede proponer "ajustá el sobre de Restaurantes a ₡150.000" o "abonale ₡100.000 a la
 * tarjeta", pero NO puede saber el uuid del sobre ni el de la deuda, y sus cifras son texto: si la
 * tarjeta de confirmación se armara con lo que dijo, un tap ejecutaría algo que el usuario no
 * revisó contra sus datos.
 *
 * Acá se reconstruye la propuesta contra la BD del usuario:
 *   - la ENTIDAD se resuelve por nombre/símbolo contra sus posiciones, deudas y sobres REALES, y
 *     de ahí sale el id — nunca del modelo,
 *   - los MONTOS de referencia (saldo de la deuda, presupuesto actual del sobre, aporte actual)
 *     se leen del motor y viajan a la tarjeta para que el usuario vea contra qué está decidiendo,
 *   - si la entidad no se resuelve, la acción se DESCARTA (la respuesta en texto queda igual).
 *     Mejor sin tarjeta que con una tarjeta que apunta a nada.
 *
 * Todo es LECTURA. La ejecución sigue viviendo en las server actions de cada dominio, detrás de la
 * confirmación explícita.
 */
import type { AIActionProposal } from "@/lib/ai/types";
import { logger } from "@/lib/logger";

/** Normaliza para comparar nombres: sin acentos, minúsculas, sin dobles espacios. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Busca la entidad cuyo nombre mejor coincide con `needle`. Exacta primero; si no, la que esté
 * contenida (en cualquier dirección) y sea más larga — "tarjeta" matchea "Tarjeta BAC" pero no se
 * queda con la primera que pase.
 */
function bestMatch<T>(needle: string, items: T[], nameOf: (t: T) => string): T | null {
  const n = norm(needle);
  if (!n) return null;
  const exact = items.find((i) => norm(nameOf(i)) === n);
  if (exact) return exact;
  const contains = items
    .filter((i) => {
      const name = norm(nameOf(i));
      return name.includes(n) || n.includes(name);
    })
    .sort((a, b) => norm(nameOf(b)).length - norm(nameOf(a)).length);
  return contains[0] ?? null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export type ResolveContext = {
  /** Moneda de captura (la principal del usuario). */
  currency: string;
  /** Hoy en la zona del perfil, YYYY-MM-DD. */
  today: string;
};

/**
 * Devuelve la propuesta con su payload RECONSTRUIDO, o null si no se pudo resolver contra datos
 * reales. Los tipos que ya existían (transacción, meta, alerta) pasan sin tocar: su camino no
 * cambia en este PR.
 */
export async function resolveActionProposal(
  action: AIActionProposal | null,
  ctx: ResolveContext,
): Promise<AIActionProposal | null> {
  if (!action) return null;
  try {
    switch (action.type) {
      case "set_dca":
        return await resolveSetDca(action, ctx);
      case "adjust_budget":
        return await resolveAdjustBudget(action, ctx);
      case "move_budget":
        return await resolveMoveBudget(action, ctx);
      case "debt_extra_payment":
        return await resolveDebtExtraPayment(action, ctx);
      default:
        return action;
    }
  } catch (err) {
    // Si la resolución falla, la respuesta en texto se conserva y solo se cae la tarjeta.
    logger.warn("resolveActionProposal falló", {
      type: action.type,
      message: err instanceof Error ? err.message : "?",
    });
    return null;
  }
}

/**
 * set_dca — fijar/ajustar el aporte mensual de una posición.
 * El holdingId sale de las posiciones REALES (por símbolo o por etiqueta); el aporte actual viaja
 * a la tarjeta para que se vea de cuánto a cuánto va el cambio.
 */
async function resolveSetDca(
  action: AIActionProposal,
  ctx: ResolveContext,
): Promise<AIActionProposal | null> {
  const p = action.payload;
  const monthly = num(p.monthlyContribution ?? p.amount);
  if (monthly === null) return null;

  const { listHoldings } = await import("@/modules/wealth/services/holdings-service");
  const holdings = await listHoldings();
  if (holdings.length === 0) return null;

  const needle = str(p.symbol) ?? str(p.label) ?? str(p.name);
  if (!needle) return null;
  const held =
    holdings.find((h) => h.symbol && norm(h.symbol) === norm(needle)) ??
    bestMatch(needle, holdings, (h) => h.label || h.symbol || "");
  if (!held) return null;

  return {
    type: "set_dca",
    payload: {
      holdingId: held.id,
      label: held.label || held.symbol || "tu inversión",
      monthlyContribution: monthly,
      // El actual sale del dato real, no de lo que el modelo crea recordar.
      currentContribution: held.monthlyContribution ?? 0,
      currency: held.currency || ctx.currency,
    },
    summary: action.summary,
  };
}

/**
 * adjust_budget — subir/bajar el presupuesto de un sobre en el periodo ACTUAL.
 * El categoryId sale de los sobres reales del usuario y el presupuesto vigente del motor.
 */
async function resolveAdjustBudget(
  action: AIActionProposal,
  ctx: ResolveContext,
): Promise<AIActionProposal | null> {
  const p = action.payload;
  const amount = num(p.amount ?? p.budget);
  if (amount === null) return null;

  const needle = str(p.categoryPath) ?? str(p.name) ?? str(p.category);
  if (!needle) return null;

  const { listSobresForKind, getBudgetTotals } = await import("@/modules/financial-base");
  const { userCurrentPeriod } = await import("@/lib/time/user-time");
  const sobres = await listSobresForKind("gasto");
  const pathOf = (s: { sobre: string; frasco: string | null }) =>
    s.frasco ? `${s.frasco} › ${s.sobre}` : s.sobre;
  // El nombre puede venir como "Vivir › Restaurantes" o solo "Restaurantes": se prueban los dos.
  const hoja = needle.includes("›") ? (needle.split("›").pop() ?? needle) : needle;
  const sobre = bestMatch(needle, sobres, pathOf) ?? bestMatch(hoja, sobres, (s) => s.sobre);
  if (!sobre) return null;

  const period = await userCurrentPeriod();
  const totals = await getBudgetTotals(period).catch(() => null);
  // La moneda del SOBRE, no la de visualización. Acá no era solo un problema de lectura: esta
  // moneda viaja a `setEnvelopeBudgetAction`, que la ESCRIBE en `budget_items.currency` — así
  // que ajustar desde el chat un sobre configurado en ₡, con la app en $, lo re-denominaba a
  // dólares en silencio y multiplicaba su presupuesto por la tasa.
  const nativo = totals?.nativeByKey?.[sobre.id];
  const currency = nativo && !nativo.mixed ? nativo.currency : (totals?.currency ?? ctx.currency);
  const actual =
    nativo && !nativo.mixed ? nativo.value : (totals?.expenseByKey?.[sobre.id]?.value ?? 0);
  // Proponer exactamente lo que ya tiene no es una acción, es ruido.
  if (Math.round(actual) === Math.round(amount)) return null;

  return {
    type: "adjust_budget",
    payload: {
      categoryId: sobre.id,
      name: sobre.sobre,
      path: pathOf(sobre),
      amount,
      currentAmount: actual,
      currency,
      periodMonth: period.month,
      periodYear: period.year,
    },
    summary: action.summary,
  };
}

/**
 * move_budget — mover presupuesto de un sobre a otro dentro del mes en curso.
 *
 * La salida "un tap" del aviso de ritmo, y también lo que el asesor propone cuando el usuario
 * pregunta "¿de dónde saco?". Se resuelve como UNA acción y no como dos `adjust_budget`
 * porque para el usuario es un solo hecho: confirmar dos tarjetas por separado permitiría
 * quedarse a mitad —recortando el donante sin acreditar al receptor—, que es peor que no
 * haber hecho nada.
 *
 * Los dos sobres y sus presupuestos vigentes salen de los datos REALES; el modelo solo aporta
 * los nombres y el monto, y el monto se topea a lo que el donante puede ceder. Proponer mover
 * plata que no existe sería una cifra imposible con cara de consejo.
 */
async function resolveMoveBudget(
  action: AIActionProposal,
  ctx: ResolveContext,
): Promise<AIActionProposal | null> {
  const p = action.payload;
  const pedido = num(p.amount ?? p.monto);
  if (pedido === null || pedido <= 0) return null;

  const desdeNeedle = str(p.from) ?? str(p.desde) ?? str(p.fromCategory);
  const hastaNeedle = str(p.to) ?? str(p.hasta) ?? str(p.toCategory);
  if (!desdeNeedle || !hastaNeedle) return null;

  const { listSobresForKind, getBudgetTotals } = await import("@/modules/financial-base");
  const { userCurrentPeriod } = await import("@/lib/time/user-time");
  const sobres = await listSobresForKind("gasto");
  const pathOf = (s: { sobre: string; frasco: string | null }) =>
    s.frasco ? `${s.frasco} › ${s.sobre}` : s.sobre;
  // El nombre puede venir como "Vivir › Restaurantes" o solo "Restaurantes": se prueban los dos.
  const hoja = (n: string) => (n.includes("›") ? (n.split("›").pop() ?? n) : n);
  const buscar = (n: string) =>
    bestMatch(n, sobres, pathOf) ?? bestMatch(hoja(n), sobres, (s) => s.sobre);

  const desde = buscar(desdeNeedle);
  const hasta = buscar(hastaNeedle);
  // Mover un sobre a sí mismo no es una operación: es un no-op con cara de consejo.
  if (!desde || !hasta || desde.id === hasta.id) return null;

  const period = await userCurrentPeriod();
  const totals = await getBudgetTotals(period).catch(() => null);
  // Los dos sobres en SU moneda (mismo motivo que en adjust_budget: esta cifra se escribe).
  const nativoDe = (id: string) => {
    const n = totals?.nativeByKey?.[id];
    return n && !n.mixed
      ? { value: n.value, currency: n.currency }
      : {
          value: totals?.expenseByKey?.[id]?.value ?? 0,
          currency: totals?.currency ?? ctx.currency,
        };
  };
  const desdeNativo = nativoDe(desde.id);
  const hastaNativo = nativoDe(hasta.id);
  // Mover entre sobres de MONEDAS DISTINTAS no es mover presupuesto: es una conversión con una
  // tasa adentro, y ni la tarjeta ni `moverPresupuestoEntreSobres` tienen dónde declararla. Se
  // cae la acción y queda el texto del consejo, que es lo honesto.
  if (desdeNativo.currency !== hastaNativo.currency) return null;
  const desdeActual = desdeNativo.value;
  const hastaActual = hastaNativo.value;

  // Topeado a lo que el donante tiene. Si no tiene nada, no hay acción que proponer.
  const monto = Math.min(pedido, desdeActual);
  if (monto <= 0) return null;

  return {
    type: "move_budget",
    payload: {
      desdeCategoryId: desde.id,
      desdeName: desde.sobre,
      desdePath: pathOf(desde),
      desdeActual,
      hastaCategoryId: hasta.id,
      hastaName: hasta.sobre,
      hastaPath: pathOf(hasta),
      hastaActual,
      amount: monto,
      currency: desdeNativo.currency,
      periodMonth: period.month,
      periodYear: period.year,
    },
    summary: action.summary,
  };
}

/**
 * debt_extra_payment — abono EXTRA a capital.
 * El debtId y el saldo salen de las deudas reales; el abono se topea al saldo (proponer abonar
 * más de lo que se debe sería una cifra imposible con cara de consejo).
 */
async function resolveDebtExtraPayment(
  action: AIActionProposal,
  ctx: ResolveContext,
): Promise<AIActionProposal | null> {
  const p = action.payload;
  const pedido = num(p.amount ?? p.extraAmount);
  if (pedido === null) return null;

  const { getCurrentDebtBalances } = await import("@/modules/control/services/debts-service");
  // Saldo VIVO, no el ancla de alta: una deuda saldada (≤0) no es candidata de abono, y el tope se
  // calcula sobre lo que REALMENTE se debe (P2 deuda-saldada).
  const debts = (await getCurrentDebtBalances()).filter((d) => d.currentBalance > 0);
  if (debts.length === 0) return null;

  const needle = str(p.name) ?? str(p.debtName);
  // Sin nombre, solo se resuelve si hay UNA deuda: con varias, adivinar cuál es inaceptable.
  const debt = needle
    ? bestMatch(needle, debts, (d) => d.name)
    : debts.length === 1
      ? debts[0]!
      : null;
  if (!debt) return null;

  const amount = Math.min(pedido, debt.currentBalance);
  return {
    type: "debt_extra_payment",
    payload: {
      debtId: debt.id,
      name: debt.name,
      amount,
      balance: debt.currentBalance,
      apr: debt.apr ?? null,
      currency: debt.currency || ctx.currency,
      paymentDate: ctx.today,
    },
    summary: action.summary,
  };
}
