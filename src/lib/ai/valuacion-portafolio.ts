/**
 * De dónde sale el valor de cada posición, y cómo se cuenta eso sin mentir.
 *
 * EL PROBLEMA QUE RESUELVE: el resumen de inversiones sumaba en un solo "resultado sobre lo
 * invertido" tres cosas que no son la misma:
 *
 *  1. posiciones COTIZADAS con precio de mercado → un resultado real;
 *  2. posiciones valuadas A MANO por el usuario (certificados, préstamos, un plan) → una
 *     afirmación suya, no del mercado;
 *  3. posiciones cotizables SIN precio → `portfolio-engine` las deja en `currentValue = costBasis`
 *     y `profitLoss = 0` como PLACEHOLDER de agregación, marcadas `priceUnavailable`.
 *
 * Fundir las tres da un titular que puede decir lo contrario de la realidad: una cartera con la
 * cripto en −44% llegó a reportarse en +$1.013 porque una valuación manual de +$25.981 escrita por
 * el usuario compensaba la caída. Los tres grupos van SIEMPRE separados, y el grupo (3) no publica
 * resultado: un P&L calculado sobre placeholders no es un dato, es un cero disfrazado.
 *
 * Módulo puro: sin IO, sin formato de moneda (el `fmt` se inyecta) y sin "ahora" implícito (se
 * pasa), para que las reglas se fijen con tests en vez de con capturas de pantalla.
 */

import { subtotales, type Monto } from "@/lib/ai/money";

/**
 * De dónde viene el valor de una posición.
 *
 * Cripto y mercado tradicional van SEPARADOS aunque los dos tengan precio de feed: promediarlos da
 * un número que no describe a ninguno de los dos. En la cartera que motivó esto, la cripto estaba
 * en −44% y los ETF en +29%, y el promedio ponderado salía −4,1% — un número que no le sirve a
 * nadie para decidir nada.
 */
export type FuenteValor =
  /** Cripto con precio de feed. */
  | "cripto"
  /** Acciones y ETF con precio de feed: el mercado tradicional. */
  | "mercado"
  /** Valor escrito por el usuario (no cotizada a propósito: certificado, préstamo, inmueble). */
  | "manual"
  /** Cotizable, pero el feed no dio precio: su "valor" es el costo, como placeholder. */
  | "sin_precio";

export interface PosicionValuada {
  name: string;
  fuente: FuenteValor;
  /** Montos en la moneda en que se reporta la fila. */
  invested: number;
  value: number;
  pl: number;
  monedaFila: string;
  /** Los mismos montos en la moneda PRIMARIA: única base homogénea para pesos y porcentajes. */
  invertidoPrimario: number;
  valorPrimario: number;
  /** Meses desde la última vez que se tocó la posición. `null` = no se sabe. */
  mesesSinTocar?: number | null;
  /** Solo manuales: el valor escrito es idéntico al costo (nadie la valuó nunca de verdad). */
  valorIgualCosto?: boolean;
}

export interface GrupoValuacion {
  posiciones: number;
  /** Subtotales por moneda: nunca un total que sume monedas distintas. */
  invertido: Monto[];
  valor: Monto[];
  /**
   * Resultado del grupo. `null` a propósito en `sinPrecio`: ahí el "valor" es el costo y el P&L
   * sería 0 por construcción. Que sea null y no 0 hace IMPOSIBLE publicarlo por descuido.
   */
  pl: Monto[] | null;
  invertidoPrimario: number;
  valorPrimario: number;
  plPrimario: number | null;
  /** Rendimiento del grupo sobre su propio costo. `null` cuando no hay resultado publicable. */
  pctPrimario: number | null;
}

