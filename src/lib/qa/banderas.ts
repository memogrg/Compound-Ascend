/**
 * Con qué banderas de interfaz se COMPILÓ este build, para que una captura pueda decirlo.
 *
 * Existe por una comparación que no valía nada y parecía válida: la línea base se compiló con
 * `NEXT_PUBLIC_NAV_V2=1` y la rama sin ella, así que un PR de dos textos salió con 169 de 200
 * capturas distintas. La navegación entera era otra; el diff no mentía, pero no medía el PR.
 *
 * No hay forma de averiguarlo mirando el artefacto: Turbopack pliega `process.env.X === "1"` al
 * compilar y la rama muerta desaparece, así que el valor **no deja rastro textual** en el
 * bundle (buscarlo fue el primer intento, y pasaba con la bandera apagada). El único que sabe
 * con qué se compiló es el propio build, y esto es lo que lo hace decirlo: `next.config.ts`
 * mete el resultado en una cabecera de respuesta, y quien captura la guarda en el manifiesto.
 *
 * **Solo banderas de INTERFAZ, y por lista explícita.** No entra ninguna URL ni ninguna clave:
 * no porque sean secretas —un `NEXT_PUBLIC_*` viaja en el bundle de todos modos— sino porque
 * lo que invalida una comparación visual es que la pantalla sea otra, y eso lo deciden estas.
 */

/** Las banderas que cambian lo que se ve. Añadir una nueva bandera de UI es añadirla aquí. */
export const BANDERAS_UI = ["NEXT_PUBLIC_NAV_V2"] as const;

/** Cómo se llama la cabecera que las transporta. */
export const CABECERA_BANDERAS = "x-cartera-banderas";

/** Lo que dice la cabecera cuando no había ninguna encendida. No se deja vacía: vacío es ambiguo. */
export const SIN_BANDERAS = "(ninguna)";

/**
 * Las banderas presentes, sin el prefijo `NEXT_PUBLIC_`.
 *
 * Una bandera vacía cuenta como AUSENTE: `NEXT_PUBLIC_NAV_V2=` es lo que deja un `env:` de CI
 * sin valor, y tratarla como presente diría que dos builds difieren cuando no difieren.
 */
export function banderasDeCompilacion(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const nombre of BANDERAS_UI) {
    const valor = env[nombre];
    if (valor === undefined || valor === "") continue;
    salida[nombre.replace(/^NEXT_PUBLIC_/, "")] = valor;
  }
  return salida;
}

/**
 * El valor de la cabecera: `NAV_V2=1` (varias, separadas por `; `) o `(ninguna)`.
 *
 * Orden fijo —el de `BANDERAS_UI`— para que dos builds con el mismo entorno den la MISMA
 * cadena: el diff compara cadenas antes de mirar nombre por nombre.
 */
export function cabeceraBanderas(env: Record<string, string | undefined> = process.env): string {
  const b = banderasDeCompilacion(env);
  const partes = Object.entries(b).map(([k, v]) => `${k}=${v}`);
  return partes.length === 0 ? SIN_BANDERAS : partes.join("; ");
}
