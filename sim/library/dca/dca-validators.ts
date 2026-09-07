/**
 * DCA-specific validators (F3a-DCA). Verify the auto-registration of the monthly
 * recurring contribution against the app's OWN writes: holding_contributions (the
 * auto-DCA history), the investment_holdings merge, the linked expense txn, and the
 * portfolio_snapshots + inversiones vs-mes. Reads use ctx.db (harness plumbing) or
 * getHomeCardsData (the app read).
 *
 * #6 asserts the DCA purchase history (issue #655): every automatic contribution leaves
 * its own `compra` in investment_transactions, on top of the initial purchase — that is
 * what makes recurring contributions visible in "mis compras" (UI + AI).
 */
import type { AuthContext } from "@/lib/auth/auth-context";
import { getHomeCardsData } from "@/modules/dashboard/services/home-cards-service";
import type { EventLog } from "../../event-log";

const round2 = (n: number): number => Math.round(n * 100) / 100;
const approx = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps;

function push(log: EventLog, name: string, ok: boolean, detail: string): void {
  log.check({ name, ok, detail });
}

/** #1 — exactly one settled contribution per month (unit_price + txn, not 'pendiente'). */
export async function validateDcaContributions(
  ctx: AuthContext,
  holdingId: string,
  expectedCount: number,
  mockPrice: number,
  log: EventLog,
): Promise<void> {
  const { data } = await ctx.db
    .from("holding_contributions")
    .select("period_year, period_month, unit_price, transaction_id, status")
    .eq("user_id", ctx.userId)
    .eq("holding_id", holdingId);
  const rows = data ?? [];
  const periods = new Set(rows.map((r) => `${r.period_year}-${r.period_month}`));
  const settled = rows.filter(
    (r) => r.unit_price !== null && r.transaction_id !== null && r.status !== "pendiente",
  );
  push(
    log,
    "dca · 1 contribución por mes (settled, no congelada)",
    rows.length === expectedCount && periods.size === expectedCount && settled.length === expectedCount,
    `filas=${rows.length} periodos=${periods.size} settled=${settled.length} esperado=${expectedCount}`,
  );
  const priceOk = rows.every((r) => r.unit_price !== null && approx(Number(r.unit_price), mockPrice, 0.01));
  push(log, "dca · unit_price == precio mockeado en cada aporte", priceOk, `precioMock=${mockPrice}`);
}

/** #2 — deterministic merge: accumulated quantity = initial + Σ(aporte / precio). */
export async function validateDcaMerge(
  ctx: AuthContext,
  holdingId: string,
  expectedQuantity: number,
  log: EventLog,
): Promise<void> {
  const { data } = await ctx.db
    .from("investment_holdings")
    .select("quantity")
    .eq("id", holdingId)
    .maybeSingle();
  const qty = data ? Number(data.quantity) : Number.NaN;
  push(
    log,
    "dca · merge: quantity acumulada = inicial + Σ(aporte/precio)",
    approx(qty, expectedQuantity, 0.001),
    `quantity=${round2(qty)} esperado=${round2(expectedQuantity)}`,
  );
}

/** #3 — each contribution carries a linked_kind='holding' expense txn. */
export async function validateDcaLinkedTxns(
  ctx: AuthContext,
  holdingId: string,
  expectedCount: number,
  log: EventLog,
): Promise<void> {
  const [{ data: contribs }, { data: txns }] = await Promise.all([
    ctx.db
      .from("holding_contributions")
      .select("transaction_id")
      .eq("user_id", ctx.userId)
      .eq("holding_id", holdingId),
    ctx.db
      .from("transactions")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("linked_kind", "holding")
      .eq("linked_id", holdingId),
  ]);
  const txnIds = (contribs ?? []).map((c) => c.transaction_id).filter((x): x is string => Boolean(x));
  const holdingTxnIds = new Set((txns ?? []).map((t) => t.id));
  const allLinked = txnIds.length === expectedCount && txnIds.every((id) => holdingTxnIds.has(id));
  push(
    log,
    "dca · cada aporte con su gasto vinculado (linked_kind='holding')",
    allLinked,
    `aportesConTxn=${txnIds.length} txnsHolding=${(txns ?? []).length} esperado=${expectedCount}`,
  );
}

/** #4 — one portfolio_snapshot per month, all with a positive value. */
export async function validatePortfolioSnapshots(
  ctx: AuthContext,
  expectedCount: number,
  log: EventLog,
): Promise<void> {
  const { data } = await ctx.db
    .from("portfolio_snapshots")
    .select("date, portfolio_value")
    .eq("user_id", ctx.userId)
    .order("date", { ascending: true });
  const rows = data ?? [];
  push(
    log,
    "dca · un portfolio_snapshot por mes",
    rows.length === expectedCount,
    `filas=${rows.length} esperado=${expectedCount}`,
  );
  const positive = rows.length > 0 && rows.every((r) => Number(r.portfolio_value) > 0);
  push(
    log,
    "dca · portfolio_value > 0 en cada snapshot",
    positive,
    `valores=[${rows.map((r) => round2(Number(r.portfolio_value))).join(", ")}]`,
  );
}

/** #5 — inversiones vs-mes present and ▲ once there are ≥2 months of snapshots. */
export async function validateInversionesVsMes(ctx: AuthContext, log: EventLog): Promise<void> {
  const home = await getHomeCardsData(ctx);
  const chip = home.inversiones?.vsMes ?? null;
  push(
    log,
    "dca · vs-mes inversiones presente y ▲ (el portafolio creció)",
    chip !== null && chip.dir === "up",
    `chip=${chip ? chip.dir : "null"}`,
  );
}

/**
 * #6 — HISTORIAL DE COMPRAS COMPLETO (issue #655, arreglado en 494e56d2).
 *
 * Este check nació caracterizando el bug: el auto-DCA escribía holding_contributions
 * pero NO investment_transactions, así que los aportes recurrentes eran invisibles en
 * "mis compras" (UI web y móvil) y para la IA — sólo se veía la compra inicial. El
 * check afirmaba ese comportamiento y decía que fallaría cuando alguien lo arreglara.
 *
 * Ya está arreglado, así que ahora afirma lo CORRECTO: una compra por cada aporte
 * automático, MÁS la inicial de `createHolding`. Si esto vuelve a dar 1, el auto-DCA
 * dejó de registrar su compra y el historial volvió a mentir.
 *
 * El promedio del holding NO entra acá a propósito: `investment_transactions` es
 * historial puro y no toca `average_cost` (lo cubre el validador del merge).
 */
export async function validateInvestmentTxnHistorial(
  ctx: AuthContext,
  holdingId: string,
  dcaCount: number,
  log: EventLog,
): Promise<void> {
  const [{ data: itx }, { data: hc }] = await Promise.all([
    ctx.db
      .from("investment_transactions")
      .select("id,tx_type")
      .eq("user_id", ctx.userId)
      .eq("holding_id", holdingId),
    ctx.db
      .from("holding_contributions")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("holding_id", holdingId),
  ]);
  const compras = (itx ?? []).filter((t) => t.tx_type === "compra").length;
  const hcCount = (hc ?? []).length;
  // 1 = la compra inicial de createHolding; dcaCount = un aporte automático por mes.
  const esperado = 1 + dcaCount;
  push(
    log,
    "dca · #655: cada aporte automático deja su compra en investment_transactions",
    compras === esperado && hcCount === dcaCount,
    `compras=${compras} (esperado ${esperado} = 1 inicial + ${dcaCount} aportes) · holding_contributions=${hcCount}`,
  );
}
