/**
 * CORPUS DE INVERSIÓN para el RAG (`biblia_chunks`, tag `'inversion'` y `'fiscal'`).
 *
 * DATA cruda, sin IO: entra al mismo sembrado que el resto de la Biblia (`BIBLIA_SEED_ENTRIES` →
 * `/api/ai/biblia/reseed` → embeddings → recuperación semántica con `match_biblia_chunks`). No hay
 * ningún camino nuevo: es corpus, no infraestructura.
 *
 * ── QUÉ ES Y QUÉ NO ES ──────────────────────────────────────────────────────
 * Es material EDUCATIVO. El producto no da asesoría de inversión ni asesoría fiscal, y cada chunk
 * lo dice adentro: la recuperación semántica trae el TEXTO del chunk al prompt, así que un
 * disclaimer que viva solo en el system-prompt puede quedar lejos del dato cuando el modelo redacta.
 * Va pegado al dato.
 *
 * ── LAS CIFRAS DE IMPUESTOS SON DISTINTAS AL RESTO ──────────────────────────
 * Un concepto ("qué es el riesgo de secuencia") no caduca. Una TARIFA sí: cambia con una reforma y
 * el asesor la seguiría recitando con total seguridad. Por eso los chunks fiscales llevan `fuente`,
 * `vigenteDesde` y `revisarAntesDe`, van con la tarifa escrita DENTRO del texto junto a su ley, y
 * el tablero admin reporta cuáles vencieron (`fiscalesPorRevisar`). No se rompe el build: se
 * SUPERFICIA, que es lo que hace que alguien lo mire.
 */

/** Un concepto de inversión: no caduca, no lleva cifras de tarifas. */
export type ConceptoInversion = { keys: string[]; chunk: string };

/**
 * Un chunk FISCAL: lleva una cifra que puede cambiar por ley, así que arrastra su procedencia.
 * `revisarAntesDe` no es una fecha de vencimiento del dato — es cuándo hay que ir a mirar si sigue.
 */
export type ChunkFiscal = {
  keys: string[];
  chunk: string;
  fuente: string;
  /** YYYY-MM-DD desde el que rige la cifra citada. */
  vigenteDesde: string;
  /** YYYY-MM-DD antes del cual hay que reverificarla contra la ley y la DGT. */
  revisarAntesDe: string;
};

/** El disclaimer que va DENTRO de cada chunk educativo (ver el bloque de arriba). */
const EDU = "Información educativa, no es una recomendación de inversión.";
/** El de los fiscales: además manda a confirmar con un profesional, porque el caso particular manda. */
const FISCAL_EDU =
  "Información educativa general, NO es asesoría fiscal: confirmá tu caso con un contador y con la DGT antes de decidir.";

/**
 * Conceptos de inversión. Cada uno responde una pregunta que un usuario hace de verdad, en el
 * lenguaje en que la hace — los `keys` alimentan el fallback keyword, y el texto es lo que se
 * embebe para la recuperación semántica.
 */
