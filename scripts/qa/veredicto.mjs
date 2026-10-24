#!/usr/bin/env node
/**
 * El criterio del veredicto visual. **Uno solo**, en un sitio.
 *
 * Había dos sitios donde se decidía «esto difiere lo suficiente»: el veredicto del diff y la
 * sonda de determinismo. La sonda nació con sus propios números y midió con delta 0 sobre medio
 * centenar de imágenes: marcó como inestables tres capturas que diferían 34, 8 y 7 píxeles con
 * delta 1 —ruido de antialiasing que el veredicto ni mira—, y dejó el arnés avisando de cosas
 * que no podían reprobar nada. Dos copias de un criterio no son dos copias: son dos criterios.
 *
 * Ahora la aprobación por tolerancia necesita el MISMO criterio por tercera vez —comparar el PNG
 * que Memo aprobó contra el de ahora—, así que el criterio se importa de acá y no se vuelve a
 * escribir. Si mañana cambia el umbral, cambia para los tres a la vez o no cambia para ninguno.
 */

/**
 * ¿Esta medida reprueba, con estos topes?
 *
 * `sizeMismatch` reprueba siempre, y no por severidad: dos imágenes de distinto tamaño no tienen
 * píxeles comparables, así que `diffPixels` no significa nada ahí. Tratarlo como «muchas
 * diferencias» sería inventarse una medida.
 */
export function reprueba(medida, topes) {
  if (!medida) return false;
  if (medida.sizeMismatch) return true;
  const px = Number(medida.diffPixels ?? 0);
  const delta = Number(medida.maxDelta ?? 0);
  return px > Number(topes.maxDiffPixels ?? 0) || delta > Number(topes.maxDelta ?? 255);
}

/** La misma frase en todas partes: el log, la página y los motivos de caducidad. */
export function describirTopes(topes) {
  return `hasta ${topes.maxDiffPixels} px Y delta ${topes.maxDelta}`;
}

/** Cómo se lee una medida concreta, para ponerla al lado del motivo. */
export function describirMedida(medida) {
  if (!medida) return "sin medida";
  if (medida.sizeMismatch)
    return `tamaño distinto (${medida.a?.w}×${medida.a?.h} vs ${medida.b?.w}×${medida.b?.h})`;
  return `${medida.diffPixels} px · delta ${medida.maxDelta}`;
}
