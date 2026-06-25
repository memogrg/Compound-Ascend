import "server-only";

/**
 * Servicio completo de transacciones (fuente de verdad de lo real). Respeta RLS.
 * Los tabs Ingresos/Gastos/Transacciones leen/escriben aquí; cualquier cambio se
 * refleja en indicadores y en Mi Base. Mantiene compatible la creación del asistente.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { getDisplayCurrency } from "@/modules/financial-base/services/base-service";
import { getCategoryNameMap } from "@/modules/financial-base/services/categories-service";
import { monthPeriod, previousMonthPeriod } from "@/modules/financial-base/engine/period";
import type {
  Transaction,
  TxnKind,
  TxnStatus,
  TxnOrigin,
  Period,
} from "@/modules/financial-base/types";
import type { TxnInput, TransferInput, CsvTxnInput } from "@/modules/financial-base/schemas";
import type { TransactionRow } from "@/lib/supabase/database.types";

export type TxnFilters = { kind?: TxnKind; status?: TxnStatus; origin?: TxnOrigin };

function rowToTransaction(r: TransactionRow): Transaction {
  return {
    id: r.id,
    kind: r.kind as TxnKind,
    description: r.description,
    merchantOrSource: r.merchant_or_source ?? null,
    amount: Number(r.amount),
    currency: r.currency,
    occurredOn: r.occurred_on,
    categoryId: r.category_id,
    accountId: r.account_id ?? null,
    accountLabel: r.account_label,
    status: (r.status ?? "confirmed") as TxnStatus,
    origin: (r.origin ?? "manual") as TxnOrigin,
    receiptUrl: r.receipt_url ?? null,
    confirmedByUser: r.confirmed_by_user,
    linkedKind: (r.linked_kind ?? "none") as Transaction["linkedKind"],
    linkedId: r.linked_id ?? null,
    recurringItemId: r.recurring_item_id ?? null,
    incomeSourceId: r.income_source_id ?? null,
  };
}

/** Resuelve el nombre de la cuenta para denormalizar account_label. */
async function accountLabelFor(accountId: string | null | undefined): Promise<string | null> {
  if (!accountId) return null;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("accounts")
    .select("name")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.name ?? null;
}

export async function listTransactions(
  period: Period,
  filters: TxnFilters = {},
): Promise<Transaction[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .gte("occurred_on", period.from)
    .lte("occurred_on", period.to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.kind) q = q.eq("kind", filters.kind);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.origin) q = q.eq("origin", filters.origin);
  const { data } = await q;
  return (data ?? []).map(rowToTransaction);
}

export type CreatedTransaction = {
  id: string;
  /** Vínculo final tras aplicar reglas (puede diferir del input). */
  linkedKind: NonNullable<TxnInput["linkedKind"]>;
  linkedId: string | null;
};

/** Crea la transacción y devuelve id + vínculo final (post-reglas). */
/** Forma del insert de `transactions` (igual que el Insert de la BD). */
export type TransactionInsert = Partial<TransactionRow> & { user_id: string };

/**
 * Resuelve TODOS los valores de la fila de `transactions` (auto-categorización
 * por reglas, cuenta predeterminada, household, etiquetas) SIN insertarla.
 *
 * Se expone para que el orquestador de eventos de dinero pueda pasar la fila ya
 * resuelta a una RPC transaccional (atomicidad real) sin duplicar esta lógica
 * de negocio en SQL. `createTransaction` la usa para el camino normal.
 */
