/**
 * DETALLE POR DOMINIO para la IA: el historial fino que los agregados del contexto no
 * traen — pagos de una deuda, aportes a una meta, compras de un activo, dividendos
 * cobrados, y de dónde salió la plata (cuentas + trazabilidad de liquidez).
 *
 * PRINCIPIO que cierra: todo dominio tiene O un agregado en el contexto O una
 * herramienta de consulta del detalle. Ningún dominio queda con "no tengo acceso".
 *
 * Puro y testeable (sin red ni BD): el service trae las filas, este módulo resuelve el
 * nombre pedido contra las entidades reales, agrega y renderiza.
 */
import { formatMoney } from "@/lib/format";
import { subtotales, subtotalesStr, convertirTotal, type Monto } from "@/lib/ai/money";
import type { AiToolDecl } from "@/lib/ai/tools";

export type Dominio = "deudas" | "metas" | "inversiones" | "dividendos" | "liquidez";

/** Entidad nombrable del dominio (deuda, meta, holding, cuenta). */
export type Entidad = { id: string; nombre: string; moneda?: string };

/** Un movimiento del detalle, ya normalizado sea cual sea su tabla de origen. */
export type Movimiento = {
  fecha: string; // YYYY-MM-DD
  etiqueta: string;
  monto: number;
  moneda: string;
  /** Matiz del movimiento ("extraordinario", "compra", "dividendo"…). Opcional. */
  nota?: string | null;
};

export type DetalleResult = {
  dominio: Dominio;
  /** Entidad resuelta, si la pregunta nombraba una. */
  entidad: Entidad | null;
  /** Nombre que el usuario pidió pero no se pudo resolver. */
  nombrePedido: string | null;
  moneda: string;
  movimientos: Movimiento[];
  conteo: number;
  total: number | null;
  subtotales: Monto[];
  /** Nombres disponibles, para sugerir cuando el pedido no resuelve. */
  disponibles: string[];
};

const TOPE_DEFAULT = 10;
const TOPE_MAX = 50;

/** Minúsculas sin tildes, para comparar nombres escritos a mano. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Resuelve el nombre pedido contra las entidades reales del usuario. Primero exacto,
 * después "empieza por", después substring en cualquier dirección (para que "bac"
 * encuentre "Tarjeta BAC" y "tarjeta bac credomatic" encuentre "Tarjeta BAC").
 * Devuelve null si no hay match — el llamador lo dice y ofrece los nombres que sí tiene.
 */
export function resolverEntidad(
  nombre: string | null | undefined,
  entidades: Entidad[],
): Entidad | null {
  if (!nombre) return null;
  const n = normalizar(nombre);
  if (!n) return null;
  const norm = entidades.map((e) => ({ e, k: normalizar(e.nombre) }));
  return (
    norm.find((x) => x.k === n)?.e ??
    norm.find((x) => x.k.startsWith(n))?.e ??
    norm.find((x) => x.k.includes(n))?.e ??
    norm.find((x) => n.includes(x.k))?.e ??
    null
  );
}

/** Ordena por fecha descendente y aplica el tope. */
export function ordenarYTopear(movs: Movimiento[], tope?: number): Movimiento[] {
  const n = Math.min(Math.max(1, tope ?? TOPE_DEFAULT), TOPE_MAX);
  return [...movs].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, n);
}

/**
 * Arma el resultado. El total sigue la disciplina de `money.ts`: solo aparece si hay
 * tasa para todas las monedas involucradas; si no, subtotales por moneda.
 *
 * OJO: el total se calcula sobre TODOS los movimientos, no sobre los topeados — "cuánto
 * le he pagado a la tarjeta" es la suma completa, aunque solo se listen los últimos 10.
 */
export function construirDetalle(
  movimientos: Movimiento[],
  opts: {
    dominio: Dominio;
    entidad?: Entidad | null;
    nombrePedido?: string | null;
    moneda: string;
    rates?: Record<string, number> | null;
    tope?: number;
    disponibles?: string[];
  },
): DetalleResult {
  const montos: Monto[] = movimientos.map((m) => ({ monto: m.monto, moneda: m.moneda }));
  const total = convertirTotal(montos, opts.moneda, opts.rates ?? null);
  return {
    dominio: opts.dominio,
    entidad: opts.entidad ?? null,
    nombrePedido: opts.nombrePedido ?? null,
    moneda: opts.moneda,
    movimientos: ordenarYTopear(movimientos, opts.tope),
    conteo: movimientos.length,
    total: total?.monto ?? null,
    subtotales: subtotales(montos),
    disponibles: opts.disponibles ?? [],
  };
}

