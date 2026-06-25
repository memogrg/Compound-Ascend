/**
 * Escapa caracteres con significado en HTML para interpolar de forma segura texto
 * controlado por el usuario dentro de plantillas (p. ej. cuerpos de correo).
 * Previene inyección de HTML/JS cuando el valor se incrusta en markup.
 */
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
