/**
 * TABLERO DE CALIDAD DEL AGENTE — el motor PURO (sin "server-only", sin IO: testeable entero).
 *
 * Convierte las filas crudas de `ai_events` de un día en UNA fila de `agent_metrics`. Todo el
 * criterio vive acá — qué cuenta como carril determinista, cómo se calculan los percentiles, cómo
 * se estima el costo — para poder probarlo sin BD y sin proveedor.
 *
 * POR QUÉ UN ROLLUP Y NO UNA CONSULTA. `ai_events` crece por turno; el tablero pregunta por DÍA.
 * Sin rollup, mirar 30 días escanea todos los eventos de 30 días, cada vez. Con rollup son 30
 * filas. El precio es que hay que escribirlo: lo hace el cron (idempotente, se puede recalcular).
 */

/** Fila cruda de `ai_events` que le importa al tablero. */
export type MetricEvent = {
  event: "tool" | "lane" | "guard" | "action" | "provider_error";
  /** tool → herramienta · lane → carril · guard → causa · action → tipo · provider_error → razón */
  name: string | null;
  ms: number | null;
  ok: boolean | null;
  tokensIn: number | null;
  tokensOut: number | null;
  userId: string;
};

export type LatenciaCarril = { p50: number; p95: number; n: number };

export type DailyMetrics = {
  turnos: number;
  turnosDet: number;
  turnosLlm: number;
  guardsTotal: number;
  guards: Record<string, number>;
  latP50: number | null;
  latP95: number | null;
  latPorCarril: Record<string, LatenciaCarril>;
  tokensIn: number;
  tokensOut: number;
  costoUsd: number;
  accionesPropuestas: number;
  accionesConfirmadas: number;
  providerErrors: Record<string, number>;
  usuarios: number;
};

/**
 * Carriles que resuelve la app SIN generación del LLM (`template`) o con el modelo barato de
 * clasificación (`lite`). Es la definición de "cobertura del router": lo que NO paga un turno de
 * razonamiento. `deterministic` es el que emite el carril de olvido de memoria.
 *
 * Lo que no esté acá cuenta como LLM. Ante un carril nuevo desconocido, contarlo como LLM es el
 * error seguro: infla la cifra que queremos bajar en vez de esconderla.
 */
const CARRILES_DETERMINISTAS: ReadonlySet<string> = new Set(["template", "lite", "deterministic"]);

export function esCarrilDeterminista(lane: string | null | undefined): boolean {
  return !!lane && CARRILES_DETERMINISTAS.has(lane);
}

/**
 * Percentil por interpolación de rango (nearest-rank sobre la lista ordenada). Con pocas muestras
 * el p95 colapsa al máximo, que es lo correcto: con 3 turnos en el día no hay un "p95" real y el
 * peor caso es la información honesta.
 */
export function percentil(valores: number[], p: number): number | null {
  const xs = valores.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const idx = Math.min(xs.length - 1, Math.max(0, Math.ceil((p / 100) * xs.length) - 1));
  return Math.round(xs[idx]!);
}

/**
 * Precio ESTIMADO por millón de tokens (USD), por modelo. Es una estimación declarada como tal:
 * el número que factura Google manda, y esto sirve para ver la TENDENCIA y detectar un salto de
 * costo el día que pasa, no para conciliar la factura.
 *
 * Se puede pisar por entorno con AI_PRICE_IN / AI_PRICE_OUT (USD por millón) cuando el precio
 * cambie, sin tocar código ni redeployar la lógica.
 */
export const PRECIO_POR_MILLON = {
  /** Entrada (prompt). */
  in: 0.1,
  /** Salida (generación). */
  out: 0.4,
} as const;

/** Costo estimado en USD de un volumen de tokens. Redondeado a 4 decimales (la columna es numeric(12,4)). */
export function estimarCosto(
  tokensIn: number,
  tokensOut: number,
  precio: { in: number; out: number } = PRECIO_POR_MILLON,
): number {
  const usd = (tokensIn / 1_000_000) * precio.in + (tokensOut / 1_000_000) * precio.out;
  return Math.round(usd * 10_000) / 10_000;
}

