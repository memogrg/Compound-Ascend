import "server-only";

/**
 * View-model del detalle de un frasco de ahorro (Delta C · trazabilidad):
 * la meta más sus transacciones vinculadas (linked_kind='goal') clasificadas y
 * con saldo acumulado corrido, como debt-detail para deudas.
 *
 * Cada movimiento se clasifica por su efecto en el ACUMULADO del frasco:
 *   · Aporte  (+): gasto vinculado que cuenta en presupuesto (subió el acumulado).
 *   · Gasto   (−): gasto vinculado OFF-BUDGET — consumo del frasco (Delta A).
 *   · Retiro  (−): ingreso vinculado — devolución a la cuenta.
 *
 * El saldo corrido se ancla para terminar en `current_amount`: si hubo un saldo
 * de apertura (meta creada con acumulado inicial), se muestra como primera fila.
 * Montos normalizados a la moneda de la meta.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getCategoryNameMap } from "@/modules/financial-base";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type GoalMovementType = "inicial" | "aporte" | "gasto" | "retiro" | "reinicio";

export interface GoalMovement {
  id: string;
  /** YYYY-MM-DD; null solo para el saldo inicial. */
  date: string | null;
  type: GoalMovementType;
  /** Categoría del gasto (solo consumos del frasco); null en el resto. */
  categoryLabel: string | null;
  /** Nota/descripción libre si la hay. */
  note: string | null;
  /** Monto con signo respecto al acumulado (+ aporte, − gasto/retiro; 0 en reinicio). */
  amount: number;
  /** Marca el consumo off-budget (no tocó el presupuesto del mes). */
  offBudget: boolean;
  /** Saldo acumulado del frasco tras este movimiento. */
  balance: number;
  /** Solo en 'reinicio': monto al que se restauró la meta ese período. */
  restoredTarget?: number | null;
  /** true en eventos no reversibles (p.ej. reinicio de período). */
  locked?: boolean;
}

export interface GoalDetailVM {
  id: string;
  name: string;
  currency: string;
  /** 'sobre' = acumulador sin meta (no mostrar meta/brecha ni progreso). */
  kind: "meta" | "sobre";
  currentAmount: number;
  targetAmount: number;
  /** Brecha meta − acumulado (nunca negativa). */
  gap: number;
  /** Nombre de la categoría por defecto del frasco (null si no tiene). */
  defaultCategoryLabel: string | null;
  movements: GoalMovement[];
}

const GOAL_DESC = /^(Aporte|Gasto|Retiro)\s+—\s+/;

/** Quita el prefijo "Aporte — {meta} · " para dejar solo la nota del usuario. */
function extractNote(description: string | null): string | null {
  if (!description) return null;
  const stripped = description.replace(GOAL_DESC, "");
  const parts = stripped.split(" · ");
  const note = parts.length > 1 ? parts.slice(1).join(" · ").trim() : "";
  return note || null;
}

export async function getGoalDetail(goalId: string): Promise<GoalDetailVM | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: goal } = await supabase
    .from("savings_goals")
    .select("id,name,currency,current_amount,target_amount,default_category_id,kind")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!goal) return null;

  const [{ data: txns }, { data: resets }, catMap, rates] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,kind,amount,currency,occurred_on,category_id,description,counts_in_budget")
      .eq("user_id", user.id)
      .eq("linked_kind", "goal")
      .eq("linked_id", goalId)
      .order("occurred_on", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("goal_period_resets")
      .select("id,reset_on,restored_target")
      .eq("user_id", user.id)
      .eq("goal_id", goalId)
      .order("reset_on", { ascending: true }),
    getCategoryNameMap(),
    getFxRates(),
  ]);

  const conv = (n: number, from: string) => convertCurrency(n, from, goal.currency, rates);

  // Clasifica cada transacción vinculada y le asigna signo sobre el acumulado.
  const classified: Omit<GoalMovement, "balance">[] = (txns ?? []).map((t) => {
    const amt = conv(Number(t.amount), t.currency);
    const offBudget = t.counts_in_budget === false;
    let type: GoalMovementType;
    let signed: number;
    if (t.kind === "ingreso") {
      type = "retiro";
      signed = -amt;
    } else if (offBudget) {
      type = "gasto";
      signed = -amt;
    } else {
      type = "aporte";
      signed = amt;
    }
    return {
      id: t.id,
      date: t.occurred_on,
      type,
      categoryLabel: type === "gasto" && t.category_id ? (catMap[t.category_id] ?? null) : null,
      note: extractNote(t.description),
      amount: round2(signed),
      offBudget,
    };
  });

  // Reinicios de período: eventos no reversibles, neutros para el saldo (el
  // acumulado se arrastra), que marcan la restauración de la meta.
  const resetEvents: Omit<GoalMovement, "balance">[] = (resets ?? []).map((r) => ({
    id: r.id,
    date: r.reset_on,
    type: "reinicio" as const,
    categoryLabel: null,
    note: null,
    amount: 0,
    offBudget: false,
    restoredTarget: Number(r.restored_target),
    locked: true,
  }));

  const net = classified.reduce((s, m) => s + m.amount, 0);
  const opening = round2(Number(goal.current_amount) - net);

  // Timeline combinado por fecha (orden estable: las transacciones del día
  // preceden al reinicio del mismo día).
  const combined = [...classified, ...resetEvents].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? ""),
  );

  const movements: GoalMovement[] = [];
  let balance = opening;
  if (Math.abs(opening) >= 0.005) {
    movements.push({
      id: "opening",
      date: null,
      type: "inicial",
      categoryLabel: null,
      note: null,
      amount: opening,
      offBudget: false,
      balance: round2(opening),
    });
  }
  for (const m of combined) {
    balance = round2(balance + m.amount);
    movements.push({ ...m, balance });
  }

  const currentAmount = round2(Number(goal.current_amount));
  const targetAmount = round2(Number(goal.target_amount));
  return {
    id: goal.id,
    name: goal.name,
    currency: goal.currency,
    kind: (goal.kind ?? "meta") as GoalDetailVM["kind"],
    currentAmount,
    targetAmount,
    gap: round2(Math.max(0, targetAmount - currentAmount)),
    defaultCategoryLabel: goal.default_category_id
      ? (catMap[goal.default_category_id] ?? null)
      : null,
    movements,
  };
}
