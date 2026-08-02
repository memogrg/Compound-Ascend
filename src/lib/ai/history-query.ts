/**
 * HISTORIAL / TENDENCIA para la IA: serie por periodo + variación (delta y %) sobre
 * los snapshots que la app ya guarda. Puro y testeable (sin red ni BD).
 *
 * REGLA DE ORO: cifras reales o silencio honesto. Sin snapshots suficientes responde
 * "todavía no tengo suficiente historial" — NUNCA "no tengo acceso", y nunca una
 * tendencia inventada a partir de un solo punto.
 *
 * FUENTES (ver nota en el service): patrimonio sale de `net_worth_snapshots` (mensual,
 * con fallback a `portfolio_snapshots` mientras no haya historial); portafolio de
 * `portfolio_snapshots` (diario, con moneda); gasto/ingreso/ahorro de
 * `monthly_snapshots` (mensual).
 */
import { formatMoney } from "@/lib/format";
import type { AiToolDecl } from "@/lib/ai/tools";

export type Metrica = "patrimonio" | "portafolio" | "gasto" | "ingreso" | "ahorro";

/** Un punto de la serie, ya normalizado a periodo mensual "YYYY-MM". */
export type SeriePunto = { periodo: string; valor: number };

export type Direccion = "sube" | "baja" | "estable";

export type Variacion = {
  delta: number;
  pct: number | null; // null si la base es 0 (no hay % honesto que dar)
  direccion: Direccion;
  desde: SeriePunto;
  hasta: SeriePunto;
};

