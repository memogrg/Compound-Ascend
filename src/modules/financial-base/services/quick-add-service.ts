import "server-only";

/**
 * Datos mínimos para el alta rápida: los sobres a los que el usuario puede imputar un
 * gasto y cuáles usa DE VERDAD.
 *
 * Existe aparte de `getExpenseJarsAsOf` a propósito: los frascos son un agregado caro
 * (una docena de consultas en paralelo) y aquí solo hace falta una lista de hojas y un
 * conteo. Inicio no puede pagar el agregado completo por una hoja que quizá no se abra.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { householdMemberIds } from "@/lib/household/active";

export type SobreRapido = { id: string; name: string };

/**
 * Fuente de ingreso contra la que se registra un cobro.
 *
 * OJO con el nombre: la columna se llama `transactions.income_source_id`, pero NO apunta a
 * la tabla `income_sources` — apunta a un `budget_items` de tipo income. Es lo que hace
 * `receivePartialIncome` y es lo que la pantalla /m/ingresos lista y suma
 * (`incomeReceivedBySource[b.id]`). Enlazar la otra tabla dejaría el ingreso fuera del
 * "recibido" de todas las fuentes, sin error visible.
 *
 * `currency` viaja con la fuente a propósito: al elegirla, el importe se etiqueta con SU
 * moneda, no con la principal por omisión. Es el invariante del P0 de moneda.
 */
export type FuenteIngreso = { id: string; name: string; currency: string };

export type QuickAddData = {
  /** Todos los sobres imputables, para el selector completo. */
  sobres: SobreRapido[];
  /** Los que más usa, por número de movimientos recientes. Primer toque del flujo. */
  frecuentes: SobreRapido[];
  /** Fuentes de ingreso del periodo. El alta rápida registra CONTRA una existente; crear
   *  una fuente nueva es otra cosa y vive en Ingresos. */
  fuentes: FuenteIngreso[];
};

/** Ventana para "frecuente". Tres meses: suficiente para captar el hábito real sin que
 *  un mes raro (vacaciones, mudanza) lo domine para siempre. */
const DIAS_VENTANA = 90;
const MAX_FRECUENTES = 6;

export async function getQuickAddData(): Promise<QuickAddData> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);

  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_VENTANA);

  const now = new Date();
  const [cats, txns, fuentes] = await Promise.all([
    // Hojas de gasto activas: son las únicas a las que se puede imputar.
    supabase
      .from("expense_categories")
      .select("id,name,parent_id,is_active,category_type")
      .in("user_id", memberIds)
      .eq("category_type", "expense")
      .eq("is_active", true),
    supabase
      .from("transactions")
      .select("category_id")
      .in("user_id", memberIds)
      .eq("kind", "gasto")
      .not("category_id", "is", null)
      .gte("occurred_on", desde.toISOString().slice(0, 10)),
    // Fuentes del periodo en curso: son las que la pantalla de Ingresos muestra, así que
    // son las que el usuario reconoce. Una consulta más, del mismo peso que las otras dos.
    supabase
      .from("budget_items")
      .select("id,name,currency")
      .in("user_id", memberIds)
      .eq("type", "income")
      .eq("period_year", now.getFullYear())
      .eq("period_month", now.getMonth() + 1)
      .order("name"),
  ]);

  // Solo HOJAS: imputar a un grupo de nivel 1 mezclaría el rollup con el detalle.
  const conHijos = new Set((cats.data ?? []).map((c) => c.parent_id).filter(Boolean));
  const hojas = (cats.data ?? []).filter((c) => c.parent_id !== null && !conHijos.has(c.id));
  const porId = new Map(hojas.map((c) => [c.id, c.name]));

  const cuenta = new Map<string, number>();
  for (const t of txns.data ?? []) {
    if (t.category_id && porId.has(t.category_id)) {
      cuenta.set(t.category_id, (cuenta.get(t.category_id) ?? 0) + 1);
    }
  }

  const frecuentes = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_FRECUENTES)
    .map(([id]) => ({ id, name: porId.get(id)! }));

  return {
    sobres: hojas
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    frecuentes,
    fuentes: (fuentes.data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      currency: f.currency,
    })),
  };
}
