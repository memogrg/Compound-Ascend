/**
 * CONCILIACIÓN de un estado de cuenta pegado contra lo YA registrado.
 *
 * Puro: el caller trae las filas parseadas y las transacciones del rango; acá solo se decide qué
 * está y qué falta. Sin IO, así que el criterio se puede probar exhaustivamente — y hace falta,
 * porque los dos errores posibles son caros en direcciones opuestas: marcar como REGISTRADA algo
 * que no está deja al usuario con un gasto sin anotar; marcar como FALTANTE algo que sí está lo
 * lleva a registrarlo dos veces.
 */

import type { StatementRow } from "@/lib/ai/statement-parse";

/** Lo mínimo que se necesita de una transacción ya registrada. */
export type RegistradaLike = {
  id: string;
  amount: number;
  currency: string;
  occurredOn: string; // YYYY-MM-DD
  merchantOrSource: string | null;
  description: string | null;
  kind: string;
};

export type EstadoFila = "registrada" | "faltante";

export type FilaConciliada = {
  fila: StatementRow;
  estado: EstadoFila;
  /** id de la transacción que la cubre (solo si `registrada`). */
  matchId?: string;
  /** ¿El comercio también coincidió? Es CONFIANZA, no condición del match. */
  comercioCoincide?: boolean;
};

export type Conciliacion = {
  filas: FilaConciliada[];
  registradas: number;
  faltantes: number;
};

/** Días de tolerancia entre la fecha del estado y la de la transacción registrada. */
export const TOLERANCIA_DIAS = 3;
/** Tolerancia de monto: centavos por redondeo, no diferencias reales. */
const TOLERANCIA_MONTO = 0.02;

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Días absolutos entre dos ISO (sin `new Date(str)`: evita el corrimiento por zona). */
export function diasEntre(a: string, b: string): number {
  const t = (iso: string): number => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.abs(Math.round((t(a) - t(b)) / 86_400_000));
}

/**
 * ¿Los nombres se parecen? Se compara por PALABRAS y no por substring: "SUBWAY LAGUNILLA" y
 * "Subway" comparten token, mientras que un substring ingenuo emparejaría "POPS" con "POPSICLE".
 * Es solo confianza — un match no depende de esto.
 */
function comerciosCoinciden(a: string, b: string): boolean {
  const A = new Set(
    normalizar(a)
      .split(" ")
      .filter((w) => w.length > 2),
  );
  const B = new Set(
    normalizar(b)
      .split(" ")
      .filter((w) => w.length > 2),
  );
  if (A.size === 0 || B.size === 0) return false;
  for (const w of A) if (B.has(w)) return true;
  return false;
}

const etiquetaDe = (t: RegistradaLike): string =>
  `${t.merchantOrSource ?? ""} ${t.description ?? ""}`.trim();

/**
 * Concilia. Reglas:
 *
 * - Un match exige MISMA MONEDA, monto igual (±centavos) y fecha dentro de TOLERANCIA_DIAS. El
 *   comercio NO es condición: los bancos escriben "SUBWAY LAGUNILLA #221" donde el usuario anotó
 *   "Subway", y exigirlo llenaría el reporte de falsos faltantes.
 * - Cada transacción registrada se CONSUME una sola vez. Sin esto, dos cargos idénticos en días
 *   distintos (el mismo café dos veces) matchearían ambos contra el único registro que existe, y
 *   el segundo se reportaría como registrado sin estarlo.
 * - Entre varios candidatos gana el que COINCIDE EN COMERCIO; a igualdad, el más cercano en fecha.
 *   Así, con dos cargos del mismo monto el mismo día, cada uno se queda con el suyo.
 */
