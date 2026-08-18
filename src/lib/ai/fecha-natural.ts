/**
 * FECHA dicha en lenguaje natural → ISO. Puro y sin "server-only": el carril de acción lo usa
 * para fechar un alta con la fecha que el usuario DIJO, no con la de hoy.
 *
 * POR QUÉ EXISTE. El carril de acción fechaba TODO con `opts.today`. "Agrega un gasto a transporte
 * de vehículo de 37747 el día 2 de agosto" se registraba con la fecha de hoy y el usuario no se
 * enteraba: la tarjeta mostraba la fecha, pero no la que él había dicho. Fechar mal un movimiento
 * lo manda a otro mes —a otro presupuesto— y ahí ya no aparece donde lo va a buscar.
 *
 * REGLA DE ORO: si el usuario dijo una fecha y no se pudo interpretar, se DICE. Caer a hoy en
 * silencio es exactamente el bug que esto viene a cerrar; por eso hay un tercer estado
 * (`iso: null` + `motivo`) además de "hay fecha" y "no hay fecha".
 *
 * La zona horaria NO se resuelve acá: entra ya resuelta en `hoy` (la del PERFIL, vía
 * `user-time.ts`). Todo el cálculo es aritmética de strings ISO, así que es determinista y
 * no depende del reloj del proceso.
 */
import { fechaValida } from "@/lib/ai/batch-rows";

export const MESES_ES = [
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
] as const;

/** «setiembre» es la grafía habitual en Costa Rica; entra como sinónimo de septiembre. */
const MES_NUM: Record<string, number> = {
  ...Object.fromEntries(MESES_ES.map((m, i) => [m, i + 1])),
  setiembre: 9,
};

const MES_ALT = [...MESES_ES, "setiembre"].join("|");

/** «agosto 2024» — el mes de una fecha ISO, para decir DÓNDE quedó el movimiento. */
export function mesLegible(iso: string): string {
  const mes = MESES_ES[Number(iso.slice(5, 7)) - 1];
  return mes ? `${mes} ${iso.slice(0, 4)}` : iso;
}

/** «26 de agosto de 2024» — la fecha completa, para el resumen de lo registrado. */
export function fechaLegible(iso: string): string {
  if (!fechaValida(iso)) return iso;
  const mes = MESES_ES[Number(iso.slice(5, 7)) - 1];
  return `${Number(iso.slice(8, 10))} de ${mes} de ${iso.slice(0, 4)}`;
}

