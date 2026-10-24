/**
 * Geometría de la interacción. Puro: sin React, sin DOM.
 */

/** Ancho que se reserva al tooltip cuando aún no se ha medido. */
export const ANCHO_TOOLTIP_ESTIMADO = 180;

/**
 * Dónde va el tooltip cuando el puntero es grueso (dedo).
 *
 * En un teléfono el tooltip NO puede ir bajo el punto: el dedo lo tapa justo cuando se quiere
 * leer. Se ancla arriba del área de trazado y se centra sobre el punto, sujeto a los bordes
 * para que no se salga — el mismo clamp que ya hace `m-scrub-chart.tsx` en `/m`, que es donde
 * este comportamiento lleva tiempo funcionando.
 *
 * Devuelve solo la `x`: la `y` la fija el marco (arriba del área), y `position` de Recharts
 * acepta que se dé un eje y se calcule el otro.
 */
export function posicionAnclada({
  ancho,
  x,
  anchoTooltip = ANCHO_TOOLTIP_ESTIMADO,
}: {
  /** Ancho del área de trazado. */
  ancho: number;
  /** Coordenada del punto activo dentro de esa área. */
  x: number;
  anchoTooltip?: number;
}): number {
  const mitad = anchoTooltip / 2;
  // Si el tooltip es más ancho que el gráfico no hay clamp posible: se pega a la izquierda,
  // que es lo único que garantiza ver el principio del texto.
  if (anchoTooltip >= ancho) return 0;
  return Math.max(0, Math.min(ancho - anchoTooltip, x - mitad));
}