/** Suma 1 a `key` en el mapa (crea la entrada si no existe). */
function bump(mapa: Record<string, number>, key: string | null | undefined): void {
  const k = (key ?? "desconocido").trim() || "desconocido";
  mapa[k] = (mapa[k] ?? 0) + 1;
}

/**
 * El rollup de un día. Recorre los eventos UNA vez y arma todas las métricas.
 *
 * Las acciones se cuentan en dos nombres distintos (`propuesta:*` y `confirmada:*`) para que la
 * TASA DE ACCIÓN salga de restar dos contadores y no de correlacionar filas: una propuesta puede
 * confirmarse minutos después, incluso al día siguiente, y forzar el emparejamiento exacto haría
 * el rollup dependiente del orden. La tasa diaria es una tendencia, no una conciliación.
 */
export function rollupDay(events: MetricEvent[]): DailyMetrics {
  const guards: Record<string, number> = {};
  const providerErrors: Record<string, number> = {};
  const latPorCarrilRaw: Record<string, number[]> = {};
  const latTodas: number[] = [];
  const usuarios = new Set<string>();

  let turnos = 0;
  let turnosDet = 0;
  let turnosLlm = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let accionesPropuestas = 0;
  let accionesConfirmadas = 0;

  for (const e of events) {
    if (e.userId) usuarios.add(e.userId);
    switch (e.event) {
      case "lane": {
        turnos += 1;
        if (esCarrilDeterminista(e.name)) turnosDet += 1;
        else turnosLlm += 1;
        tokensIn += e.tokensIn ?? 0;
        tokensOut += e.tokensOut ?? 0;
        if (typeof e.ms === "number" && e.ms >= 0) {
          latTodas.push(e.ms);
          const carril = e.name ?? "desconocido";
          (latPorCarrilRaw[carril] ??= []).push(e.ms);
        }
        break;
      }
      case "guard":
        bump(guards, e.name);
        break;
      case "action":
        if (e.name?.startsWith("confirmada:")) accionesConfirmadas += 1;
        else accionesPropuestas += 1;
        break;
      case "provider_error":
        bump(providerErrors, e.name);
        break;
      case "tool":
        // Las herramientas ya tienen su propia lectura (ai_events por nombre); no entran al rollup
        // del turno para no contarlas como latencia del carril.
        break;
    }
  }

  const latPorCarril: Record<string, LatenciaCarril> = {};
  for (const [carril, ms] of Object.entries(latPorCarrilRaw)) {
    latPorCarril[carril] = {
      p50: percentil(ms, 50) ?? 0,
      p95: percentil(ms, 95) ?? 0,
      n: ms.length,
    };
  }

  return {
    turnos,
    turnosDet,
    turnosLlm,
    guardsTotal: Object.values(guards).reduce((a, b) => a + b, 0),
    guards,
    latP50: percentil(latTodas, 50),
    latP95: percentil(latTodas, 95),
    latPorCarril,
    tokensIn,
    tokensOut,
    costoUsd: estimarCosto(tokensIn, tokensOut),
    accionesPropuestas,
    accionesConfirmadas,
    providerErrors,
    usuarios: usuarios.size,
  };
}

/** Porcentaje redondeado a un decimal. `null` cuando no hay base (0 turnos ⇒ no hay cobertura que reportar). */
export function pct(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((parte / total) * 1000) / 10;
}

/** Las tres tasas que resumen el día. Se derivan (no se guardan) para que nunca queden desfasadas. */
export type DailyRates = {
  /** % de turnos resueltos sin razonamiento del LLM. Más alto = router cubriendo más. */
  coberturaDet: number | null;
  /** % de turnos que un guard tuvo que frenar. Es la tasa de "no sé con dato". */
  tasaGuard: number | null;
  /** % de propuestas que el usuario confirmó. Mide si el consejo era ejecutable de verdad. */
  tasaAccion: number | null;
};