/** Suma días a una fecha ISO (aritmética UTC: sin horario de verano de por medio). */
function sumarDias(iso: string, dias: number): string {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

const pad = (n: number): string => String(n).padStart(2, "0");
const armar = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

/**
 * Resultado de leer la fecha del mensaje.
 *  - `{ iso }`            — se entendió: esa es la fecha del movimiento.
 *  - `{ iso: null, motivo }` — el usuario DIJO una fecha y no sirve (no existe, o es futura).
 *                              El llamador tiene que decirlo, no callarse y usar hoy.
 *  - `null`               — no dijo ninguna fecha; hoy es el default legítimo.
 *
 * `texto` es el fragmento que se leyó como fecha: sirve para nombrarlo en el aviso y para
 * BORRARLO antes de buscar el monto (si no, "el día 2 de agosto" aporta un "2" que compite
 * con el importe real).
 */
export type FechaNatural =
  { iso: string; texto: string } | { iso: null; texto: string; motivo: "invalida" | "futura" };

/**
 * Señal de que el mensaje MENCIONA una fecha, aunque no se pueda parsear. Es lo que separa
 * "no dijo fecha" (caer a hoy está bien) de "dijo una que no entendí" (hay que avisar).
 */
const PISTA_FECHA = new RegExp(
  [
    `\\bel\\s+d[ií]a\\b`,
    `\\bfecha\\b`,
    // Con el artículo delante a propósito: "el 5 de agsoto" (mes mal escrito) es una fecha que
    // no se pudo leer, mientras que "2 de mis sobres" —sin "el"— no es una fecha en absoluto.
    `\\bel\\s+\\d{1,2}\\s+de\\s+\\p{L}{3,}`,
    `\\b(?:${MES_ALT})\\b`,
    `\\b\\d{1,2}\\s*/\\s*\\d{1,2}`,
    `\\b\\d{4}-\\d{1,2}-\\d{1,2}\\b`,
    `\\b(?:hoy|ayer|anteayer|antier)\\b`,
    `\\bantes\\s+de\\s+ayer\\b`,
  ].join("|"),
  "iu",
);

/**
 * Año que corresponde a un día+mes dicho SIN año. Un gasto es un hecho pasado: si el 5 de
 * diciembre todavía no llegó, el usuario habla del diciembre anterior, no del que viene.
 */
function anioInferido(hoy: string, mes: number, dia: number): number {
  const anioHoy = Number(hoy.slice(0, 4));
  return armar(anioHoy, mes, dia) > hoy ? anioHoy - 1 : anioHoy;
}

/** Valida y decide: fecha buena, o fecha dicha pero inservible (con el motivo). */
function resolver(iso: string, texto: string, hoy: string): FechaNatural {
  if (!fechaValida(iso)) return { iso: null, texto, motivo: "invalida" };
  if (iso > hoy) return { iso: null, texto, motivo: "futura" };
  return { iso, texto };
}

/**
 * Lee la fecha del mensaje. Formatos soportados, en orden de precedencia (del más explícito
 * al más ambiguo): ISO, dd/mm[/aaaa], «2 de agosto [de 2026]», «agosto 2», relativos
 * (hoy/ayer/anteayer) y día suelto («el día 2», «el 15»).
 *
 * El día suelto es el único que se restringe: solo entra tras «el día …» o al FINAL de la
 * frase. Sin esa restricción "un gasto de 500 en el 7 eleven" se llevaría el 7 como día.
 */
export function extractFechaNatural(text: string, hoy: string): FechaNatural | null {
  const t = text;

  // 1) ISO explícito: 2026-08-02.
  const iso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso?.[1] && iso[2] && iso[3]) {
    return resolver(armar(Number(iso[1]), Number(iso[2]), Number(iso[3])), iso[0], hoy);
  }

  // 2) dd/mm[/aa(aa)] — es-CR: el DÍA va primero (02/08 = 2 de agosto, no 8 de febrero).
  const num = t.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/);
  if (num?.[1] && num[2]) {
    const dia = Number(num[1]);
    const mes = Number(num[2]);
    const anioRaw = num[3] ? Number(num[3]) : null;
    const anio =
      anioRaw === null ? anioInferido(hoy, mes, dia) : anioRaw < 100 ? 2000 + anioRaw : anioRaw;
    return resolver(armar(anio, mes, dia), num[0], hoy);
  }

  // 3) «(el) (día) 2 de agosto (de 2026)».
  const dm = t.match(
    new RegExp(
      `\\b(?:el\\s+)?(?:d[ií]a\\s+)?(\\d{1,2})\\s+de\\s+(${MES_ALT})(?:\\s+(?:de[l]?\\s+)?(\\d{4}))?`,
      "iu",
    ),
  );
  if (dm?.[1] && dm[2]) {
    const dia = Number(dm[1]);
    const mes = MES_NUM[dm[2].toLowerCase()] ?? 0;
    const anio = dm[3] ? Number(dm[3]) : anioInferido(hoy, mes, dia);
    return resolver(armar(anio, mes, dia), dm[0], hoy);
  }

  // 4) «agosto 2» / «agosto 2 de 2026» (orden inverso, menos común pero inequívoco).
  const md = t.match(
    new RegExp(
      `\\b(${MES_ALT})\\s+(\\d{1,2})(?!\\s*\\d)(?:\\s*,?\\s*(?:de[l]?\\s+)?(\\d{4}))?`,
      "iu",
    ),
  );
  if (md?.[1] && md[2]) {
    const mes = MES_NUM[md[1].toLowerCase()] ?? 0;
    const dia = Number(md[2]);
    const anio = md[3] ? Number(md[3]) : anioInferido(hoy, mes, dia);
    return resolver(armar(anio, mes, dia), md[0], hoy);
  }

  // 5) Relativos. Se resuelven contra `hoy`, que ya viene en la zona del PERFIL.
  const rel = t.match(/\b(hoy|ayer|anteayer|antier)\b|\bantes\s+de\s+ayer\b/iu);
  if (rel) {
    const p = rel[0].toLowerCase();
    const dias = p === "hoy" ? 0 : p === "ayer" ? -1 : -2;
    return { iso: sumarDias(hoy, dias), texto: rel[0] };
  }

  // 6) Día suelto del mes en curso: «el día 2» (en cualquier posición) o «el 15» (al final).
  const suelto =
    t.match(/\bel\s+d[ií]a\s+(\d{1,2})(?!\d)/iu) ?? t.match(/\bel\s+(\d{1,2})(?!\d)\s*[.!]?\s*$/iu);
  if (suelto?.[1]) {
    const dia = Number(suelto[1]);
    const anioHoy = Number(hoy.slice(0, 4));
    const mesHoy = Number(hoy.slice(5, 7));
    const mismoMes = armar(anioHoy, mesHoy, dia);
    // Un día que todavía no llegó en este mes es del mes PASADO (un gasto ya ocurrió).
    if (fechaValida(mismoMes) && mismoMes <= hoy) return { iso: mismoMes, texto: suelto[0] };
    const mesAnterior = mesHoy === 1 ? 12 : mesHoy - 1;
    const anioAnterior = mesHoy === 1 ? anioHoy - 1 : anioHoy;
    return resolver(armar(anioAnterior, mesAnterior, dia), suelto[0], hoy);
  }

  // Dijo algo con pinta de fecha y ninguno de los formatos la leyó → hay que avisarlo.
  const pista = t.match(PISTA_FECHA);
  if (pista) return { iso: null, texto: pista[0], motivo: "invalida" };
  return null;
}
