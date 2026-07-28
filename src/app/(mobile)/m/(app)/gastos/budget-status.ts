import type { MTone } from "../../components/content-kit";

/**
 * Nivel de ejecución de un presupuesto → tono. Presentación PURA (no cambia ningún dato) y
 * testeable — por eso vive aquí y no dentro del componente.
 *
 * - `budget > 0`: verde (vas bien) · ámbar (te acercas, ≥85%) · rojo (te pasaste). SIN CAMBIOS.
 * - `budget == 0`:
 *     · sin gasto  → neutral (no hay nada que señalar).
 *     · con gasto  → ÁMBAR: se gastó/aportó SIN presupuesto y hay que verlo, no esconderlo.
 *       Un % de X÷0 es infinito, así que el aviso es de TONO + etiqueta "sin presupuesto"
 *       (no un número): el importe gastado se muestra igual.
 */
export function levelTone(spent: number, budget: number): MTone {
  if (budget <= 0) return spent > 0 ? "warning" : "neutral";
  const ratio = spent / budget;
  if (ratio > 1) return "danger";
  if (ratio >= 0.85) return "warning";
  return "success";
}

/** true cuando se gastó/aportó SIN presupuesto asignado (budget 0 pero spent > 0). */
export function isUnbudgeted(spent: number, budget: number): boolean {
  return budget <= 0 && spent > 0;
}