export async function buildTransactionRow(
  input: TxnInput,
): Promise<{ row: TransactionInsert; linkedKind: CreatedTransaction["linkedKind"]; linkedId: string | null }> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Auto-categorización por reglas: si falta categoría/cuenta/vínculo y hay
  // comercio, aplica la primera regla que haga match (determinista, sin IA).
  let categoryId = input.categoryId ?? null;
  let accountId = input.accountId ?? null;
  let linkedKind = input.linkedKind ?? "none";
  let linkedId = input.linkedId ?? null;
  // Auto-categorización por reglas solo para gasto/ingreso (no para 'ajuste').
  if (
    (!categoryId || !accountId || linkedKind === "none") &&
    input.merchantOrSource &&
    (input.kind === "gasto" || input.kind === "ingreso")
  ) {
    const { findMatchingRule } = await import("@/modules/financial-base/services/rules-service");
    const rule = await findMatchingRule(
      input.merchantOrSource,
      input.kind === "gasto" ? "expense" : "income",
    );
    if (rule) {
      categoryId = categoryId ?? rule.suggestedCategoryId;
      accountId = accountId ?? rule.suggestedAccountId;
      // Auto-vínculo (Fase 2): solo si el usuario no eligió vínculo a mano.
      // La entidad de la regla se valida; si murió, el vínculo se descarta
      // en silencio (una regla vieja no debe bloquear el registro del gasto).
      if (linkedKind === "none" && rule.linkedKind && rule.linkedId) {
        const { assertLinkableEntity } =
          await import("@/modules/financial-base/services/linkable-entities-service");
        try {
          await assertLinkableEntity(
            rule.linkedKind as Exclude<NonNullable<TxnInput["linkedKind"]>, "none">,
            rule.linkedId,
          );
          linkedKind = rule.linkedKind as NonNullable<TxnInput["linkedKind"]>;
          linkedId = rule.linkedId;
        } catch {
          // Entidad de la regla inexistente: la transacción nace sin vínculo.
        }
      }
    }
  }

  // Fase 6.1: un vínculo pedido explícitamente (composer, chat/scanner,
  // orquestador) debe apuntar a una entidad EXISTENTE y DEL USUARIO. linked_id
  // es polimórfico sin FK — sin este guard, un uuid alucinado o ajeno se
  // persistiría. Falla limpia ANTES de crear la transacción.
  if (input.linkedKind && input.linkedKind !== "none" && input.linkedId) {
    const { assertLinkableEntity } =
      await import("@/modules/financial-base/services/linkable-entities-service");
    await assertLinkableEntity(input.linkedKind, input.linkedId);
  }
  // Un kind sin id no es un vínculo: se normaliza a 'none'.
  if (linkedKind !== "none" && !linkedId) linkedKind = "none";

  // Sin cuenta explícita ni de regla: cuenta predeterminada en silencio
  // (el composer ya no muestra selector de cuenta).
  if (!accountId) {
    const { data: def } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();
    accountId = def?.id ?? null;
  }

  const accountLabel = await accountLabelFor(accountId);
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const row: TransactionInsert = {
    user_id: user.id,
    household_id,
    kind: input.kind,
    description: input.description ?? null,
    merchant_or_source: input.merchantOrSource ?? null,
    amount: input.amount,
    currency: input.currency,
    occurred_on: input.occurredOn,
    category_id: categoryId,
    account_id: accountId,
    account_label: accountLabel,
    status: input.status,
    origin: input.origin,
    receipt_url: input.receiptUrl ?? null,
    confidence_score_internal: input.confidence ?? null,
    source:
      input.origin === "scanned" ? "receipt" : input.origin === "ai_assisted" ? "chat" : "manual",
    confirmed_by_user: input.status === "confirmed",
    linked_kind: linkedKind,
    linked_id: linkedId,
    recurring_item_id: input.recurringItemId ?? null,
    income_source_id: input.incomeSourceId ?? null,
  };
  return { row, linkedKind, linkedId };
}

/**
 * Crea una transacción (camino normal, no atómico con un ledger). Resuelve la
 * fila con `buildTransactionRow` y la inserta.
 */
export async function createTransaction(input: TxnInput): Promise<CreatedTransaction> {
  const supabase = await createSupabaseServerClient();
  const { row, linkedKind, linkedId } = await buildTransactionRow(input);
  const { data, error } = await supabase.from("transactions").insert(row).select("id").single();
  if (error) throw new Error(error.message);

  // Saco de Liquidez: registra el delta de esta transacción. Best-effort: un
  // fallo aquí no debe romper el registro (la transacción ya se persistió).
  await recordLiquidityDelta({
    transactionId: data.id,
    kind: input.kind,
    amount: input.amount,
    currency: input.currency,
    occurredOn: input.occurredOn,
  });

  return { id: data.id, linkedKind, linkedId };
}

export async function updateTransaction(id: string, input: TxnInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const accountLabel = await accountLabelFor(input.accountId);
  await supabase
    .from("transactions")
    .update({
      kind: input.kind,
      description: input.description ?? null,
      merchant_or_source: input.merchantOrSource ?? null,
      amount: input.amount,
      currency: input.currency,
      occurred_on: input.occurredOn,
      category_id: input.categoryId ?? null,
      account_id: input.accountId ?? null,
      account_label: accountLabel,
      status: input.status,
      origin: input.origin,
      confirmed_by_user: input.status === "confirmed",
    })
    .eq("id", id)
    .eq("user_id", user.id);

  // Saco de Liquidez: re-sincroniza el delta con el nuevo kind/amount. Si pasó a
  // un kind sin delta (transferencia/ajuste), recordTransactionDelta borra la fila.
  await recordLiquidityDelta({
    transactionId: id,
    kind: input.kind,
    amount: input.amount,
    currency: input.currency,
    occurredOn: input.occurredOn,
  });
}