export function tasas(m: DailyMetrics): DailyRates {
  return {
    coberturaDet: pct(m.turnosDet, m.turnos),
    tasaGuard: pct(m.guardsTotal, m.turnos),
    tasaAccion: pct(m.accionesConfirmadas, m.accionesPropuestas),
  };
}

/**
 * Compara dos días (o dos ventanas ya sumadas) y devuelve el delta de cada tasa. `null` en un lado
 * ⇒ `null` en el delta: sin base no hay comparación, y un 0 inventado leería como "no cambió".
 */
export function delta(hoy: DailyRates, antes: DailyRates): Record<keyof DailyRates, number | null> {
  const d = (a: number | null, b: number | null) =>
    a === null || b === null ? null : Math.round((a - b) * 10) / 10;
  return {
    coberturaDet: d(hoy.coberturaDet, antes.coberturaDet),
    tasaGuard: d(hoy.tasaGuard, antes.tasaGuard),
    tasaAccion: d(hoy.tasaAccion, antes.tasaAccion),
  };
}

/**
 * Suma varias filas diarias en una ventana (7d, 30d). Los percentiles NO se promedian —eso sería
 * un número sin significado—: se recalcula un p50/p95 PONDERADO por la cantidad de muestras de
 * cada día, que es la mejor aproximación posible sin volver a los eventos crudos.
 */
export function sumarVentana(dias: DailyMetrics[]): DailyMetrics {
  const base: DailyMetrics = {
    turnos: 0,
    turnosDet: 0,
    turnosLlm: 0,
    guardsTotal: 0,
    guards: {},
    latP50: null,
    latP95: null,
    latPorCarril: {},
    tokensIn: 0,
    tokensOut: 0,
    costoUsd: 0,
    accionesPropuestas: 0,
    accionesConfirmadas: 0,
    providerErrors: {},
    usuarios: 0,
  };
  if (dias.length === 0) return base;

  // Muestras sintéticas para el percentil ponderado: cada día aporta su p50/p95 repetido por su n.
  const muestrasP50: number[] = [];
  const muestrasP95: number[] = [];

  for (const d of dias) {
    base.turnos += d.turnos;
    base.turnosDet += d.turnosDet;
    base.turnosLlm += d.turnosLlm;
    base.guardsTotal += d.guardsTotal;
    base.tokensIn += d.tokensIn;
    base.tokensOut += d.tokensOut;
    base.costoUsd += d.costoUsd;
    base.accionesPropuestas += d.accionesPropuestas;
    base.accionesConfirmadas += d.accionesConfirmadas;
    // Usuarios: el máximo diario, NO la suma — sumar contaría al mismo usuario una vez por día.
    // Es una cota inferior honesta de los usuarios únicos de la ventana.
    base.usuarios = Math.max(base.usuarios, d.usuarios);
    for (const [k, v] of Object.entries(d.guards)) base.guards[k] = (base.guards[k] ?? 0) + v;
    for (const [k, v] of Object.entries(d.providerErrors))
      base.providerErrors[k] = (base.providerErrors[k] ?? 0) + v;
    for (const [carril, l] of Object.entries(d.latPorCarril)) {
      const acc = (base.latPorCarril[carril] ??= { p50: 0, p95: 0, n: 0 });
      acc.n += l.n;
      // p50/p95 por carril, ponderados igual que los globales.
      acc.p50 = Math.round((acc.p50 * (acc.n - l.n) + l.p50 * l.n) / Math.max(1, acc.n));
      acc.p95 = Math.max(acc.p95, l.p95);
    }
    const n = Math.max(1, d.turnos);
    if (d.latP50 !== null) for (let i = 0; i < n; i += 1) muestrasP50.push(d.latP50);
    if (d.latP95 !== null) for (let i = 0; i < n; i += 1) muestrasP95.push(d.latP95);
  }

  base.costoUsd = Math.round(base.costoUsd * 10_000) / 10_000;
  base.latP50 = percentil(muestrasP50, 50);
  base.latP95 = percentil(muestrasP95, 95);
  return base;
}
