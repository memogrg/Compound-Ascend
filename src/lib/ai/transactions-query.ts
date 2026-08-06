/**
 * CONSULTA DEL LIBRO DIARIO para la IA: filtra y agrega transacciones REALES por
 * fecha/periodo/tipo/sobre/comercio. Puro y testeable (sin red ni BD): el llamador
 * trae las filas y las tasas FX, este módulo solo filtra, agrupa y renderiza.
 *
 * REGLA DE ORO (igual que el resto de las tools): SOLO lee/calcula, nunca escribe, y
 * nunca inventa una cifra. Un periodo sin movimientos responde "no tenés movimientos
 * en ese periodo" — jamás "no tengo acceso", que era la respuesta que motivó esto.
 *
 * DISCIPLINA DE MONEDA (misma que `money.ts`): las transacciones traen su propia
 * moneda. El total convertido SOLO aparece si hay tasa para TODAS las monedas del
 * grupo; si falta una, `total` queda null y se muestran los subtotales por moneda.
 * Nunca se etiquetan colones como dólares.
 */
import { formatMoney } from "@/lib/format";
import { convertirTotal, subtotales, subtotalesStr, type Monto } from "@/lib/ai/money";
import type { AiToolDecl } from "@/lib/ai/tools";

/** Fila mínima que necesita la consulta (subconjunto de `Transaction`). */
export type TxnLike = {
  /**
   * id de la fila. Opcional (los tests puros arman filas sin él) y solo se usa para DISTINGUIR
   * movimientos que se ven idénticos: mismo día, mismo comercio, mismo monto. Sin esto, dos
   * consumos reales en el mismo lugar el mismo día parecen un error de la app.
   */
  id?: string;
  kind: string;
  amount: number;
  currency: string;
  occurredOn: string; // YYYY-MM-DD
  merchantOrSource: string | null;
  description: string | null;
  categoryId: string | null;
};

export type Agrupacion = "ninguna" | "dia" | "semana" | "mes" | "categoria" | "comercio";
export type Orden = "monto_desc" | "monto_asc" | "fecha_desc" | "fecha_asc";
export type TipoTxn = "gasto" | "ingreso" | "todos";

/** Rango de fechas resuelto, con la etiqueta en español que verá el usuario. */
export type Rango = { from: string; to: string; etiqueta: string };

export type Grupo = {
  clave: string;
  etiqueta: string;
  /** Total en la moneda de visualización; null si faltó alguna tasa (ver disciplina arriba). */
  total: number | null;
  subtotales: Monto[];
  conteo: number;
};

export type ConsultaResult = {
  rango: Rango;
  tipo: TipoTxn;
  agrupacion: Agrupacion;
  moneda: string;
  conteo: number;
  /** Total general; null si no se pudo convertir todo honestamente. */
  total: number | null;
  subtotalesGenerales: Monto[];
  grupos: Grupo[];
  /**
   * Movimientos individuales (solo con agrupacion="ninguna"), ya topeados.
   * `montoConvertido` es el importe en la moneda de VISUALIZACIÓN; null si faltó la tasa de esa
   * moneda — en ese caso la tabla cae a mostrar cada fila en su moneda de origen, que es feo pero
   * honesto (etiquetar colones como dólares no es una opción).
   */
  movimientos: {
    fecha: string;
    etiqueta: string;
    monto: number;
    moneda: string;
    montoConvertido: number | null;
    tipo: string;
    /** id de la fila, para poder distinguir dos movimientos que se ven idénticos. */
    id?: string;
  }[];
  /**
   * Montos por sobre (categoryId → montos), sobre TODAS las filas que matchean. Lo usa el
   * desglose cuando se consultan varios sobres juntos; se calcula antes del tope, como el total.
   */
  movimientosPorSobre?: Record<string, Monto[]>;
  /** Filtros que se aplicaron, para que la respuesta pueda nombrarlos. */
  filtros: { comercio: string | null; sobre: string | null; termino: string | null };
};

