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

export type GoalMovementType = "inicial" | "aporte" | "gasto" | "retiro";

export interface GoalMovement {
  id: string;
  /** YYYY-MM-DD; null solo para el saldo inicial. */
  date: string | null;
  type: GoalMovementType;
  /** Categoría del gasto (solo consumos del frasco); null en el resto. */
  categoryLabel: string | null;
  /** Nota/descripción libre si la hay. */
  note: string | null;
  /** Monto con signo respecto al acumulado (+ aporte, − gasto/retiro). */
  amount: number;
  /** Marca el consumo off-budget (no tocó el presupuesto del mes). */
  offBudget: boolean;
  /** Saldo acumulado del frasco tras este movimiento. */
  balance: number;
}

export interface GoalDetailVM {
  id: string;
  name: string;
  currency: string;
  currentAmount: number;
  targetAmount: number;
  /** Brecha meta − acumulado (nunca negativa). */
  gap: number;
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
    .select("id,name,currency,current_amount,target_amount")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!goal) return null;

  const [{ data: txns }, catMap, rates] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,kind,amount,currency,occurred_on,category_id,description,counts_in_budget")
      .eq("user_id", user.id)
      .eq("linked_kind", "goal")
      .eq("linked_id", goalId)
      .order("occurred_on", { ascending: true })
      .order("created_at", { ascending: true }),
    getCategoryNameMap(),
    getFxRates(),
  ]);

  const conv = (n: number, from: string) => convertCurrency(n, from, goal.currency, rates);

  // Clasifica cada transacción vinculada y le asigna signo sobre el acumulado.
  const classified = (txns ?? []).map((t) => {
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

  const net = classified.reduce((s, m) => s + m.amount, 0);
  const opening = round2(Number(goal.current_amount) - net);

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
  for (const m of classified) {
    balance = round2(balance + m.amount);
    movements.push({ ...m, note: m.note, balance });
  }

  const currentAmount = round2(Number(goal.current_amount));
  const targetAmount = round2(Number(goal.target_amount));
  return {
    id: goal.id,
    name: goal.name,
    currency: goal.currency,
    currentAmount,
    targetAmount,
    gap: round2(Math.max(0, targetAmount - currentAmount)),
    movements,
  };
}