export interface ValuacionPortafolio {
  /** Cripto con precio de feed. */
  cripto: GrupoValuacion;
  /** Acciones y ETF con precio de feed. */
  mercado: GrupoValuacion;
  manual: GrupoValuacion;
  sinPrecio: GrupoValuacion;
  /** ¿Hay alguna cotizable sin precio ahora mismo? */
  haySinPrecio: boolean;
  /** ¿La MAYORÍA de lo invertido quedó sin poder valuarse? Cambia el tono del resumen entero. */
  mayoriaSinPrecio: boolean;
  /** Manuales con valor = costo y mucho tiempo sin tocarse: nadie las está valuando. */
  manualesSinActualizar: { name: string; meses: number | null }[];
  /** ¿Hay a la vez posiciones con precio de feed y valuadas a mano? (el caso que obliga a separar) */
  mezcla: boolean;
}

/**
 * A partir de cuántos meses una valuación manual pegada al costo deja de ser creíble. Tres y no
 * seis: un certificado o un préstamo personal cambian de valor dentro de un trimestre, y a los seis
 * meses la pregunta llega tarde.
 */
export const MESES_MANUAL_VIEJO = 3;

const GRUPO_VACIO: GrupoValuacion = {
  posiciones: 0,
  invertido: [],
  valor: [],
  pl: [],
  invertidoPrimario: 0,
  valorPrimario: 0,
  plPrimario: 0,
  pctPrimario: null,
};

function armarGrupo(pos: PosicionValuada[], conResultado: boolean): GrupoValuacion {
  if (pos.length === 0)
    return { ...GRUPO_VACIO, ...(conResultado ? {} : { pl: null, plPrimario: null }) };
  const invertidoPrimario = pos.reduce((s, p) => s + p.invertidoPrimario, 0);
  const valorPrimario = pos.reduce((s, p) => s + p.valorPrimario, 0);
  const plPrimario = valorPrimario - invertidoPrimario;
  return {
    posiciones: pos.length,
    invertido: subtotales(pos.map((p) => ({ monto: p.invested, moneda: p.monedaFila }))),
    valor: subtotales(pos.map((p) => ({ monto: p.value, moneda: p.monedaFila }))),
    pl: conResultado ? subtotales(pos.map((p) => ({ monto: p.pl, moneda: p.monedaFila }))) : null,
    invertidoPrimario,
    valorPrimario,
    plPrimario: conResultado ? plPrimario : null,
    pctPrimario: conResultado && invertidoPrimario > 0 ? plPrimario / invertidoPrimario : null,
  };
}

/** Reparte las posiciones por fuente y arma los cuatro grupos. */
export function resumirValuacion(posiciones: PosicionValuada[]): ValuacionPortafolio {
  const cripto = posiciones.filter((p) => p.fuente === "cripto");
  const mercado = posiciones.filter((p) => p.fuente === "mercado");
  const manual = posiciones.filter((p) => p.fuente === "manual");
  const sinPrecio = posiciones.filter((p) => p.fuente === "sin_precio");

  const invertidoTotal = posiciones.reduce((s, p) => s + p.invertidoPrimario, 0);
  const invertidoSinPrecio = sinPrecio.reduce((s, p) => s + p.invertidoPrimario, 0);

  return {
    cripto: armarGrupo(cripto, true),
    mercado: armarGrupo(mercado, true),
    manual: armarGrupo(manual, true),
    // El grupo sin precio NUNCA publica resultado: su valor es el costo, por placeholder.
    sinPrecio: armarGrupo(sinPrecio, false),
    haySinPrecio: sinPrecio.length > 0,
    mayoriaSinPrecio: invertidoTotal > 0 && invertidoSinPrecio / invertidoTotal > 0.5,
    manualesSinActualizar: manual
      .filter((p) => p.valorIgualCosto && (p.mesesSinTocar ?? 0) >= MESES_MANUAL_VIEJO)
      .map((p) => ({ name: p.name, meses: p.mesesSinTocar ?? null })),
    mezcla: (mercado.length > 0 || cripto.length > 0) && manual.length > 0,
  };
}

/**
 * Meses enteros de CALENDARIO entre dos instantes ISO. `null` si la fecha no sirve.
 *
 * Por calendario y no dividiendo por un mes promedio: con 30,44 días un año exacto daba 11 meses,
 * y la frase que sale de acá ("no la actualizás desde hace 1 año") se leía mal justo en el
 * aniversario, que es cuando más pesa.
 */