const TOPE_DEFAULT = 10;
/**
 * Tope duro. Alto a propósito: cuando el usuario pide "TODAS las transacciones de X", cortar en
 * 10 —o en 50— responde otra cosa de la que preguntó. Un sobre en un mes rara vez pasa de 100
 * movimientos, así que 300 es "todas" en la práctica sin dejar la puerta abierta a un volcado.
 */
const TOPE_MAX = 300;

// ---------------------------------------------------------------------------
// Resolución de periodo (pura: `hoy` se inyecta, nunca se lee del reloj acá)
// ---------------------------------------------------------------------------

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

/** "YYYY-MM-DD" → partes numéricas. Sin `new Date(str)`: evita el corrimiento por zona. */
function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

const pad = (n: number): string => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

/** Último día del mes (m es 1-12). */
function finDeMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Suma días a una fecha ISO usando aritmética UTC (sin zona, sin DST). */
export function sumarDias(fecha: string, dias: number): string {
  const { y, m, d } = parseISO(fecha);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
}

/** Día de la semana con LUNES=0 (es-CR arranca la semana en lunes). */
function diaSemanaLunes(fecha: string): number {
  const { y, m, d } = parseISO(fecha);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * Resuelve el periodo pedido a un rango concreto. `hoy` viene de `userToday()` (zona
 * del PERFIL), nunca del reloj del proceso — el mismo criterio que #573/#583.
 *
 * Soporta: hoy, ayer, semana (esta), semana_pasada, mes (este), mes_pasado, anio,
 * "ultimos_N_dias", y un nombre de mes ("marzo" → marzo del año en curso, o del
 * anterior si todavía no llegó).
 */
export function resolverRango(
  periodo: string | null | undefined,
  hoy: string,
  desde?: string | null,
  hasta?: string | null,
): Rango {
  // Un rango explícito manda sobre el periodo nombrado.
  if (desde && hasta) return { from: desde, to: hasta, etiqueta: `del ${desde} al ${hasta}` };

  const { y, m } = parseISO(hoy);
  const p = (periodo ?? "mes").toLowerCase().trim();

  // TODO EL HISTORIAL. "¿cuánto gasté en restaurantes EN TOTAL?" pedía justamente esto y caía en
  // una ventana de 180 días SILENCIOSA: la respuesta decía "en total" y sumaba medio año. El
  // 2000-01-01 es un piso simbólico (ninguna transacción es anterior) y la etiqueta lo dice, para
  // que el usuario sepa sobre qué se sumó.
  if (p === "todo" || p === "historico" || p === "histórico" || p === "siempre") {
    return { from: "2000-01-01", to: hoy, etiqueta: "todo tu historial" };
  }
  if (p === "hoy") return { from: hoy, to: hoy, etiqueta: "hoy" };
  if (p === "ayer") {
    const a = sumarDias(hoy, -1);
    return { from: a, to: a, etiqueta: "ayer" };
  }
  if (p === "semana" || p === "esta_semana") {
    const lunes = sumarDias(hoy, -diaSemanaLunes(hoy));
    return { from: lunes, to: hoy, etiqueta: "esta semana" };
  }
  if (p === "semana_pasada") {
    const lunesEsta = sumarDias(hoy, -diaSemanaLunes(hoy));
    const lunes = sumarDias(lunesEsta, -7);
    return { from: lunes, to: sumarDias(lunesEsta, -1), etiqueta: "la semana pasada" };
  }
  if (p === "mes_pasado") {
    const my = m === 1 ? y - 1 : y;
    const mm = m === 1 ? 12 : m - 1;
    return {
      from: iso(my, mm, 1),
      to: iso(my, mm, finDeMes(my, mm)),
      etiqueta: `${MESES[mm - 1]} ${my}`,
    };
  }
  if (p === "anio" || p === "año" || p === "este_anio") {
    return { from: iso(y, 1, 1), to: hoy, etiqueta: `${y}` };
  }
  if (p === "anio_pasado" || p === "año_pasado") {
    return { from: iso(y - 1, 1, 1), to: iso(y - 1, 12, 31), etiqueta: `${y - 1}` };
  }
  const ultimos = p.match(/ultimos?_?(\d+)_?d[ií]as?|(\d+)\s*d[ií]as/);
  if (ultimos) {
    const n = Number(ultimos[1] ?? ultimos[2] ?? 30);
    const dias = Number.isFinite(n) && n > 0 ? Math.min(n, 730) : 30;
    return { from: sumarDias(hoy, -(dias - 1)), to: hoy, etiqueta: `los últimos ${dias} días` };
  }
  const idxMes = MESES.indexOf(p);
  if (idxMes >= 0) {
    // Un mes nombrado que todavía no llegó este año se entiende como el del año pasado.
    const my = idxMes + 1 > m ? y - 1 : y;
    const mm = idxMes + 1;
    return {
      from: iso(my, mm, 1),
      to: iso(my, mm, finDeMes(my, mm)),
      etiqueta: `${MESES[idxMes]} ${my}`,
    };
  }
  // Default: el mes en curso, hasta hoy (no hasta fin de mes: no hay futuro que sumar).
  return { from: iso(y, m, 1), to: hoy, etiqueta: "este mes" };
}

/** Rango que cubre el mes actual Y el anterior (para "¿gasté más este mes que el pasado?"). */
export function rangoDosMeses(hoy: string): Rango {
  const { y, m } = parseISO(hoy);
  const my = m === 1 ? y - 1 : y;
  const mm = m === 1 ? 12 : m - 1;
  return { from: iso(my, mm, 1), to: hoy, etiqueta: "este mes vs. el pasado" };
}

// ---------------------------------------------------------------------------
// Filtrado
// ---------------------------------------------------------------------------

/** Normaliza para comparar texto libre: minúsculas y sin tildes. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export type Filtros = {
  tipo?: TipoTxn;
  comercio?: string | null;
  /** Nombre del sobre/categoría; se resuelve contra `nombresPorCategoria`. */
  sobre?: string | null;
  /**
   * Sobres YA RESUELTOS a sus ids (por `matchSobre` contra los sobres reales del usuario).
   * Tiene PRECEDENCIA sobre `sobre`/`termino`: comparar ids es exacto, mientras que el substring
   * del nombre confunde vecinos ("Super" cazaría "Supermercado" y "Superávit"). Cuando el sobre
   * se pudo identificar, filtrar por su id es la única forma de no traer de más.
   */
  categoriaIds?: string[] | null;
  /**
   * Término AMBIGUO: matchea si coincide el comercio O el sobre. Lo usa el ruteo
   * determinista, que no puede saber si "comida" en "¿cuánto gasté en comida?" es un
   * comercio o un sobre. El LLM, que sí puede distinguir, usa `comercio`/`sobre`.
   */
  termino?: string | null;
};