export type HistorialResult = {
  metrica: Metrica;
  moneda: string;
  serie: { periodo: string; etiqueta: string; valor: number }[];
  variacion: Variacion | null;
  /** Motivo por el que no hay serie/variación utilizable (para la respuesta honesta). */
  insuficiente: "sin_datos" | "un_solo_punto" | null;
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Banda de "sin cambio": por debajo de esto la variación se llama estable. */
const PCT_ESTABLE = 3;

/** "2026-08" o "2026-08-01" → "agosto 2026". */
export function etiquetaPeriodo(periodo: string): string {
  const [y, m] = periodo.split("-");
  const mi = Number(m);
  if (!y || !Number.isFinite(mi) || mi < 1 || mi > 12) return periodo;
  return `${MESES[mi - 1]} ${y}`;
}

/** Clave mensual "YYYY-MM" de una fecha ISO (acepta "YYYY-MM" y "YYYY-MM-DD"). */
export function claveMes(fecha: string): string {
  return fecha.slice(0, 7);
}

/**
 * Colapsa puntos DIARIOS a una serie mensual quedándose con el ÚLTIMO de cada mes
 * (valor de cierre). Es la forma honesta de construir "patrimonio por mes" a partir de
 * `portfolio_snapshots`, que se escribe día por día: promediar mezclaría un mes con 30
 * lecturas y otro con 2.
 */
export function colapsarAMensual(puntos: { fecha: string; valor: number }[]): SeriePunto[] {
  const porMes = new Map<string, { fecha: string; valor: number }>();
  for (const p of puntos) {
    const k = claveMes(p.fecha);
    const previo = porMes.get(k);
    if (!previo || p.fecha >= previo.fecha) porMes.set(k, p);
  }
  return [...porMes.entries()]
    .map(([periodo, p]) => ({ periodo, valor: p.valor }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/** Recorta la serie a los últimos `meses` puntos (orden cronológico ascendente). */
export function ultimosMeses(serie: SeriePunto[], meses: number): SeriePunto[] {
  const n = Number.isFinite(meses) && meses > 0 ? Math.min(Math.floor(meses), 60) : 6;
  return serie.slice(-n);
}

/**
 * Variación entre el primer y el último punto. `pct` queda null si la base es 0 —
 * dividir por cero daría Infinity y "creciste un ∞%" no es una respuesta.
 */
export function calcularVariacion(serie: SeriePunto[]): Variacion | null {
  if (serie.length < 2) return null;
  const desde = serie[0]!;
  const hasta = serie[serie.length - 1]!;
  const delta = hasta.valor - desde.valor;
  const base = Math.abs(desde.valor);
  const pct = base > 0 ? Math.round((delta / base) * 100) : null;
  const direccion: Direccion =
    pct == null
      ? delta === 0 ? "estable" : delta > 0 ? "sube" : "baja"
      : Math.abs(pct) < PCT_ESTABLE ? "estable" : pct > 0 ? "sube" : "baja";
  return { delta, pct, direccion, desde, hasta };
}

/** Arma el resultado completo a partir de la serie mensual cruda. */
export function construirHistorial(
  serieCruda: SeriePunto[],
  opts: { metrica: Metrica; moneda: string; meses?: number },
): HistorialResult {
  const serie = ultimosMeses(serieCruda, opts.meses ?? 6);
  const base: HistorialResult = {
    metrica: opts.metrica,
    moneda: opts.moneda,
    serie: serie.map((p) => ({ ...p, etiqueta: etiquetaPeriodo(p.periodo) })),
    variacion: calcularVariacion(serie),
    insuficiente: serie.length === 0 ? "sin_datos" : serie.length === 1 ? "un_solo_punto" : null,
  };
  return base;
}

// ---------------------------------------------------------------------------
// Render determinista
// ---------------------------------------------------------------------------

const NOMBRE: Record<Metrica, string> = {
  patrimonio: "tu patrimonio neto",
  portafolio: "el valor de tu portafolio",
  gasto: "tu gasto mensual",
  ingreso: "tu ingreso mensual",
  ahorro: "tu ahorro mensual",
};

/** Cómo se llama la métrica cuando encabeza la frase de "todavía no hay historial". */
const NOMBRE_CORTO: Record<Metrica, string> = {
  patrimonio: "de tu patrimonio",
  portafolio: "de tu portafolio",
  gasto: "de tu gasto",
  ingreso: "de tu ingreso",
  ahorro: "de tu ahorro",
};

/**
 * Respuesta en español con las cifras reales. Sin historial suficiente lo dice y
 * explica de dónde saldría — nunca "no tengo acceso".
 */
export function renderHistorial(r: HistorialResult): string {
  const money = (n: number) => formatMoney(n, r.moneda);

  if (r.insuficiente === "sin_datos") {
    return (
      `Todavía no tengo historial ${NOMBRE_CORTO[r.metrica]} para mostrarte una tendencia. ` +
      `Se va armando solo a medida que usás la app mes a mes.`
    );
  }
  if (r.insuficiente === "un_solo_punto") {
    const p = r.serie[0]!;
    return (
      `Por ahora solo tengo un punto de historia: ${p.etiqueta}, ${money(p.valor)}. ` +
      `Con un mes más ya puedo decirte cómo viene cambiando.`
    );
  }

  const v = r.variacion!;
  const lineas = r.serie.map((p) => `• ${p.etiqueta}: ${money(p.valor)}`);
  const verbo = v.direccion === "sube" ? "subió" : v.direccion === "baja" ? "bajó" : "se mantuvo";

  const cierre =
    v.direccion === "estable"
      ? `En conjunto ${NOMBRE[r.metrica]} ${verbo} estable entre ${etiquetaPeriodo(v.desde.periodo)} y ${etiquetaPeriodo(v.hasta.periodo)}.`
      : `En conjunto ${NOMBRE[r.metrica]} ${verbo} ${money(Math.abs(v.delta))}` +
        (v.pct != null ? ` (${Math.abs(v.pct)}%)` : "") +
        ` desde ${etiquetaPeriodo(v.desde.periodo)}.`;

  return `${NOMBRE[r.metrica].charAt(0).toUpperCase()}${NOMBRE[r.metrica].slice(1)}, mes a mes:\n${lineas.join("\n")}\n\n${cierre}`;
}

// ---------------------------------------------------------------------------
// Declaración de la herramienta
// ---------------------------------------------------------------------------

export const CONSULTAR_HISTORIAL_TOOL: AiToolDecl = {
  name: "consultar_historial",
  description:
    "Consulta la EVOLUCIÓN histórica real del usuario a partir de sus snapshots: patrimonio neto, " +
    "valor del portafolio, o gasto/ingreso/ahorro mensual. Devuelve la serie por mes más la " +
    "variación (monto y %). Usala cuando pregunte cómo cambió algo, cómo viene, si mejoró o " +
    "empeoró, o para comparar con el mes o el año pasado. Si no hay suficientes snapshots la " +
    "herramienta lo dice — NUNCA respondas que no tenés acceso a su historial. Solo lee.",
  parameters: {
    type: "object",
    properties: {
      metrica: {
        type: "string",
        enum: ["patrimonio", "portafolio", "gasto", "ingreso", "ahorro"],
        description:
          "Qué serie traer. 'patrimonio' = patrimonio neto; 'portafolio' = valor de mercado de " +
          "las inversiones; 'gasto'/'ingreso'/'ahorro' = mensuales.",
      },
      meses: {
        type: "number",
        description: "Cuántos meses hacia atrás (por defecto 6, máximo 60).",
      },
    },
    required: ["metrica"],
  },
};
