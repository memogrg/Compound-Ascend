/**
 * Copy de frecuencia y monto — motor puro, compartido por web y móvil.
 *
 * Existe para matar la ambigüedad que originó el bug: un campo llamado sólo
 * "Monto" no dice si el usuario debe escribir la quincena o el mes. Acá la
 * etiqueta CAMBIA con la frecuencia ("Monto por quincena") y el formulario
 * muestra en vivo el equivalente mensual, para que el usuario vea cómo se
 * interpreta lo que escribió y lo corrija al instante.
 *
 * Sin conjugaciones en 2ª persona: la web usa voseo y el móvil es-MX, así que
 * este copy es deliberadamente neutro y sirve a las dos superficies.
 */
import { esSubMensual, mesesEntrePagos, monthlyize, type Frequency } from "./monthlyize";

/** Etiqueta del campo de monto, anclada a la frecuencia. */
export function etiquetaMonto(frequency: Frequency): string {
  switch (frequency) {
    case "diario":
      return "Monto por día";
    case "semanal":
      return "Monto por semana";
    case "quincenal":
      return "Monto por quincena";
    case "mensual":
      return "Monto por mes";
    case "bimensual":
      return "Monto por pago (cada 2 meses)";
    case "trimestral":
      return "Monto por pago (cada 3 meses)";
    case "cuatrimestral":
      return "Monto por pago (cada 4 meses)";
    case "semestral":
      return "Monto por pago (cada 6 meses)";
    case "anual":
      return "Monto por pago (una vez al año)";
    case "unico":
      return "Monto";
    case "variable":
      return "Monto estimado por mes";
    default:
      return "Monto";
  }
}

/** Ayuda corta bajo el campo: qué se espera exactamente. */
export function ayudaMonto(frequency: Frequency): string | null {
  if (frequency === "unico" || frequency === "mensual") return null;
  if (frequency === "variable") return "Un estimado de lo que entra en un mes típico.";
  if (esSubMensual(frequency)) return "Lo que llega en UN pago, no el total del mes.";
  return "Lo que llega en UN pago, no un prorrateo mensual.";
}

/**
 * Vista previa del equivalente mensual. `formatear` viene de la superficie
 * (formatMoney con la moneda elegida) para no acoplar el motor al formato.
 *
 * En multi-mes se dice "en promedio" a propósito: el dinero no llega todos los
 * meses, el promedio es sólo para los indicadores.
 */
export function equivalenteMensual(
  amount: number,
  frequency: Frequency,
  formatear: (n: number) => string,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (frequency === "mensual" || frequency === "unico" || frequency === "variable") return null;

  const mensual = monthlyize(amount, frequency);
  if (esSubMensual(frequency)) return `= ${formatear(mensual)}/mes`;

  const cada = mesesEntrePagos(frequency);
  return `= ${formatear(mensual)}/mes en promedio (llega cada ${cada} meses)`;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Nombre del mes (1-12) en minúscula, para la vista previa de la agenda. */
export function nombreMes(month: number): string {
  return MESES[month - 1] ?? "";
}