// ---------------------------------------------------------------------------
// Render determinista
// ---------------------------------------------------------------------------

/** Cómo se nombra cada dominio en la frase. */
const SUSTANTIVO: Record<Dominio, { plural: string; vacio: string }> = {
  deudas: { plural: "pagos", vacio: "pagos registrados" },
  metas: { plural: "aportes", vacio: "aportes registrados" },
  inversiones: { plural: "compras", vacio: "compras registradas" },
  dividendos: { plural: "dividendos", vacio: "dividendos cobrados" },
  liquidez: { plural: "movimientos", vacio: "movimientos de liquidez" },
};

/** Lista de nombres disponibles, acotada, para la respuesta de "no encontré X". */
function sugerencia(disponibles: string[]): string {
  const vis = disponibles.slice(0, 6);
  if (vis.length === 0) return "";
  return ` Tenés: ${vis.join(", ")}${disponibles.length > vis.length ? "…" : ""}.`;
}

/**
 * Respuesta en español con cifras reales. Los tres caminos honestos:
 * nombre que no resuelve → lo dice y sugiere; dominio sin datos → lo dice;
 * con datos → total + últimos movimientos. Nunca "no tengo acceso".
 */
export function renderDetalle(r: DetalleResult): string {
  const s = SUSTANTIVO[r.dominio];
  const money = (n: number, cur?: string) => formatMoney(n, cur ?? r.moneda);

  if (r.nombrePedido && !r.entidad) {
    return `No encontré «${r.nombrePedido}» entre tus ${r.dominio}.${sugerencia(r.disponibles)}`;
  }

  const deQuien = r.entidad ? ` de ${r.entidad.nombre}` : "";

  if (r.conteo === 0) {
    return r.entidad
      ? `Todavía no tenés ${s.vacio} en ${r.entidad.nombre}.`
      : `Todavía no tenés ${s.vacio}.`;
  }

  const totalStr = r.total != null ? money(r.total) : subtotalesStr(r.subtotales);
  const lineas = r.movimientos.map((m) => {
    const nota = m.nota ? ` (${m.nota})` : "";
    return `• ${m.fecha} · ${m.etiqueta}: ${money(m.monto, m.moneda)}${nota}`;
  });

  const cab =
    r.conteo === r.movimientos.length
      ? `Tus ${s.plural}${deQuien}: ${totalStr} en ${r.conteo} ${r.conteo === 1 ? "movimiento" : "movimientos"}.`
      : `Tus ${s.plural}${deQuien} suman ${totalStr} en ${r.conteo} movimientos. Los ${r.movimientos.length} más recientes:`;

  return `${cab}\n${lineas.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Declaración de la herramienta
// ---------------------------------------------------------------------------

export const CONSULTAR_DETALLE_TOOL: AiToolDecl = {
  name: "consultar_detalle",
  description:
    "Consulta el DETALLE real de un dominio del usuario: pagos de una deuda, aportes a una meta, " +
    "compras de un activo, dividendos cobrados, o el movimiento de sus cuentas y liquidez (de dónde " +
    "salió o a dónde fue la plata). Devuelve el total más los movimientos individuales con fecha y " +
    "monto. Usala cuando pregunte cuánto le ha pagado a algo, cuánto ha aportado, cuál fue su último " +
    "pago, sus dividendos, o la trazabilidad de un retiro. Si el dominio no tiene datos lo dice — " +
    "NUNCA respondas que no tenés acceso a esa información. Solo lee.",
  parameters: {
    type: "object",
    properties: {
      dominio: {
        type: "string",
        enum: ["deudas", "metas", "inversiones", "dividendos", "liquidez"],
        description:
          "Qué detalle traer: 'deudas' = pagos; 'metas' = aportes; 'inversiones' = compras de un " +
          "activo; 'dividendos' = dividendos cobrados; 'liquidez' = cuentas y movimientos de saldo.",
      },
      nombre: {
        type: "string",
        description:
          "Nombre de la deuda, meta, activo o cuenta concreta (coincidencia parcial). Omitilo para " +
          "el detalle de TODO el dominio.",
      },
      tope: {
        type: "number",
        description: `Máximo de movimientos a listar (por defecto ${TOPE_DEFAULT}, máximo ${TOPE_MAX}). El total siempre se calcula sobre todos.`,
      },
    },
    required: ["dominio"],
  },
};