const campoComercio = (t: TxnLike): string =>
  normalizar(`${t.merchantOrSource ?? ""} ${t.description ?? ""}`);

const campoSobre = (t: TxnLike, nombres: Record<string, string>): string =>
  normalizar(t.categoryId ? (nombres[t.categoryId] ?? "") : "");

/**
 * Filtra por tipo, comercio (substring sobre comercio/descripción), sobre (substring
 * sobre el nombre de la categoría) y `termino` (cualquiera de los dos). El rango ya lo
 * aplicó la consulta a la BD.
 */
export function filtrarTransacciones(
  txns: TxnLike[],
  filtros: Filtros,
  nombresPorCategoria: Record<string, string> = {},
): TxnLike[] {
  const tipo = filtros.tipo ?? "todos";
  const comercio = filtros.comercio ? normalizar(filtros.comercio) : null;
  const ids = filtros.categoriaIds?.length ? new Set(filtros.categoriaIds) : null;
  // Con el sobre YA resuelto a ids, el filtro por nombre sobra y solo puede traer de más.
  const sobre = !ids && filtros.sobre ? normalizar(filtros.sobre) : null;
  const termino = !ids && filtros.termino ? normalizar(filtros.termino) : null;
  return txns.filter((t) => {
    if (tipo !== "todos" && t.kind !== tipo) return false;
    if (ids && !(t.categoryId && ids.has(t.categoryId))) return false;
    if (comercio && !campoComercio(t).includes(comercio)) return false;
    if (sobre && !campoSobre(t, nombresPorCategoria).includes(sobre)) return false;
    if (
      termino &&
      !campoComercio(t).includes(termino) &&
      !campoSobre(t, nombresPorCategoria).includes(termino)
    ) {
      return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Agregación
// ---------------------------------------------------------------------------

/** Clave + etiqueta del grupo al que cae una transacción. */
function claveDe(
  t: TxnLike,
  agrupacion: Agrupacion,
  nombresPorCategoria: Record<string, string>,
): { clave: string; etiqueta: string } {
  if (agrupacion === "dia") {
    return { clave: t.occurredOn, etiqueta: etiquetaFecha(t.occurredOn) };
  }
  if (agrupacion === "semana") {
    const lunes = sumarDias(t.occurredOn, -diaSemanaLunes(t.occurredOn));
    return { clave: lunes, etiqueta: `semana del ${etiquetaFecha(lunes)}` };
  }
  if (agrupacion === "mes") {
    const { y, m } = parseISO(t.occurredOn);
    return { clave: `${y}-${pad(m)}`, etiqueta: `${MESES[m - 1]} ${y}` };
  }
  if (agrupacion === "categoria") {
    const nombre = t.categoryId ? (nombresPorCategoria[t.categoryId] ?? null) : null;
    return { clave: t.categoryId ?? "sin_categoria", etiqueta: nombre ?? "sin sobre asignado" };
  }
  // comercio
  const etiqueta = (t.merchantOrSource ?? t.description ?? "").trim();
  return {
    clave: etiqueta ? normalizar(etiqueta) : "sin_comercio",
    etiqueta: etiqueta || "sin comercio",
  };
}

/** "2026-08-01" → "1 de agosto". El año solo si no es el del rango consultado. */
export function etiquetaFecha(fecha: string, anioActual?: number): string {
  const { y, m, d } = parseISO(fecha);
  const base = `${d} de ${MESES[m - 1]}`;
  return anioActual != null && y !== anioActual ? `${base} de ${y}` : base;
}

/**
 * Agrupa y suma. Cada grupo lleva sus subtotales por moneda y —cuando hay tasas para
 * todas— el total convertido a la moneda de visualización. El orden y el tope se
 * aplican al final, así que "los 5 días que más gasté" sale de acá, no del prompt.
 */
export function agregarTransacciones(
  txns: TxnLike[],
  opts: {
    rango: Rango;
    tipo?: TipoTxn;
    agrupacion?: Agrupacion;
    orden?: Orden;
    tope?: number;
    moneda: string;
    rates?: Record<string, number> | null;
    nombresPorCategoria?: Record<string, string>;
    filtros?: { comercio: string | null; sobre: string | null; termino?: string | null };
  },
): ConsultaResult {
  const agrupacion = opts.agrupacion ?? "ninguna";
  const orden = opts.orden ?? (agrupacion === "ninguna" ? "fecha_desc" : "monto_desc");
  // Una LISTA de movimientos (`agrupacion: "ninguna"`) se devuelve COMPLETA. Pedir "los gastos de
  // Supermercados de julio" y recibir "10 de 13" responde otra cosa de la que se preguntó, y el
  // corte no lo decidía el usuario: el carril determinista ya mandaba 300, pero cuando la frase no
  // matchea la atiende el LLM y el tope caía en el default. Ponerlo acá y no en el ruteo es lo que
  // hace que no dependa de quién llame — mismo criterio que `guardMovimientos`.
  //
  // La excepción es el ranking de movimientos sueltos ("los 3 gastos más grandes"): ahí el tope ES
  // la pregunta, y se respeta. Se reconoce porque el que llama pidió orden por MONTO junto con un
  // tope explícito. Las consultas agrupadas (por día, mes, comercio) no cambian.
  const rankingDeMovimientos =
    (opts.orden === "monto_desc" || opts.orden === "monto_asc") && opts.tope != null;
  const topePedido =
    agrupacion === "ninguna" && !rankingDeMovimientos ? TOPE_MAX : (opts.tope ?? TOPE_DEFAULT);
  const tope = Math.min(Math.max(1, topePedido), TOPE_MAX);
  const nombres = opts.nombresPorCategoria ?? {};
  const rates = opts.rates ?? null;

  const montosGenerales: Monto[] = txns.map((t) => ({ monto: t.amount, moneda: t.currency }));
  const totalGeneral = convertirTotal(montosGenerales, opts.moneda, rates);

  const base: ConsultaResult = {
    rango: opts.rango,
    tipo: opts.tipo ?? "todos",
    agrupacion,
    moneda: opts.moneda,
    conteo: txns.length,
    total: totalGeneral?.monto ?? null,
    subtotalesGenerales: subtotales(montosGenerales),
    // Por sobre, sobre TODAS las filas (antes del tope): el desglose tiene que cuadrar con el
    // total, no con lo que se muestre.
    movimientosPorSobre: txns.reduce<Record<string, Monto[]>>((acc, t) => {
      if (!t.categoryId) return acc;
      (acc[t.categoryId] ??= []).push({ monto: t.amount, moneda: t.currency });
      return acc;
    }, {}),
    grupos: [],
    movimientos: [],
    filtros: {
      comercio: opts.filtros?.comercio ?? null,
      sobre: opts.filtros?.sobre ?? null,
      termino: opts.filtros?.termino ?? null,
    },
  };

  if (agrupacion === "ninguna") {
    const ordenados = [...txns].sort((a, b) =>
      orden === "monto_desc"
        ? b.amount - a.amount
        : orden === "monto_asc"
          ? a.amount - b.amount
          : orden === "fecha_asc"
            ? a.occurredOn.localeCompare(b.occurredOn)
            : b.occurredOn.localeCompare(a.occurredOn),
    );
    base.movimientos = ordenados.slice(0, tope).map((t) => ({
      fecha: t.occurredOn,
      etiqueta: (t.merchantOrSource ?? t.description ?? "Movimiento").trim() || "Movimiento",
      monto: t.amount,
      moneda: t.currency,
      // Se convierte fila por fila con la MISMA función que el total, así la columna y el total
      // no pueden discrepar. Sin tasa → null y la tabla lo resuelve mostrando la moneda origen.
      montoConvertido:
        convertirTotal([{ monto: t.amount, moneda: t.currency }], opts.moneda, rates)?.monto ??
        null,
      tipo: t.kind,
      ...(t.id ? { id: t.id } : {}),
    }));
    return base;
  }

  const acc = new Map<string, { etiqueta: string; montos: Monto[]; conteo: number }>();
  for (const t of txns) {
    const { clave, etiqueta } = claveDe(t, agrupacion, nombres);
    const g = acc.get(clave) ?? { etiqueta, montos: [], conteo: 0 };
    g.montos.push({ monto: t.amount, moneda: t.currency });
    g.conteo += 1;
    acc.set(clave, g);
  }

  const grupos: Grupo[] = [...acc.entries()].map(([clave, g]) => {
    const conv = convertirTotal(g.montos, opts.moneda, rates);
    return {
      clave,
      etiqueta: g.etiqueta,
      total: conv?.monto ?? null,
      subtotales: subtotales(g.montos),
      conteo: g.conteo,
    };
  });

  // Un grupo sin total convertible se ordena al final: no hay número con el que compararlo.
  const val = (g: Grupo): number => g.total ?? -Infinity;
  grupos.sort((a, b) => {
    if (orden === "monto_desc") return val(b) - val(a);
    if (orden === "monto_asc") return val(a) - val(b);
    if (orden === "fecha_asc") return a.clave.localeCompare(b.clave);
    if (orden === "fecha_desc") return b.clave.localeCompare(a.clave);
    return val(b) - val(a);
  });

  base.grupos = grupos.slice(0, tope);
  return base;
}

// ---------------------------------------------------------------------------
// Render determinista (carril de plantilla: 0 tokens, cifras reales)
// ---------------------------------------------------------------------------

const TIPO_SUST: Record<TipoTxn, string> = {
  gasto: "gastos",
  ingreso: "ingresos",
  todos: "movimientos",
};

/** Monto de un grupo listo para mostrar: el convertido, o los subtotales por moneda. */
function montoGrupo(g: Grupo, moneda: string): string {
  if (g.total != null) return formatMoney(g.total, moneda);
  return subtotalesStr(g.subtotales);
}

/**
 * Respuesta en español, determinista, con las cifras REALES. Un periodo vacío se dice
 * como tal (nunca "no tengo acceso"). Con dos grupos temporales agrega la comparación,
 * que es lo que pide "¿gasté más este mes que el pasado?".
 */
export function renderConsulta(
  r: ConsultaResult,
  opts?: {
    /** id → nombre del sobre, para el desglose cuando se consultaron varios. */
    nombresPorCategoria?: Record<string, string>;
    /** Sobres consultados juntos. Con más de uno se agrega el subtotal por sobre. */
    porSobre?: { id: string; sobre: string }[];
  },
): string {
  const nombreTipo = TIPO_SUST[r.tipo];
  const filtro = r.filtros.comercio
    ? ` en ${r.filtros.comercio}`
    : r.filtros.sobre
      ? ` en ${r.filtros.sobre}`
      : r.filtros.termino
        ? ` en ${r.filtros.termino}`
        : "";

  if (r.conteo === 0) {
    return `No tenés ${nombreTipo}${filtro} registrados en ${r.rango.etiqueta}.`;
  }

  const totalStr =
    r.total != null ? formatMoney(r.total, r.moneda) : subtotalesStr(r.subtotalesGenerales);

  if (r.agrupacion === "ninguna") {
    // TABLA, no viñetas: una lista de movimientos es una columna de fechas, una de comercios y
    // una de montos — en viñetas los números quedan desalineados y no se pueden comparar de un
    // vistazo. El renderer del chat dibuja tablas markdown y alinea la columna numérica sola.
    //
    // MONEDA NATIVA: cada movimiento se muestra en la moneda en que se GASTÓ, no convertido a la
    // de visualización. Un movimiento individual es un hecho —"pagué ₡3.900"—, y convertirlo a
    // dólares lo vuelve irreconocible contra el estado de cuenta o el recibo. La conversión sigue
    // donde tiene sentido: en los AGREGADOS (desglose por sobre, por mes, comparaciones).
    // EL TOTAL ES DE TODAS LAS FILAS QUE MATCHEAN, no de las mostradas. `subtotalesGenerales` se
    // calcula sobre `txns` ANTES del tope, así que ya trae la suma completa por moneda.
    //
    // Sumar `r.movimientos` —como hacía antes— daba el total de las 10 visibles y obligaba a
    // aclarar "el total de arriba es el de los mostrados": una respuesta a "¿cuánto gasté en
    // restaurantes EN TOTAL?" que justamente NO da el total. Fue una regresión que entró al pasar
    // a moneda nativa: hasta entonces el total salía de `r.total`, que sí es de todas.
    const totalLista =
      r.subtotalesGenerales.length === 1
        ? formatMoney(r.subtotalesGenerales[0]!.monto, r.subtotalesGenerales[0]!.moneda)
        : r.subtotalesGenerales.map((m) => formatMoney(m.monto, m.moneda)).join(" + ");

    // Movimientos que se ven IDÉNTICOS (día, comercio y monto): se les agrega un sufijo con el id
    // corto. Dos consumos reales en el mismo lugar el mismo día existen, y sin distinguirlos la
    // tabla parece estar repitiendo una fila por error.
    const claveVisual = (m: (typeof r.movimientos)[number]): string =>
      `${m.fecha}|${m.etiqueta}|${m.monto}|${m.moneda}`;
    const veces = new Map<string, number>();
    for (const m of r.movimientos) veces.set(claveVisual(m), (veces.get(claveVisual(m)) ?? 0) + 1);

    const filas = r.movimientos.map((m) => {
      const signo = m.tipo === "ingreso" ? "+" : "−";
      const repetida = (veces.get(claveVisual(m)) ?? 0) > 1 && m.id;
      const etiqueta = repetida ? `${m.etiqueta} · #${m.id!.slice(0, 4)}` : m.etiqueta;
      return `| ${etiquetaFecha(m.fecha)} | ${etiqueta} | ${signo}${formatMoney(m.monto, m.moneda)} |`;
    });
    const cab = `Tus ${nombreTipo}${filtro} de ${r.rango.etiqueta} suman ${totalLista} en ${r.conteo} ${r.conteo === 1 ? "movimiento" : "movimientos"}:`;
    const tabla = [
      "| Fecha | Comercio | Monto |",
      "| --- | --- | --- |",
      ...filas,
      `| **Total** |  | **${totalLista}** |`,
    ].join("\n");
    // Si el tope recortó la lista, se dice — pero dejando claro que el TOTAL sigue siendo de
    // todas, que es lo que el usuario preguntó.
    const recorte =
      r.movimientos.length < r.conteo
        ? `\n\n(Se muestran ${r.movimientos.length} de ${r.conteo} movimientos; el total es de los ${r.conteo}.)`
        : "";
    // SUBTOTAL POR SOBRE cuando se consultaron varios juntos ("Supermercado" + "Supermercados"):
    // el total general no deja ver cuánto cayó en cada uno, que es justo lo que hace falta para
    // decidir si conviene unificarlos.
    let desglose = "";
    if (opts?.porSobre && opts.porSobre.length > 1) {
      const lineas = opts.porSobre
        .map((s) => {
          const suyos = r.movimientosPorSobre?.[s.id] ?? [];
          if (suyos.length === 0) return null;
          const porMoneda = subtotales(suyos);
          const monto = porMoneda.map((mm) => formatMoney(mm.monto, mm.moneda)).join(" + ");
          return `- ${s.sobre}: ${monto} (${suyos.length})`;
        })
        .filter(Boolean);
      if (lineas.length > 0) desglose = `\n\nPor sobre:\n${lineas.join("\n")}`;
    }
    return `${cab}\n\n${tabla}${desglose}${recorte}`;
  }

  const comoSe: Record<Exclude<Agrupacion, "ninguna">, string> = {
    dia: "por día",
    semana: "por semana",
    mes: "por mes",
    categoria: "por sobre",
    comercio: "por comercio",
  };
  const lineas = r.grupos.map((g) => `• ${g.etiqueta}: ${montoGrupo(g, r.moneda)} (${g.conteo})`);
  const cab = `Tus ${nombreTipo}${filtro} de ${r.rango.etiqueta} suman ${totalStr}. Desglose ${comoSe[r.agrupacion]}:`;

  // Comparación explícita cuando son exactamente dos periodos temporales.
  let cierre = "";
  const temporal = r.agrupacion === "dia" || r.agrupacion === "semana" || r.agrupacion === "mes";
  if (temporal && r.grupos.length === 2) {
    const [a, b] = r.grupos as [Grupo, Grupo];
    // Los grupos vienen ordenados por monto; para comparar necesitamos el orden cronológico.
    const [viejo, nuevo] = a.clave <= b.clave ? [a, b] : [b, a];
    if (viejo.total != null && nuevo.total != null && viejo.total > 0) {
      const delta = nuevo.total - viejo.total;
      const pctv = Math.round((Math.abs(delta) / viejo.total) * 100);
      cierre =
        delta === 0
          ? `\n\nGastaste exactamente lo mismo en ambos periodos.`
          : `\n\n${delta > 0 ? "Subió" : "Bajó"} ${formatMoney(Math.abs(delta), r.moneda)} (${pctv}%) respecto de ${viejo.etiqueta}.`;
    }
  }
  return `${cab}\n${lineas.join("\n")}${cierre}`;
}

// ---------------------------------------------------------------------------
// Declaración de la herramienta (para el LLM)
// ---------------------------------------------------------------------------

export const CONSULTAR_TRANSACCIONES_TOOL: AiToolDecl = {
  name: "consultar_transacciones",
  description:
    "Consulta el LIBRO DIARIO real del usuario: sus transacciones (gastos e ingresos) por rango de " +
    "fechas, periodo, tipo, sobre/categoría o comercio, con agregación opcional por día, semana, mes, " +
    "sobre o comercio. Devuelve CIFRAS REALES de su historial — usala SIEMPRE que pregunte por sus " +
    "movimientos, en qué fechas o días gasta más, cuánto le gastó a un comercio, qué gastó en una " +
    "semana o mes, o para comparar dos periodos. NUNCA respondas que no tenés acceso a sus " +
    "transacciones: llamá esta herramienta. Solo lee; no modifica nada.",
  parameters: {
    type: "object",
    properties: {
      periodo: {
        type: "string",
        description:
          "Periodo a consultar: hoy, ayer, semana, semana_pasada, mes (por defecto), mes_pasado, " +
          "anio, anio_pasado, 'ultimos_30_dias' (cualquier N), o un mes por nombre ('marzo'). " +
          "Para comparar el mes actual con el anterior usá 'mes_y_anterior'.",
      },
      desde: {
        type: "string",
        description: "Inicio del rango YYYY-MM-DD (alternativa a `periodo`).",
      },
      hasta: { type: "string", description: "Fin del rango YYYY-MM-DD (alternativa a `periodo`)." },
      tipo: {
        type: "string",
        enum: ["gasto", "ingreso", "todos"],
        description: "Tipo de movimiento. Por defecto 'gasto' si la pregunta es sobre gastos.",
      },
      comercio: {
        type: "string",
        description: "Filtra por nombre de comercio/fuente (coincidencia parcial). Ej: 'Walmart'.",
      },
      sobre: {
        type: "string",
        description:
          "Filtra por nombre del sobre/categoría (coincidencia parcial). Ej: 'Restaurantes'.",
      },
      agrupacion: {
        type: "string",
        enum: ["ninguna", "dia", "semana", "mes", "categoria", "comercio"],
        description:
          "Cómo agregar. 'dia' para '¿qué fechas gasto más?'; 'comercio' para '¿a quién le gasto más?'; " +
          "'mes' para comparar periodos; 'ninguna' lista los movimientos individuales.",
      },
      orden: {
        type: "string",
        enum: ["monto_desc", "monto_asc", "fecha_desc", "fecha_asc"],
        description:
          "Orden del resultado. Por defecto monto_desc si hay agrupación, si no fecha_desc.",
      },
      tope: {
        type: "number",
        description:
          `Máximo de GRUPOS a devolver cuando hay agrupación (por defecto ${TOPE_DEFAULT}, máximo ${TOPE_MAX}). ` +
          "Con agrupacion='ninguna' la lista de movimientos sale COMPLETA y este campo se ignora: " +
          "no lo mandes para recortar una tabla. La única excepción es un ranking de movimientos " +
          "sueltos ('los 3 gastos más grandes'), donde va junto con orden='monto_desc'.",
      },
    },
    required: [],
  },
};
