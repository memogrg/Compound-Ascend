/**
 * CONTEXTO PEREZOSO — mapeo PURO (0 IO) de un intent ya matcheado por patrón al MÍNIMO que su carril
 * necesita. La ruta corre matchIntent primero y usa esto para construir SOLO esa porción: una consulta
 * que el router resuelve determinista NO paga el portafolio (precios de mercado en vivo — el costo
 * dominante), ni el patrimonio, ni los bloques "flavor" (que solo usa el LLM). Intent desconocido →
 * contexto completo (seguro). Testeable sin tocar la BD.
 */
import type { ContextScope } from "@/lib/ai/context-engine";

/** Qué lecturas caras del toolContext hace falta armar (deudas, metas, los tres números patrimoniales). */
export type ToolNeed = { debts: boolean; goals: boolean; numbers: boolean };
/** Alcance del contexto por carril. `context: null` → ni siquiera se arma el FinancialContext. */
export type LaneScope = { context: ContextScope | null; tool: ToolNeed };

/** Intents de LECTURA FRESCA: resolveFetchIntent lee su dato puntual; no usan ctx ni toolContext (salvo moneda). */
export const FETCH_INTENTS_LAZY: ReadonlySet<string> = new Set([
  "saldo_liquidez",
  "saldo_sobre",
  "ultimos_movimientos",
  "listar_sobres",
  "puedo_gastar",
]);

const NONE: ToolNeed = { debts: false, goals: false, numbers: false };
const FULL_SCOPE: ContextScope = { patrimonio: true, portfolio: true, defense: true, flavor: true };

export function scopeForIntent(intent: string, params: Record<string, unknown> = {}): LaneScope {
  if (FETCH_INTENTS_LAZY.has(intent)) return { context: null, tool: NONE };
  switch (intent) {
    case "datos_mercado":
    case "resumen_inversiones":
      return { context: { portfolio: true }, tool: NONE }; // holdings / investment* (precios en vivo)
    case "informe_inversion":
      // Carril DEEP: el informe determinista lee posiciones (portfolio), brecha/DCA (patrimonio),
      // colchón (defense) y deudas/números del toolContext. Fuera a propósito: `flavor` (solo lo usa
      // el LLM y acá no hay LLM) y `goals` (el paquete de evidencia NO consume metas; si la Etapa B
      // las necesita, se prende ahí).
      return { context: { portfolio: true, patrimonio: true, defense: true }, tool: { debts: true, goals: false, numbers: true } };
    case "numero_seguridad":
    case "numero_independencia":
    case "numero_libertad":
      return { context: null, tool: { ...NONE, numbers: true } }; // solo los números del toolContext
    case "plan_independencia":
      return { context: { patrimonio: true }, tool: { ...NONE, numbers: true } }; // + compromiso/freeCashflow
    case "dca_mensual":
    case "ahorro_mensual":
      return { context: { patrimonio: true }, tool: NONE }; // compromisoDesglose (ctx)
    case "defensa_fondo":
      return params.focus === "colchon"
        ? { context: { patrimonio: true, defense: true }, tool: NONE } // mesesDeColchon
        : { context: { defense: true }, tool: NONE }; // defenseFunds
    case "metas":
    case "metas_a_aportar":
    case "falta_meta":
    case "meta_cercana":
      return { context: null, tool: { ...NONE, goals: true } };
    case "cuota_deuda":
      return { context: null, tool: { ...NONE, debts: true } };
    case "gasto_mes":
    case "ingreso_mes":
    case "gasto_categoria":
    case "flujo_libre":
      return { context: {}, tool: NONE }; // {} = solo bloques BARATOS (base/sobres); sin patrimonio ni portfolio
    default:
      return { context: FULL_SCOPE, tool: { debts: true, goals: true, numbers: true } };
  }
}