export function conciliar(
  filas: StatementRow[],
  registradas: RegistradaLike[],
  toleranciaDias: number = TOLERANCIA_DIAS,
): Conciliacion {
  const usadas = new Set<string>();
  const out: FilaConciliada[] = [];

  for (const fila of filas) {
    const kind = fila.tipo;
    const candidatos = registradas
      .filter((t) => !usadas.has(t.id))
      .filter((t) => t.kind === kind)
      .filter((t) => t.currency === fila.moneda)
      .filter((t) => Math.abs(t.amount - fila.monto) <= TOLERANCIA_MONTO)
      .filter((t) => diasEntre(t.occurredOn, fila.fecha) <= toleranciaDias)
      .map((t) => ({
        t,
        mismoComercio: comerciosCoinciden(fila.comercio, etiquetaDe(t)),
        dist: diasEntre(t.occurredOn, fila.fecha),
      }))
      .sort((a, b) =>
        a.mismoComercio !== b.mismoComercio ? (a.mismoComercio ? -1 : 1) : a.dist - b.dist,
      );

    const mejor = candidatos[0];
    if (!mejor) {
      out.push({ fila, estado: "faltante" });
      continue;
    }
    usadas.add(mejor.t.id);
    out.push({
      fila,
      estado: "registrada",
      matchId: mejor.t.id,
      comercioCoincide: mejor.mismoComercio,
    });
  }

  return {
    filas: out,
    registradas: out.filter((f) => f.estado === "registrada").length,
    faltantes: out.filter((f) => f.estado === "faltante").length,
  };
}

/**
 * Colapsa filas del MISMO pegado que son el mismo movimiento listado dos veces.
 *
 * El caso real: el usuario pega un export que trae la misma compra en DOS formatos —la fila
 * tabular limpia y la fila "sucia" con fecha de posteo y ruido del banco—:
 *
 *   2026-07-25   POPS LAGUNILLA HEREDIA   4,100.00  COL  D
 *   27/07/2026   4,100.00   25-07-2026 POPS LAGUNILLA HEREDIA HEREDIA CRI/BNCR
 *
 * El extractor produce dos filas correctas, el conciliador empareja la primera con la transacción
 * registrada, la CONSUME, y la segunda se queda sin candidato → "falta" → se registra de nuevo.
 * Así se duplicó un POPS de ₡4.100.
 *
 * El criterio distingue este caso del duplicado LEGÍTIMO: se colapsa solo si los comercios son
 * DISTINTOS pero uno contiene al otro ("POPS LAGUNILLA" ⊂ "POPS LAGUNILLA HEREDIA") — dos
 * grafías del mismo negocio. Si el texto es IDÉNTICO son dos consumos de verdad (dos cafés el
 * mismo día por el mismo monto existen) y se conservan los dos.
 *
 * Devuelve también las colapsadas, para poder decírselo al usuario en vez de descontarlas calladas.
 */
export function dedupeFilas(filas: StatementRow[]): {
  filas: StatementRow[];
  colapsadas: StatementRow[];
} {
  const out: StatementRow[] = [];
  const colapsadas: StatementRow[] = [];

  for (const f of filas) {
    const gemela = out.find((o) => {
      if (o.fecha !== f.fecha || o.moneda !== f.moneda || o.tipo !== f.tipo) return false;
      if (Math.abs(o.monto - f.monto) > TOLERANCIA_MONTO) return false;
      const a = normalizar(o.comercio);
      const b = normalizar(f.comercio);
      if (a === b) return false; // grafía idéntica → dos consumos reales, no se colapsan
      return a.includes(b) || b.includes(a);
    });
    if (gemela) {
      // Se conserva la grafía MÁS LARGA: trae más señal para conciliar contra lo registrado.
      if (f.comercio.length > gemela.comercio.length) gemela.comercio = f.comercio;
      colapsadas.push(f);
      continue;
    }
    out.push({ ...f });
  }
  return { filas: out, colapsadas };
}

/** Rango [min, max] de fechas del bloque — lo que hay que leer de la BD para conciliar. */
export function rangoDeFilas(
  filas: StatementRow[],
  toleranciaDias: number = TOLERANCIA_DIAS,
): { from: string; to: string } | null {
  if (filas.length === 0) return null;
  const fechas = filas.map((f) => f.fecha).sort();
  return {
    from: correrDias(fechas[0]!, -toleranciaDias),
    to: correrDias(fechas[fechas.length - 1]!, toleranciaDias),
  };
}

function correrDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + dias));
  return t.toISOString().slice(0, 10);
}
