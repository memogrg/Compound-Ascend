import {
  editCategoryAction,
  forkCategoryAction,
} from "@/modules/financial-base/api/v2-actions";

/**
 * Marcar/desmarcar un sobre como "Gasto esencial" (número de seguridad), como acción
 * directa desde el kebab del sobre. Fuente ÚNICA de la ramificación para no repetirla
 * por superficie ni desincronizarla:
 *   · sobre propio o forkeado (household)  → editCategoryAction({ isEssential })
 *   · sobre BASE de sistema                → forkCategoryAction({ isEssential }) — una
 *     base no se puede editar directo (RLS), así que se forkea una copia del hogar con
 *     el flag; forkCategory preserva nombre/icono/color/favorito de la base.
 *
 * La visibilidad (NO mostrar en frascos vinculados g_deudas/g_defensa/g_ahorro_lp/
 * g_libertad) la decide el caller: esos frascos no tienen sobres de usuario.
 */
type ToggleResult = { ok: boolean; message?: string };

export function toggleEssentialAction(
  categoryId: string,
  isSystemBase: boolean,
  next: boolean,
): Promise<ToggleResult> {
  return isSystemBase
    ? forkCategoryAction({ baseId: categoryId, isEssential: next })
    : editCategoryAction(categoryId, { isEssential: next });
}

/** Copy del ítem de menú según el estado actual (mismo texto en web y móvil). */
export function essentialToggleLabel(isEssential: boolean): string {
  return isEssential ? "Quitar de esenciales" : "Marcar como esencial";
}