/** Engancha el ledger de liquidez (import dinámico) sin romper el registro. */
async function recordLiquidityDelta(args: {
  transactionId: string;
  kind: TxnKind;
  amount: number;
  currency: string;
  occurredOn: string;
}): Promise<void> {
  try {
    const { recordTransactionDelta } = await import(
      "@/modules/financial-base/services/liquidity-service"
    );
    await recordTransactionDelta(args);
  } catch {
    // Liquidez best-effort: la reconciliación 1-toque corrige cualquier desfase.
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("transactions").delete().eq("id", id).eq("user_id", user.id);
}

export async function duplicateTransaction(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return;
  await supabase.from("transactions").insert({
    user_id: user.id,
    household_id: data.household_id ?? null,
    kind: data.kind,
    description: data.description,
    merchant_or_source: data.merchant_or_source ?? null,
    amount: data.amount,
    currency: data.currency,
    occurred_on: data.occurred_on,
    category_id: data.category_id,
    account_id: data.account_id ?? null,
    account_label: data.account_label,
    status: data.status ?? "confirmed",
    origin: data.origin ?? "manual",
    source: data.source,
    confirmed_by_user: data.confirmed_by_user,
  });
}

export async function markReviewed(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("transactions")
    .update({ status: "confirmed", confirmed_by_user: true })
    .eq("id", id)
    .eq("user_id", user.id);
}

/** Divide una transacción en partes (reemplaza el original por las partes). */
export async function splitTransaction(
  id: string,
  parts: { amount: number; categoryId?: string | null; description?: string | null }[],
): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data || parts.length === 0) return;
  const base = data;
  const rows = parts.map((p) => ({
    user_id: user.id,
    household_id: base.household_id ?? null,
    kind: base.kind,
    description: p.description ?? base.description,
    merchant_or_source: base.merchant_or_source,
    amount: p.amount,
    currency: base.currency,
    occurred_on: base.occurred_on,
    category_id: p.categoryId ?? base.category_id,
    account_id: base.account_id,
    account_label: base.account_label,
    status: base.status,
    origin: base.origin,
    source: base.source,
    confirmed_by_user: base.confirmed_by_user,
  }));
  await supabase.from("transactions").insert(rows);
  await supabase.from("transactions").delete().eq("id", id).eq("user_id", user.id);
}

/** Transferencia entre cuentas: una fila kind='transferencia' (neutra en agregados). */
export async function createTransfer(input: TransferInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: accs } = await supabase
    .from("accounts")
    .select("id,name")
    .eq("user_id", user.id)
    .in("id", [input.fromAccountId, input.toAccountId]);
  const nameOf = (id: string) => accs?.find((a) => a.id === id)?.name ?? "Cuenta";
  const household_id = await getActiveHouseholdId(supabase, user.id);
  await supabase.from("transactions").insert({
    user_id: user.id,
    household_id,
    kind: "transferencia",
    description: input.note ?? null,
    merchant_or_source: `${nameOf(input.fromAccountId)} → ${nameOf(input.toAccountId)}`,
    amount: input.amount,
    currency: input.currency,
    occurred_on: input.occurredOn,
    category_id: null,
    account_id: input.fromAccountId,
    account_label: nameOf(input.fromAccountId),
    status: "confirmed",
    origin: "manual",
    source: "manual",
    confirmed_by_user: true,
  });
}

/** Importación masiva (CSV): entran como pendientes de revisar. */
export async function importTransactions(rows: CsvTxnInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const payload = rows.map((r) => ({
    user_id: user.id,
    household_id,
    kind: r.kind,
    description: r.description ?? null,
    merchant_or_source: r.description ?? null,
    amount: r.amount,
    currency: r.currency,
    occurred_on: r.occurredOn,
    category_id: null,
    account_id: null,
    account_label: null,
    status: "pending_review" as const,
    origin: "imported" as const,
    source: "manual",
    confirmed_by_user: false,
  }));
  const { error } = await supabase.from("transactions").insert(payload);
  return error ? 0 : payload.length;
}

/** Genera una URL firmada temporal para ver el recibo (bucket privado). */
export async function getReceiptSignedUrl(path: string): Promise<string | null> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}

