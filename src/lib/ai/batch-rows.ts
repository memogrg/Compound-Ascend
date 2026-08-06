/**
 * Filas EDITABLES del alta en lote (la tarjeta de confirmación de la conciliación).
 *
 * Puro y sin React: la tarjeta solo pinta lo que estas funciones deciden, así que las reglas se
 * pueden probar exhaustivamente sin montar un DOM.
 *
 * Por qué editable, y no solo el sobre. Las filas salen de un estado de cuenta PEGADO, leído por
 * un parser determinista o por el LLM. Los dos se equivocan de formas distintas y conocidas: el
 * comercio arrastra ruido del banco ("OCN00PHEREDIA" pegado al nombre), un monto puede leerse mal
 * cuando la fila trae también el saldo, y la moneda se asume del estado. Corregirlo DESPUÉS
 * significa editar N transacciones ya registradas de a una.
 *
 * Lo que sale de acá es EXACTAMENTE lo que se registra: `aPayload` toma los valores editados y el
 * LLM no vuelve a intervenir. La confirmación es determinista.
 */

/** Fila tal como la deja el conciliador en la propuesta de acción. */
export type BatchRowInput = {
  kind: "gasto" | "ingreso";
  description: string;
  amount: number;
  currency: string;
  occurredOn: string;
  categoryId: string | null;
  categoryPath: string | null;
};

/**
 * Fila en edición. `amountText` es texto y no número a propósito: mientras se escribe, el campo
 * pasa por estados que no son un número válido ("", "12.", "-") y forzarlos a número borraría lo
 * que el usuario está tecleando.
 */
export type BatchRowDraft = BatchRowInput & { uid: string; amountText: string };

export type RowErrors = {
  fecha?: string;
  comercio?: string;
  monto?: string;
  sobre?: string;
};

const MAX_DESC = 160;

/** Formatea un número para el campo de texto sin notación científica ni ceros de más. */
function montoATexto(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "";
  return String(Math.round(n * 100) / 100);
}

/**
 * Normaliza lo que viene en la propuesta de acción a filas editables. Tolerante: la propuesta
 * viaja como JSON sin tipar, y una fila rota tiene que llegar a la tarjeta MARCADA para que el
 * usuario la corrija — no descartarse en silencio, que es cómo se pierden movimientos.
 */
export function normalizarFilas(raw: unknown): BatchRowDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const amount =
      typeof o.amount === "number" && Number.isFinite(o.amount) ? Math.abs(o.amount) : 0;
    return {
      uid: `f${i}`,
      kind: o.kind === "ingreso" ? "ingreso" : "gasto",
      description: typeof o.description === "string" ? o.description : "",
      amount,
      amountText: montoATexto(amount),
      currency: typeof o.currency === "string" && o.currency.length === 3 ? o.currency : "CRC",
      occurredOn: typeof o.occurredOn === "string" ? o.occurredOn : "",
      categoryId: typeof o.categoryId === "string" ? o.categoryId : null,
      categoryPath: typeof o.categoryPath === "string" ? o.categoryPath : null,
    };
  });
}

/** ¿Es una fecha real en formato ISO? Rechaza 2026-02-31, que `new Date` acepta corriéndola. */
export function fechaValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Monto tecleado → número. Acepta la coma decimal (se escribe así en Costa Rica) y los separadores
 * de miles. `null` si no hay un número utilizable.
 */
export function parsearMonto(texto: string): number | null {
  const s = texto.trim();
  if (!s) return null;
  // El signo se CONSERVA para que `validarFila` lo rechace. Tirarlo acá convertiría un "-100"
  // tecleado en 100 sin decir nada, y en un campo de plata una corrección silenciosa es peor que
  // un error visible: el signo de un movimiento lo da su tipo (gasto/ingreso), no lo que se
  // escriba en el monto. (Los negativos que trae el BANCO sí se normalizan, pero eso pasa antes,
  // en `normalizarFilas`.)
  const negativo = s.startsWith("-");
  // Si trae coma Y punto, el ÚLTIMO que aparece es el decimal.
  const iComa = s.lastIndexOf(",");
  const iPunto = s.lastIndexOf(".");
  let limpio: string;
  if (iComa >= 0 && iPunto >= 0) {
    limpio = iComa > iPunto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (iComa >= 0) {
    // Una coma sola: decimal si deja 1-2 dígitos detrás ("3900,5"), miles si deja 3 ("3,900").
    limpio = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else {
    limpio = s;
  }
  limpio = limpio.replace(/[^\d.]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/**
 * Errores de una fila. Vacío = lista para registrar. Espeja `batchTransactionsInputSchema`, que es
 * lo que el servidor va a exigir igual: mejor decirlo en la tarjeta que fallar fila por fila
 * después de tocar "Registrar".
 */
export function validarFila(r: BatchRowDraft): RowErrors {
  const e: RowErrors = {};

  if (!r.occurredOn.trim()) e.fecha = "Falta la fecha";
  else if (!fechaValida(r.occurredOn)) e.fecha = "Fecha inválida";

  const desc = r.description.trim();
  if (!desc) e.comercio = "Falta el comercio";
  else if (desc.length > MAX_DESC) e.comercio = `Máximo ${MAX_DESC} caracteres`;

  const monto = parsearMonto(r.amountText);
  if (monto === null) e.monto = "Falta el monto";
  else if (monto <= 0) e.monto = "El monto tiene que ser mayor que cero";

  if (!r.categoryId) e.sobre = "Elegí un sobre";

  return e;
}

export function filaValida(r: BatchRowDraft): boolean {
  return Object.keys(validarFila(r)).length === 0;
}

/** Cuántas filas están listas y cuántas tienen algo que corregir. */
export function resumenValidacion(rows: BatchRowDraft[]): { listas: number; conError: number } {
  let listas = 0;
  for (const r of rows) if (filaValida(r)) listas++;
  return { listas, conError: rows.length - listas };
}

/**
 * Filas → payload del server action. Toma los valores EDITADOS, no los originales: lo que el
 * usuario ve en la tarjeta es lo que se registra.
 */
export function aPayload(rows: BatchRowDraft[]): {
  kind: "gasto" | "ingreso";
  description: string;
  amount: number;
  currency: string;
  occurredOn: string;
  categoryId: string | null;
}[] {
  return rows.map((r) => ({
    kind: r.kind,
    description: r.description.trim(),
    amount: parsearMonto(r.amountText) ?? 0,
    currency: r.currency,
    occurredOn: r.occurredOn,
    categoryId: r.categoryId,
  }));
}
