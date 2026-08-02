import "server-only";
/**
 * Puente entre la herramienta `consultar_transacciones` y la BD: resuelve el periodo
 * en la zona del PERFIL, lee el libro diario con scope de hogar (RLS vía sesión) y
 * delega TODO el cálculo al motor puro de `transactions-query.ts`.
 *
 * Solo lectura. Best-effort en lo accesorio (nombres de sobres, tasas FX): si algo de
 * eso falla, la consulta sigue y el motor degrada con honestidad (subtotales por
 * moneda en vez de un total inventado).
 */
import { listTransactions, getCategoryNameMap } from "@/modules/financial-base";
import { userToday } from "@/lib/time/user-time";
import { getFxRates } from "@/lib/market-data/fx-rates";
import {
  resolverRango,
  rangoDosMeses,
  filtrarTransacciones,
  agregarTransacciones,
  renderConsulta,
  type Agrupacion,
  type ConsultaResult,
  type Orden,
  type TipoTxn,
  type TxnLike,
} from "@/lib/ai/transactions-query";

/** El resultado que ve el modelo: los datos + el texto ya renderizado (lo pasa tal cual). */
export type ConsultaTransaccionesPayload = ConsultaResult & { resumen_md: string };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const AGRUPACIONES: Agrupacion[] = ["ninguna", "dia", "semana", "mes", "categoria", "comercio"];
const ORDENES: Orden[] = ["monto_desc", "monto_asc", "fecha_desc", "fecha_asc"];

/**
 * Ejecuta la consulta. `moneda` es la de VISUALIZACIÓN (la que el usuario está viendo),
 * igual que el resto del chat desde #560.
 */
export async function consultarTransacciones(
  args: Record<string, unknown>,
  moneda: string,
): Promise<ConsultaTransaccionesPayload> {
  const hoy = await userToday();

  // "mes_y_anterior" es el atajo de comparación: cubre el mes pasado completo + lo que va
  // del actual, y fuerza agrupación mensual para que la respuesta traiga los dos números.
  const periodo = str(args.periodo);
  const esComparacion = periodo === "mes_y_anterior" || periodo === "mes_vs_pasado";
  const rango = esComparacion
    ? rangoDosMeses(hoy)
    : resolverRango(periodo, hoy, str(args.desde), str(args.hasta));

  const tipoArg = str(args.tipo);
  const tipo: TipoTxn =
    tipoArg === "gasto" || tipoArg === "ingreso" || tipoArg === "todos" ? tipoArg : "todos";

  const agrupacionArg = str(args.agrupacion) as Agrupacion | null;
  const agrupacion: Agrupacion = esComparacion
    ? "mes"
    : agrupacionArg && AGRUPACIONES.includes(agrupacionArg)
      ? agrupacionArg
      : "ninguna";

  const ordenArg = str(args.orden) as Orden | null;
  const orden = ordenArg && ORDENES.includes(ordenArg) ? ordenArg : undefined;
  const tope = typeof args.tope === "number" && Number.isFinite(args.tope) ? args.tope : undefined;

  // `listTransactions` filtra por rango con `period.from/to`; month/year solo etiquetan.
  const [y, m] = rango.from.split("-").map(Number);
  const period = { month: m ?? 1, year: y ?? 1970, from: rango.from, to: rango.to, label: rango.etiqueta };

  // El filtro de `kind` se aplica en la BD cuando es concreto (menos filas que traer);
  // el resto (comercio, sobre) es texto libre y va en el motor puro.
  const filtroBD = tipo === "todos" ? {} : { kind: tipo as "gasto" | "ingreso" };
  const filas = await listTransactions(period, filtroBD);

  const [nombres, rates] = await Promise.all([
    getCategoryNameMap().catch(() => ({}) as Record<string, string>),
    getFxRates().catch(() => null),
  ]);

  const txns: TxnLike[] = filas.map((t) => ({
    kind: t.kind,
    amount: t.amount,
    currency: t.currency,
    occurredOn: t.occurredOn,
    merchantOrSource: t.merchantOrSource,
    description: t.description,
    categoryId: t.categoryId,
  }));

  const comercio = str(args.comercio);
  const sobre = str(args.sobre);
  const filtradas = filtrarTransacciones(txns, { tipo, comercio, sobre }, nombres);

  const resultado = agregarTransacciones(filtradas, {
    rango,
    tipo,
    agrupacion,
    orden,
    tope,
    moneda,
    rates,
    nombresPorCategoria: nombres,
    filtros: { comercio, sobre },
  });

  return { ...resultado, resumen_md: renderConsulta(resultado) };
}