export type KeyedTotals = Record<string, { label: string; value: number }>;
export type RealTotals = {
  realIncome: number;
  realExpense: number;
  freeCashflowReal: number;
  count: number;
  avgDaily: number;
  incomeByKey: KeyedTotals;
  /** Solo ingresos CONFIRMADOS (status='confirmed'), por fuente. Para las barras
   *  "recibido vs presupuestado" que se llenan al confirmar "Recibido". */
  incomeConfirmedByKey: KeyedTotals;
  /** Recibido confirmado por FUENTE (income_source_id → monto), CONVERTIDO a la
   *  moneda de visualización. Para agregados/donut (suma cross-moneda válida). */
  incomeReceivedBySource: Record<string, number>;
  /** Recibido confirmado por FUENTE en la moneda NATIVA capturada (sin convertir).
   *  Para mostrar la fila/barra de cada fuente en su propia moneda (it.currency). */
  incomeReceivedBySourceNative: Record<string, number>;
  expenseByKey: KeyedTotals;
  topExpenseCategory: string | null;
  pendingCount: number;
  currency: string;
};

/** Totales reales del periodo (desde transactions), normalizados a la moneda de visualización. */
export async function getRealTotals(period: Period): Promise<RealTotals> {
  const [txns, currency, rates, catMap] = await Promise.all([
    listTransactions(period),
    getDisplayCurrency(),
    getFxRates(),
    getCategoryNameMap(),
  ]);

  let realIncome = 0;
  let realExpense = 0;
  let pendingCount = 0;
  const incomeByKey: KeyedTotals = {};
  const incomeConfirmedByKey: KeyedTotals = {};
  const incomeReceivedBySource: Record<string, number> = {};
  const incomeReceivedBySourceNative: Record<string, number> = {};
  const expenseByKey: KeyedTotals = {};

  for (const t of txns) {
    if (t.status === "pending_review") pendingCount += 1;
    const value = convertCurrency(t.amount, t.currency, currency, rates);
    if (t.kind === "ingreso") {
      realIncome += value;
      const label = t.merchantOrSource || t.description || "Otros ingresos";
      const key = label.trim().toLowerCase();
      incomeByKey[key] = { label, value: (incomeByKey[key]?.value ?? 0) + value };
      if (t.status === "confirmed") {
        incomeConfirmedByKey[key] = {
          label,
          value: (incomeConfirmedByKey[key]?.value ?? 0) + value,
        };
        if (t.incomeSourceId) {
          incomeReceivedBySource[t.incomeSourceId] =
            (incomeReceivedBySource[t.incomeSourceId] ?? 0) + value;
          // Nativo: monto tal cual se capturó (sin convertir), para mostrar la
          // fila/barra de la fuente en su propia moneda.
          incomeReceivedBySourceNative[t.incomeSourceId] =
            (incomeReceivedBySourceNative[t.incomeSourceId] ?? 0) + t.amount;
        }
      }
    } else {
      realExpense += value;
      const label = t.categoryId ? (catMap[t.categoryId] ?? "Sin categoría") : "Sin categoría";
      const key = t.categoryId ?? "sin_categoria";
      expenseByKey[key] = { label, value: (expenseByKey[key]?.value ?? 0) + value };
    }
  }

  const daysInPeriod = new Date(period.to).getDate();
  const topExpenseCategory =
    Object.values(expenseByKey).sort((a, b) => b.value - a.value)[0]?.label ?? null;

  return {
    realIncome,
    realExpense,
    freeCashflowReal: realIncome - realExpense,
    count: txns.length,
    avgDaily: daysInPeriod > 0 ? realExpense / daysInPeriod : 0,
    incomeByKey,
    incomeConfirmedByKey,
    incomeReceivedBySource,
    incomeReceivedBySourceNative,
    expenseByKey,
    topExpenseCategory,
    pendingCount,
    currency,
  };
}

/**
 * Pagado del periodo por entidad vinculada (linked_id) de un `linkedKind` dado
 * (p.ej. 'debt'), normalizado a la moneda de visualización. El `period.to`
 * actúa como corte (lo aprovecha el filtro de fecha de los frascos). Para los
 * frascos vinculados budget-aware del tab de Gastos.
 */
export async function getLinkedSpentByEntity(
  period: Period,
  linkedKind: string,
): Promise<Record<string, number>> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [currency, rates] = await Promise.all([getDisplayCurrency(), getFxRates()]);
  const { data } = await supabase
    .from("transactions")
    .select("amount,currency,linked_id")
    .eq("user_id", user.id)
    .eq("linked_kind", linkedKind)
    .gte("occurred_on", period.from)
    .lte("occurred_on", period.to);
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    if (!r.linked_id) continue;
    out[r.linked_id] =
      (out[r.linked_id] ?? 0) + convertCurrency(Number(r.amount), r.currency, currency, rates);
  }
  return out;
}

