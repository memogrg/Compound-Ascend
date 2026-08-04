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
    // El id viaja para poder distinguir dos movimientos que se ven idénticos en la tabla.
    id: t.id,
    kind: t.kind,
    amount: t.amount,
    currency: t.currency,
    occurredOn: t.occurredOn,
    merchantOrSource: t.merchantOrSource,
    description: t.description,
    categoryId: t.categoryId,
  }));

  const comercio = str(args.comercio);
  const sobreArg = str(args.sobre);
  // `termino` lo pone el ruteo determinista cuando no sabe si el texto es un comercio o un sobre.
  // Antes se leía `args.comercio`/`args.sobre` y nada más, así que ese filtro se perdía en el
  // camino y la consulta salía sin acotar: se aplica igual que los otros.
  const termino = str(args.termino);

  // ── Resolución del SOBRE contra los sobres REALES del usuario ──
  // Nada hardcodeado: la lista sale de listSobresForKind, la misma fuente del selector del chat,
  // así que incluye los de fábrica y los que él creó. Si nombró un sobre y no se puede resolver,
  // se DICE — nunca se cae a "sin filtro", que respondería con todas las categorías.
  let categoriaIds: string[] | null = null;
  let sobreLabel = sobreArg;
  /** Aviso cuando se consultaron VARIOS sobres del mismo nombre (va arriba de la tabla). */
  let avisoVarios: string | null = null;
  /** Los sobres efectivamente consultados, para el subtotal por sobre. */
  let sobresElegidos: { id: string; sobre: string }[] = [];
  if (sobreArg) {
    // listAllSobresForKind y NO listSobresForKind: esta última recorta a los sobres "adoptados"
    // (configurados ∪ presupuestados o usados ESTE MES) porque responde "¿a qué sobre cargo un
    // gasto hoy?". Para una consulta HISTÓRICA ese recorte es el error: un sobre usado en julio y
    // no en agosto quedaba fuera y el nombre no resolvía.
    const { listAllSobresForKind } = await import("@/modules/financial-base");
    const { matchSobre, rutaSobre } = await import("@/lib/ai/sobre-match");
    const sobres = await listAllSobresForKind(tipo === "ingreso" ? "ingreso" : "gasto").catch(
      () => [],
    );
    const m = matchSobre(sobreArg, sobres);
    // VARIOS sobres que son el mismo concepto ("Supermercado" y "Supermercados"): se consultan
    // JUNTOS y se avisa. Preguntar "¿cuál?" ante dos nombres que significan lo mismo no tiene
    // respuesta buena — y antes, si el usuario contestaba "los dos", la consulta se perdía.
    //
    // `incluirTodos` es la respuesta explícita a una pregunta de ambigüedad ("dame los dos"): ahí
    // se consultan todos los candidatos aunque signifiquen cosas distintas, porque lo pidió.
    const incluirTodos = args.incluirTodos === true;
    if (m.estado === "varios" || (m.estado === "ambiguo" && incluirTodos)) {
      const elegidos = m.estado === "varios" ? m.sobres : m.candidatos;
      categoriaIds = elegidos.map((s) => s.id);
      sobreLabel = elegidos.map(rutaSobre).join(" + ");
      avisoVarios =
        m.estado === "varios"
          ? `Tenés ${elegidos.length} sobres con el mismo nombre (${elegidos.map((s) => s.sobre).join(" y ")}); te muestro los dos juntos.`
          : null;
      sobresElegidos = elegidos;
    } else if (m.estado === "ambiguo") {
      const opciones = m.candidatos.slice(0, 5).map(rutaSobre);
      return {
        ...vacio(rango, tipo, moneda, { comercio, sobre: sobreArg, termino }),
        resumen_md: `Tenés varios sobres que coinciden con «${sobreArg}»: ${opciones.join(", ")}. ¿Cuál querés ver?`,
      };
    }
    else if (m.estado === "sin_match") {
      return {
        ...vacio(rango, tipo, moneda, { comercio, sobre: sobreArg, termino }),
        // Se dice que NO SE ENCONTRÓ EL SOBRE, que es distinto de "no tenés movimientos": lo
        // segundo afirma sobre los datos y sería mentira si el sobre existe con otro nombre.
        resumen_md: `No encontré un sobre que se llame «${sobreArg}». Revisá el nombre o pedime la lista de tus sobres.`,
      };
    } else if (m.estado === "resuelto") {
      categoriaIds = [m.sobre.id];
      sobreLabel = rutaSobre(m.sobre);
    }

    // Si se nombró un sobre y la resolución NO produjo filtro, se DICE. Antes esto caía a una
    // consulta sin acotar (todas las categorías) o a un "no tenés movimientos" que afirma sobre
    // los datos sin haber podido filtrarlos.
    if (!categoriaIds) {
      return {
        ...vacio(rango, tipo, moneda, { comercio, sobre: sobreArg, termino }),
        resumen_md: `No pude resolver el sobre «${sobreArg}» contra tus sobres. Pedime la lista y lo vemos.`,
      };
    }
  }

  const filtradas = filtrarTransacciones(
    txns,
    { tipo, comercio, sobre: sobreArg, termino, categoriaIds },
    nombres,
  );

  const resultado = agregarTransacciones(filtradas, {
    rango,
    tipo,
    agrupacion,
    orden,
    tope,
    moneda,
    rates,
    nombresPorCategoria: nombres,
    // La etiqueta que ve el usuario es la del sobre REAL ("Vivir › Restaurantes"), no lo que
    // escribió: confirma contra qué se filtró.
    filtros: { comercio, sobre: sobreLabel, termino },
  });

  const md = renderConsulta(resultado, {
    nombresPorCategoria: nombres,
    porSobre: sobresElegidos.length > 1 ? sobresElegidos : undefined,
  });
  return { ...resultado, resumen_md: avisoVarios ? `${avisoVarios}

${md}` : md };
}

/**
 * Atiende el "dame los dos" que viene DESPUÉS de una pregunta de ambigüedad de sobres.
 *
 * Re-deriva la consulta ORIGINAL desde el hilo —el último mensaje del usuario que rutea al libro
 * diario con un sobre— y la vuelve a correr con `incluirTodos`. Mismo patrón que la confirmación
 * del estado de cuenta: sin estado en memoria (inútil en serverless) ni tabla nueva.
 *
 * `null` si no hay una consulta así en la conversación reciente: ahí "los dos" no significa esto
 * y la frase debe escalar.
 */
export async function resolverConsultaVarios(
  moneda: string,
): Promise<ConsultaTransaccionesPayload | null> {
  const { loadRetainedChat } = await import("@/lib/ai/chat-store");
  const { matchIntent } = await import("@/lib/ai/router");
  const hilo = await loadRetainedChat().catch(() => []);
  for (const m of [...hilo].reverse()) {
    if (m.role !== "user") continue;
    const r = matchIntent(m.content);
    if (r?.intent === "consulta_transacciones" && r.params.sobre) {
      return consultarTransacciones({ ...r.params, incluirTodos: true }, moneda);
    }
  }
  return null;
}

/** Resultado vacío para los cortes tempranos (sobre ambiguo o inexistente). */
function vacio(
  rango: ConsultaResult["rango"],
  tipo: TipoTxn,
  moneda: string,
  filtros: ConsultaResult["filtros"],
): ConsultaResult {
  return {
    rango,
    tipo,
    agrupacion: "ninguna",
    moneda,
    conteo: 0,
    total: null,
    subtotalesGenerales: [],
    grupos: [],
    movimientos: [],
    filtros,
  };
}
