import "server-only";
import { revalidatePath } from "next/cache";

/**
 * ESPEJO WEB → MÓVIL de las rutas que revalidan las server actions.
 *
 * El problema que resuelve: `revalidatePath` sólo invalida la ruta exacta que se
 * le pasa, y el móvil vive en su propio árbol (`/m/...`). Una acción que
 * revalidaba `/deudas` dejaba `/m/deudas` sirviendo el dato viejo, así que en el
 * celular había que recargar a mano — por más `router.refresh()` que hiciera la
 * UI, el servidor seguía considerando su caché válida.
 *
 * Medido antes de esto (auditoría #752): de 161 `revalidatePath` en `src/`, sólo
 * 10 apuntaban a una ruta móvil. `control` (47 llamadas) y `assistant` (24) no
 * tocaban NINGUNA: deudas, metas y todo lo que escribe el chat nunca repintaban.
 *
 * Por qué una tabla y no `revalidatePath` a mano en cada acción: el hueco no se
 * abrió por descuido de una persona, se abrió porque había que acordarse en 161
 * lugares. Acá la equivalencia se declara UNA vez y `revalidarRuta` la aplica
 * siempre. Agregar una pantalla móvil es agregar una fila, no auditar el repo.
 *
 * Nota: esto sólo AÑADE revalidaciones; ninguna acción pierde las que ya tenía.
 */
const ESPEJO_MOVIL: Record<string, readonly string[]> = {
  // Base financiera y sus tabs.
  "/mi-base-financiera": ["/m/mi-base-financiera"],
  "/ingresos": ["/m/ingresos"],
  "/gastos": ["/m/gastos"],
  "/transacciones": ["/m/transacciones"],

  // Control: en móvil las metas viven en /m/metas y las deudas en /m/deudas.
  "/deudas": ["/m/deudas"],
  "/control-financiero": ["/m/metas"],
  // `/ahorro` no existe como ruta web (gotcha conocido en CLAUDE.md), pero varias
  // acciones la revalidan igual. Se mapea de todos modos: cuesta nada y el día
  // que alguien limpie esas llamadas, el móvil ya no depende de ellas.
  "/ahorro": ["/m/metas"],

  // Patrimonio: el hub web se reparte en cuatro pantallas móviles.
  "/patrimonio": ["/m/patrimonio", "/m/inversiones", "/m/indicadores", "/m/libertad"],
  "/patrimonio/proteccion": ["/m/proteccion"],
  "/patrimonio/indicadores": ["/m/indicadores"],
  "/mi-rich-life": ["/m/patrimonio", "/m/libertad"],

  // El inicio móvil muestra el panel Y el hub de configuración.
  "/dashboard": ["/m", "/m/configurar"],

  // Mis acciones: la pantalla móvil gemela, y el Inicio móvil, que muestra la ficha de la
  // próxima mejor acción (si no se repinta, la ficha sigue proponiendo lo ya hecho).
  "/mis-acciones": ["/m/mis-acciones", "/m"],

  // Perfil y cuenta.
  "/mi-perfil-financiero": ["/m/mi-perfil-financiero", "/m/perfil-financiero"],
  "/configuracion": ["/m/perfil"],
};

/** Rutas móviles de la app, para que el test de cobertura sepa qué exigir. */
export const RUTAS_MOVILES_APP = [
  "/m",
  "/m/configurar",
  "/m/deudas",
  "/m/gastos",
  "/m/indicadores",
  "/m/ingresos",
  "/m/inversiones",
  "/m/libertad",
  "/m/metas",
  "/m/mi-base-financiera",
  "/m/mis-acciones",
  "/m/patrimonio",
  "/m/perfil",
  "/m/proteccion",
  "/m/transacciones",
] as const;

export { ESPEJO_MOVIL };

/** Gemelas móviles de una ruta web. Vacío si no tiene. */
export function espejoMovil(path: string): readonly string[] {
  const exacta = ESPEJO_MOVIL[path];
  if (exacta) return exacta;
  // Rutas dinámicas (`/deudas/<id>`): el móvil no tiene pantalla de detalle, así
  // que repinta la lista de su raíz.
  const raiz = `/${path.split("/")[1] ?? ""}`;
  return raiz !== path ? (ESPEJO_MOVIL[raiz] ?? []) : [];
}

/**
 * Revalida una ruta Y sus gemelas móviles. Reemplazo directo de `revalidatePath`
 * en las server actions: misma firma, mismo efecto, más el árbol `/m`.
 */
export function revalidarRuta(path: string): void {
  revalidatePath(path);
  for (const movil of espejoMovil(path)) revalidatePath(movil);
}

/** Varias rutas de una (azúcar para las acciones que revalidan un puñado). */
export function revalidarRutas(...paths: string[]): void {
  for (const p of paths) revalidarRuta(p);
}