/**
 * Gasto EXTRAORDINARIO por deuda en el periodo (subconjunto de getLinkedSpentByEntity).
 * Suma las transacciones vinculadas (linked_kind='debt') cuyo debt_payment es
 * kind='extraordinario'. Sirve para diferenciar en Gastos lo que no es la cuota.
 */
export async function getExtraordinarySpentByDebt(
  period: Period,
): Promise<Record<string, number>> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [currency, rates] = await Promise.all([getDisplayCurrency(), getFxRates()]);
  const { data: pays } = await supabase
    .from("debt_payments")
    .select("transaction_id")
    .eq("user_id", user.id)
    .eq("kind", "extraordinario")
    .gte("occurred_on", period.from)
    .lte("occurred_on", period.to);
  const txnIds = (pays ?? [])
    .map((p) => p.transaction_id)
    .filter((x): x is string => Boolean(x));
  if (txnIds.length === 0) return {};
  const { data: txns } = await supabase
    .from("transactions")
    .select("amount,currency,linked_id")
    .eq("user_id", user.id)
    .in("id", txnIds);
  const out: Record<string, number> = {};
  for (const t of txns ?? []) {
    if (!t.linked_id) continue;
    out[t.linked_id] =
      (out[t.linked_id] ?? 0) + convertCurrency(Number(t.amount), t.currency, currency, rates);
  }
  return out;
}

/** Fecha (YYYY-MM-DD) de la transacción más antigua del usuario, o null. Sirve
 *  para acotar el rango "Todo el tiempo" del histórico de ingresos. */
export async function getEarliestTransactionDate(): Promise<string | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("transactions")
    .select("occurred_on")
    .eq("user_id", user.id)
    .order("occurred_on", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.occurred_on ?? null;
}

export type HistoryPoint = {
  label: string;
  realIncome: number;
  realExpense: number;
  budgetIncome: number;
  budgetExpense: number;
  freeCashflow: number;
};

/**
 * Serie histórica (últimos N meses hasta `period`) para gráficas de línea:
 * real (transactions) + presupuesto por mes (budget_items). Todo en la moneda
 * de visualización. El presupuesto por mes hace fieles las líneas real-vs-presup.
 */
export async function getRealHistory(period: Period, monthsBack = 6): Promise<HistoryPoint[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [currency, rates] = await Promise.all([getDisplayCurrency(), getFxRates()]);

  // Rango: desde (monthsBack-1) meses atrás hasta el fin del periodo.
  let start = period;
  for (let i = 0; i < monthsBack - 1; i++) start = previousMonthPeriod(start);

  const years = new Set<number>();
  const buckets = new Map<
    string,
    { label: string; income: number; expense: number; bIncome: number; bExpense: number }
  >();
  let cursor = start;
  for (let i = 0; i < monthsBack; i++) {
    buckets.set(`${cursor.year}-${cursor.month}`, {
      label: cursor.label,
      income: 0,
      expense: 0,
      bIncome: 0,
      bExpense: 0,
    });
    years.add(cursor.year);
    cursor = monthPeriod(
      cursor.month === 12 ? cursor.year + 1 : cursor.year,
      cursor.month === 12 ? 1 : cursor.month + 1,
    );
  }

  const [txnRes, budgetRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("kind,amount,currency,occurred_on")
      .eq("user_id", user.id)
      .gte("occurred_on", start.from)
      .lte("occurred_on", period.to),
    supabase
      .from("budget_items")
      .select("type,amount,currency,period_month,period_year")
      .eq("user_id", user.id)
      .in("period_year", [...years]),
  ]);

  for (const r of txnRes.data ?? []) {
    const d = new Date(r.occurred_on);
    const b = buckets.get(`${d.getFullYear()}-${d.getMonth() + 1}`);
    if (!b) continue;
    const value = convertCurrency(Number(r.amount), r.currency, currency, rates);
    if (r.kind === "ingreso") b.income += value;
    else b.expense += value;
  }

  for (const r of budgetRes.data ?? []) {
    const b = buckets.get(`${r.period_year}-${r.period_month}`);
    if (!b) continue;
    const value = convertCurrency(Number(r.amount), r.currency, currency, rates);
    if (r.type === "income") b.bIncome += value;
    else b.bExpense += value;
  }

  return [...buckets.values()].map((b) => ({
    label: b.label,
    realIncome: Math.round(b.income),
    realExpense: Math.round(b.expense),
    budgetIncome: Math.round(b.bIncome),
    budgetExpense: Math.round(b.bExpense),
    freeCashflow: Math.round(b.income - b.expense),
  }));
}