export const INVERSION_CHUNKS: ConceptoInversion[] = [
  {
    keys: ["rebalanceo", "rebalancear", "reequilibrar", "proporcion", "desbalance"],
    chunk: `Rebalanceo: con el tiempo lo que más subió pasa a pesar de más en la cartera, y el riesgo real termina siendo mayor al elegido. Rebalancear es volver a las proporciones objetivo vendiendo parte de lo que creció y comprando lo que quedó atrás — es una disciplina de RIESGO, no un intento de adivinar el mercado. Lo habitual es hacerlo por calendario (una o dos veces al año) o por banda (cuando un activo se desvía más de 5 puntos de su objetivo). Cada rebalanceo puede tener costo de transacción e impacto fiscal: rebalancear de más cuesta plata. ${EDU}`,
  },
  {
    keys: ["dca", "promediar", "aporte mensual", "lump sum", "todo de una", "de golpe"],
    chunk: `DCA vs lump-sum: invertir todo de una (lump-sum) históricamente rinde más en promedio, porque el dinero pasa más tiempo invertido. El DCA (aportes iguales y periódicos) rinde algo menos en promedio pero REDUCE EL ARREPENTIMIENTO: reparte el riesgo de entrar justo antes de una caída. La elección es conductual antes que matemática — la mejor estrategia es la que la persona va a sostener sin vender en el peor momento. Para quien ya recibe su dinero mes a mes, el DCA no es una decisión: es la única forma disponible. ${EDU}`,
  },
  {
    keys: ["riesgo de secuencia", "secuencia de rendimientos", "retiro", "jubilacion", "orden"],
    chunk: `Riesgo de secuencia: dos carteras con el MISMO rendimiento promedio pueden terminar muy distinto según el ORDEN en que llegaron los años buenos y malos. Importa poco mientras se aporta, y muchísimo cuando se empieza a retirar: una caída fuerte en los primeros años de retiro, combinada con retiros, agota el capital antes. Las defensas conocidas son tener uno o dos años de gastos en activos líquidos y estables, y ser flexible con el monto retirado en los años malos. ${EDU}`,
  },
  {
    keys: ["diversificar", "diversificacion", "concentrado", "una sola accion", "canasta"],
    chunk: `Diversificación: repartir entre activos que no se mueven igual reduce el riesgo específico (que a UNA empresa le vaya mal) sin renunciar al rendimiento esperado del mercado. No elimina el riesgo de mercado — en una caída general baja casi todo a la vez. Concentrar en pocas posiciones puede dar un resultado extraordinario o uno pésimo, y esa varianza es el precio. Un error común es creerse diversificado teniendo cinco fondos que en el fondo compran las mismas empresas grandes. ${EDU}`,
  },
  {
    keys: ["comision", "comisiones", "fees", "costo", "expense ratio", "ter", "spread"],
    chunk: `Comisiones: es el único factor de rendimiento que se conoce de antemano y se puede controlar. Un costo anual de 1% sostenido durante 20 años se lleva cerca de una quinta parte del capital final, y no compra ninguna garantía de mejor resultado. Hay que sumar todo: la comisión anual del fondo (expense ratio), la del bróker, el spread de compraventa y el costo cambiario. Una comisión más alta solo se justifica si hay algo concreto a cambio, y "gestión activa" por sí sola no lo es. ${EDU}`,
  },
  {
    keys: ["horizonte", "plazo", "cuando lo necesito", "corto plazo", "largo plazo"],
    chunk: `Horizonte: el plazo en que se va a necesitar el dinero es lo que define cuánto riesgo es razonable, más que la tolerancia declarada. Plata que se necesita en menos de 2-3 años no debería estar en renta variable: no hay tiempo para recuperarse de una caída. El horizonte también decide qué es "una mala racha" — la misma caída es ruido a 20 años y es un problema serio a 18 meses. ${EDU}`,
  },
  {
    keys: ["volatilidad", "caida", "bajo mucho", "perdi", "riesgo", "vender ahora"],
    chunk: `Volatilidad no es lo mismo que pérdida: una posición que bajó solo materializa la pérdida cuando se vende. Lo que sí es riesgo real es quedarse sin liquidez y verse OBLIGADO a vender en el peor momento — por eso el fondo de emergencia protege la cartera tanto como protege a la persona. La pregunta útil ante una caída no es "¿vendo?", es "¿cambió algo de mi horizonte o de mi necesidad de esta plata?". ${EDU}`,
  },
  {
    keys: ["inflacion", "poder adquisitivo", "rendimiento real", "nominal"],
    chunk: `Rendimiento real vs nominal: lo que importa es lo que queda DESPUÉS de la inflación. Un 6% nominal con 5% de inflación es 1% real, no 6%. Guardar todo en efectivo se siente seguro y pierde poder adquisitivo todos los años de forma silenciosa: es un riesgo que no se ve en el saldo. ${EDU}`,
  },
  {
    keys: ["moneda", "dolares", "colones", "tipo de cambio", "devaluacion", "cambiario"],
    chunk: `Riesgo cambiario: invertir en otra moneda suma un segundo riesgo al del activo. Si los gastos son en colones y la inversión en dólares, una apreciación del colón reduce el rendimiento medido en la moneda en que se vive. La referencia sana es la moneda de los GASTOS futuros que esa inversión va a cubrir. ${EDU}`,
  },
];

/**
 * Impuestos de inversión en COSTA RICA. Cifras con su ley y su fecha; el texto dice explícitamente
 * que hay que confirmarlas, porque una tarifa recitada con seguridad después de una reforma es peor
 * que no decir nada.
 *
 * Todas apuntan al mismo `revisarAntesDe`: se revisan de una sentada, contra el texto vigente de la
 * ley y las resoluciones de la DGT.
 */