export function mesesDesde(iso: string | null | undefined, ahora: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || t > ahora) return null;
  const a = new Date(t);
  const b = new Date(ahora);
  let meses = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  // El mes solo cuenta cuando ya se cumplió el día: del 31/1 al 15/2 va 0, no 1.
  if (b.getUTCDate() < a.getUTCDate()) meses -= 1;
  return Math.max(0, meses);
}

function mesesTexto(meses: number | null): string {
  if (meses == null) return "hace tiempo";
  if (meses >= 12) {
    const a = Math.floor(meses / 12);
    return `hace ${a} ${a === 1 ? "año" : "años"}`;
  }
  return `hace ${meses} meses`;
}

export type FrasesOpts = {
  /** Formateador de moneda (la UI pasa el suyo; los tests, uno trivial). */
  fmt: (m: Monto) => string;
  /** Segunda persona: voseo en web, "tú" en móvil. */
  voz?: "vos" | "tu";
};

const CONJ = {
  vos: { actualizas: "actualizás", valen: "valen", tu: "vos" },
  tu: { actualizas: "actualizas", valen: "valen", tu: "tú" },
} as const;

const subs = (ms: Monto[], fmt: (m: Monto) => string) => ms.map(fmt).join(" + ");

function firmado(ms: Monto[], fmt: (m: Monto) => string): string {
  return ms
    .map((m) => `${m.monto >= 0 ? "+" : "−"}${fmt({ ...m, monto: Math.abs(m.monto) })}`)
    .join(" ");
}

function pctTexto(pct: number): string {
  const s = (pct * 100).toFixed(1).replace(".", ",");
  return `${pct >= 0 ? "+" : "−"}${s.replace("-", "")}%`;
}

/**
 * El resumen honesto, en frases sueltas que quien llama une.
 *
 * Reglas, en orden de prioridad:
 *  1. si la mayoría de lo invertido no se puede valuar, NO se finge un valor: se dice que no se
 *     puede valuar y se reporta lo invertido;
 *  2. mercado y manual van SIEMPRE separados, cada uno con su propio resultado;
 *  3. si hay cotizables sin precio, se dice cuántas y qué se está mostrando por ellas;
 *  4. si alguna manual lleva mucho con el valor pegado al costo, se pregunta — sin acusar.
 */
