/**
 * Utilidades de formularios (lado cliente).
 */

/**
 * Enfoca el primer campo con error tras un envío fallido, para guiar la
 * corrección sin que el usuario tenga que buscar dónde falló (a11y + UX).
 * Captura `form` ANTES de cualquier `await` (e.currentTarget se anula después).
 */
export function focusFirstError(
  form: HTMLFormElement | null | undefined,
  errors: Record<string, string> | undefined,
): void {
  if (!form || !errors) return;
  const firstKey = Object.keys(errors)[0];
  if (!firstKey) return;
  const el = form.querySelector<HTMLElement>(`[name="${CSS.escape(firstKey)}"]`);
  el?.focus();
}