export const FISCAL_CR_CHUNKS: ChunkFiscal[] = [
  {
    keys: ["impuesto", "intereses", "renta del capital", "certificado", "ahorro", "retencion"],
    chunk: `Impuestos en Costa Rica — rentas del capital mobiliario (intereses): los rendimientos de capital mobiliario de fuente costarricense (intereses de cuentas, certificados a plazo, títulos) tributan por lo general al 15%, normalmente por retención única y definitiva que practica la entidad que paga. Hay regímenes y excepciones particulares según el instrumento y el emisor. ${FISCAL_EDU}`,
    fuente:
      "Ley 7092 (Impuesto sobre la Renta), Título sobre rentas de capital, reformada por la Ley 9635",
    vigenteDesde: "2019-07-01",
    revisarAntesDe: "2027-01-31",
  },
  {
    keys: ["dividendos", "dividendo", "reparto de utilidades", "bolsa nacional"],
    chunk: `Impuestos en Costa Rica — dividendos: la distribución de dividendos de sociedades costarricenses tributa por lo general al 15%. Existe una tarifa reducida del 5% cuando las acciones están inscritas en una bolsa de valores autorizada del país y se adquirieron por su medio, y casos en que la distribución a otra sociedad costarricense sujeta al impuesto no vuelve a gravarse. ${FISCAL_EDU}`,
    fuente: "Ley 7092 (Impuesto sobre la Renta), reformada por la Ley 9635",
    vigenteDesde: "2019-07-01",
    revisarAntesDe: "2027-01-31",
  },
  {
    keys: ["ganancia de capital", "ganancias de capital", "vender", "plusvalia", "utilidad"],
    chunk: `Impuestos en Costa Rica — ganancias de capital: la ganancia por vender un activo de capital tributa por lo general al 15% sobre la ganancia. Para bienes adquiridos ANTES del 1 de julio de 2019 existe una opción única de tributar 2,25% sobre el precio de venta en lugar del 15% sobre la ganancia, que conviene evaluar caso por caso. Las pérdidas de capital tienen reglas propias de compensación. ${FISCAL_EDU}`,
    fuente:
      "Ley 7092 (Impuesto sobre la Renta), Capítulo de ganancias y pérdidas de capital (Ley 9635), régimen transitorio",
    vigenteDesde: "2019-07-01",
    revisarAntesDe: "2027-01-31",
  },
  {
    keys: ["territorial", "fuente extranjera", "afuera", "broker extranjero", "etf", "exterior"],
    chunk: `Impuestos en Costa Rica — territorialidad: Costa Rica grava en principio las rentas de FUENTE COSTARRICENSE, por lo que las rentas pasivas de fuente extranjera de una persona física han quedado en general fuera del alcance del impuesto. La Ley 10381 introdujo reglas que sí alcanzan ciertas rentas pasivas de fuente extranjera para entidades integrantes de grupos multinacionales sin sustancia económica adecuada. Que algo no tribute en Costa Rica no significa que no tribute en el país de origen: un bróker extranjero puede retener en la fuente (por ejemplo, sobre dividendos). ${FISCAL_EDU}`,
    fuente: "Ley 7092 (principio de territorialidad) y Ley 10381",
    vigenteDesde: "2023-10-01",
    revisarAntesDe: "2027-01-31",
  },
  {
    keys: ["cripto", "bitcoin", "criptomoneda", "impuesto cripto"],
    chunk: `Impuestos en Costa Rica — cripto: no hay un régimen específico para criptoactivos, así que el tratamiento se deriva de las reglas generales según cómo se obtenga el resultado (ganancia de capital, actividad lucrativa habitual, o renta del trabajo si se recibe como pago). La diferencia entre "inversión ocasional" y "actividad habitual" cambia el tratamiento y depende de los hechos. Este es de los casos donde consultar a un profesional no es opcional. ${FISCAL_EDU}`,
    fuente: "Ley 7092 (reglas generales; sin régimen específico para criptoactivos)",
    vigenteDesde: "2019-07-01",
    revisarAntesDe: "2027-01-31",
  },
];

/**
 * Los chunks fiscales cuya fecha de revisión ya pasó. Lo consume el tablero admin: la caducidad se
 * SUPERFICIA, no rompe el build — un test que falle solo un martes cualquiera se termina silenciando,
 * y la cifra quedaría igual de vieja pero ahora sin nadie mirándola.
 */
export function fiscalesPorRevisar(hoy: string): { keys: string[]; revisarAntesDe: string }[] {
  return FISCAL_CR_CHUNKS.filter((c) => c.revisarAntesDe < hoy).map((c) => ({
    keys: c.keys,
    revisarAntesDe: c.revisarAntesDe,
  }));
}

/**
 * El texto que se siembra por cada chunk fiscal: el contenido MÁS su procedencia. La fuente viaja
 * dentro del texto embebido a propósito — si el modelo va a citar una tarifa, tiene que poder citar
 * de dónde salió y desde cuándo rige en la misma frase.
 */
export function textoFiscalSembrable(c: ChunkFiscal): string {
  return `${c.chunk} [Fuente: ${c.fuente}. Vigente desde ${c.vigenteDesde}. Verificado al ${c.vigenteDesde}; reverificar antes de ${c.revisarAntesDe}.]`;
}
