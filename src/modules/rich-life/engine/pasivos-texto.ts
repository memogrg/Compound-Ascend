/**
 * Qué dice la tarjeta «Mis pasivos». Puro.
 *
 * El problema que arregla: la tarjeta contaba solo los pasivos MANUALES, así que alguien con
 * cuatro deudas cargadas en Planes · Deudas leía «0 registrado(s)» y, debajo, «Agrega
 * hipotecas u otras deudas grandes». Le estábamos diciendo que no tiene deudas justo en la
 * pantalla que resume su patrimonio — y a la vez esas deudas SÍ estaban restando en el neto
 * de arriba. Dos números incompatibles en la misma pantalla.
 *
 * Las deudas se cuentan pero no se editan acá: se gestionan en su módulo, y poder escribirlas
 * desde dos sitios daría dos verdades del mismo saldo.
 */
import { formatMoney } from "@/lib/format";

export type TextoPasivos = {
  /** Lo que va bajo el título. */
  sub: string;
  /** Aviso sobre las deudas del módulo, si las hay. */
  deudas: { texto: string; href: string } | null;
  /** Texto cuando no hay NADA que mostrar en la lista editable. */
  vacio: string;
};

export function textoPasivos(
  manuales: number,
  deudas: { cantidad: number; total: number },
  moneda: string,
): TextoPasivos {
  const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

  // El conteo de arriba no puede decir 0 si hay deudas: es el número que la persona compara
  // con el neto. Cuando las hay, manda el total de los dos orígenes.
  const total = manuales + deudas.cantidad;
  const sub =
    deudas.cantidad > 0
      ? `${total} ${plural(total, "pasivo", "pasivos")} · ${manuales} ${plural(manuales, "manual", "manuales")}`
      : `${manuales} ${plural(manuales, "registrado", "registrados")}`;

  return {
    sub,
    deudas:
      deudas.cantidad > 0
        ? {
            texto: `${plural(deudas.cantidad, "Tu", "Tus")} ${deudas.cantidad} ${plural(deudas.cantidad, "deuda", "deudas")} (${formatMoney(deudas.total, moneda)}) se ${plural(deudas.cantidad, "gestiona", "gestionan")} en Planes · Deudas`,
            href: "/deudas",
          }
        : null,
    // El vacío cambia según haya deudas o no: «Agrega hipotecas u otras deudas grandes» sería
    // un consejo absurdo para quien acaba de leer que tiene cuatro.
    vacio:
      deudas.cantidad > 0
        ? "Acá van los pasivos que no son deudas del módulo: una hipoteca que llevás aparte, un préstamo familiar."
        : "Agrega hipotecas u otras deudas grandes.",
  };
}