export function frasesValuacion(v: ValuacionPortafolio, opts: FrasesOpts): string[] {
  const { fmt } = opts;
  const c = CONJ[opts.voz ?? "vos"];
  const out: string[] = [];

  // (1) Sin mayoría valuable: no hay titular de valor que dar.
  if (v.mayoriaSinPrecio) {
    const invertidoTodo = subtotales([
      ...v.cripto.invertido,
      ...v.mercado.invertido,
      ...v.manual.invertido,
      ...v.sinPrecio.invertido,
    ]);
    out.push(
      `No puedo valuar tu portafolio ahora mismo: los precios de mercado no están disponibles para ${v.sinPrecio.posiciones} de tus posiciones, y son la mayor parte de lo que tenés invertido`,
    );
    out.push(`Lo que invertiste es ${subs(invertidoTodo, fmt)}`);
    if (v.manual.posiciones > 0) {
      out.push(
        `Otras ${v.manual.posiciones} están valuadas por ${c.tu}, no por el mercado: ${subs(v.manual.valor, fmt)}`,
      );
    }
    out.push("Cuando vuelvan los precios te doy el valor real");
    return out;
  }

  // (2) Los grupos con precio de feed, CADA UNO POR SEPARADO. Cripto y mercado tradicional se
  // mueven distinto: promediarlos esconde a los dos. Con la cripto en −44% y los ETF en +29%, el
  // promedio ponderado daba −4,1%, que no describe a ninguno.
  // La etiqueta lleva su artículo: "Tu cripto vale" / "Tus acciones y ETF valen".
  const conFeed: [GrupoValuacion, string, string][] = [
    [v.cripto, "Tu cripto", "vale"],
    [v.mercado, "Tus acciones y ETF", "valen"],
  ];
  for (const [g, etiqueta, verbo] of conFeed) {
    if (g.posiciones === 0) continue;
    const pct = g.pctPrimario;
    const resultado = g.pl ? firmado(g.pl, fmt) : null;
    out.push(
      `${etiqueta} (${g.posiciones} ${g.posiciones === 1 ? "posición" : "posiciones"}) ${verbo} ${subs(g.valor, fmt)}` +
        ` sobre ${subs(g.invertido, fmt)} invertidos` +
        (resultado ? `: ${resultado}${pct != null ? ` (${pctTexto(pct)})` : ""}` : ""),
    );
  }

  // (3) Lo valuado a mano, SIEMPRE aparte. Nunca se suma al resultado de arriba.
  if (v.manual.posiciones > 0) {
    out.push(
      `Otras ${v.manual.posiciones} posiciones — ${subs(v.manual.invertido, fmt)} invertidos — están valuadas por ${c.tu}, no por el mercado`,
    );
  }

  // (4) Las cotizables que hoy no tienen precio.
  if (v.haySinPrecio) {
    out.push(
      `${v.sinPrecio.posiciones} ${v.sinPrecio.posiciones === 1 ? "posición no tiene" : "posiciones no tienen"} precio ahora mismo; para ${v.sinPrecio.posiciones === 1 ? "esa" : "esas"} muestro lo invertido (${subs(v.sinPrecio.invertido, fmt)}), no el valor de mercado`,
    );
  }

  // (5) La pregunta suave sobre las manuales dormidas.
  const dormidas = v.manualesSinActualizar;
  if (dormidas.length > 0) {
    const primera = dormidas[0]!;
    const cuales =
      dormidas.length === 1
        ? `"${primera.name}" no la ${c.actualizas} ${mesesTexto(primera.meses)}`
        : `${dormidas.length} de esas no las ${c.actualizas} ${mesesTexto(primera.meses)}`;
    out.push(`${cuales} y siguen anotadas en lo que costaron — ¿siguen valiendo eso?`);
  }

  return out;
}

/**
 * Etiqueta para el CONTEXTO del modelo. El LLM ve los agregados y los afirma como reales si nadie
 * le dice de qué están hechos; esta línea viaja pegada a ellos.
 */
export function etiquetaContexto(v: ValuacionPortafolio): string | null {
  const partes: string[] = [];
  if (v.mezcla) {
    partes.push(
      `de ese total, ${v.cripto.posiciones + v.mercado.posiciones} posiciones tienen precio de mercado y ${v.manual.posiciones} están valuadas a mano por el usuario (no confirmadas por el mercado) — NO presentes su suma como un resultado de mercado`,
    );
  }
  // Cripto y tradicional van por separado SIEMPRE, incluso cuando el modelo escribe libre.
  if (v.cripto.posiciones > 0 && v.mercado.posiciones > 0) {
    partes.push(
      `la cripto (${v.cripto.posiciones} posiciones, ${v.cripto.pctPrimario != null ? (v.cripto.pctPrimario * 100).toFixed(1) + "%" : "s/d"}) y las acciones/ETF (${v.mercado.posiciones} posiciones, ${v.mercado.pctPrimario != null ? (v.mercado.pctPrimario * 100).toFixed(1) + "%" : "s/d"}) se mueven distinto — dalas SEPARADAS, nunca un rendimiento promedio de las dos`,
    );
  }
  if (v.haySinPrecio) {
    partes.push(
      `${v.sinPrecio.posiciones} posiciones NO tienen precio disponible: su "valor" en los agregados es el costo, como placeholder — NO afirmes ganancia ni pérdida sobre ellas`,
    );
  }
  if (v.mayoriaSinPrecio) {
    partes.push(
      "la MAYORÍA del portafolio no se puede valuar ahora mismo: no des un valor total ni un resultado",
    );
  }
  return partes.length > 0 ? partes.join("; ") : null;
}
