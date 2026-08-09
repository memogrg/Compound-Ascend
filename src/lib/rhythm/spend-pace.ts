/**
 * RITMO DE GASTO — "vas rápido para el día que es". Motor puro, sin IO.
 *
 * ── POR QUÉ NO ES "AVISAR AL 50%" ───────────────────────────────────────────
 * Un umbral fijo sobre el porcentaje gastado no sabe qué día es. El 50% de tu sobre de
 * comida el día 20 es ir bien; el mismo 50% el día 5 es ir al doble de velocidad. Un aviso
 * al 50% le grita al primero y se calla con el segundo — exactamente al revés.
 *
 * Lo que se compara acá es GASTADO% contra TRANSCURRIDO%. La señal no es "gastaste mucho",
 * es "a este ritmo no llegás", que es una afirmación falsable y con salida.
 *
 * ── ESTRATEGIA, NO CULPA ────────────────────────────────────────────────────
 * La regla que gobierna todo el archivo: cada señal viene con SALIDAS, nunca sola. Un aviso
 * que solo dice "vas rápido" transfiere el problema al usuario y le agrega culpa; lo único
 * que consigue es que aprenda a cerrarlo sin leer.
 *
 * Las tres salidas son deliberadamente distintas entre sí:
 *   1. MOVER — cambia el plan. Hay holgura en otro sobre; el mes cierra igual.
 *   2. BAJAR EL RITMO — cambia el comportamiento. "Te quedan ₡X para N días = ₡Y por día".
 *   3. DEJARLO ASÍ — no hacer nada TAMBIÉN es una decisión válida, y decirlo en voz alta es
 *      lo que separa un acompañante de un supervisor. A veces el mes es así y ya está.
 *
 * La proyección es una regla de tres, determinista y explicable: `gastado / día × días del
 * mes`. Nada de tendencias ni suavizados — el usuario tiene que poder rehacer la cuenta de
 * cabeza, porque una cifra que no puede verificar no le genera confianza, le genera dudas.
 */

// ── Parámetros (nombrados y exportados para poder ajustarlos sin cazar números) ──

/**
 * Cuántos PUNTOS porcentuales tiene que superar el gasto al tiempo transcurrido para avisar.
 * 20 puntos ≈ ir un 20% del presupuesto por delante del calendario: suficiente para no
 * disparar con el ruido de una compra grande a principio de mes.
 */
export const RITMO_MARGEN_PUNTOS = 20;

/**
 * Peso mínimo del sobre sobre el presupuesto TOTAL de gasto para considerarlo relevante (5%).
 *
 * Es una proporción y no un monto fijo a propósito: un umbral en plata ("avisar desde
 * ₡50.000") es incorrecto en cuanto el usuario tiene sobres en dos monedas — ₡50.000 y
 * $50.000 no son la misma frontera. La proporción funciona igual en colones, dólares y en
 * cualquier tamaño de presupuesto.
 */
export const RITMO_PESO_MINIMO = 0.05;

/** Un sobre para el motor de ritmo: presupuesto y gasto real del mes, misma moneda. */
export type SobrePace = {
  categoryId: string;
  /** "Frasco › Sobre" para el copy. */
  path: string;
  budget: number;
  spent: number;
};

/** Una salida accionable concreta. `tipo` decide qué botón se pinta. */
export type SalidaRitmo =
  | {
      tipo: "mover";
      /** Sobre desde el que se mueve (el que tiene holgura). */
      desdeCategoryId: string;
      desdePath: string;
      /** Cuánto mover: lo que falta, topeado por la holgura disponible. */
      monto: number;
      texto: string;
    }
  | {
      tipo: "bajar_ritmo";
      /** Lo que queda por gastar (nunca negativo). */
      restante: number;
      diasRestantes: number;
      /** restante / diasRestantes. */
      porDia: number;
      texto: string;
    }
  | { tipo: "dejarlo"; texto: string };

/** Una señal de ritmo: el diagnóstico y sus salidas. */
export type SenalRitmo = {
  categoryId: string;
  path: string;
  currency: string;
  budget: number;
  spent: number;
  /** 0..1 */
  pctGastado: number;
  /** 0..1 */
  pctTranscurrido: number;
  /** Puntos porcentuales por encima del calendario (siempre ≥ margen). */
  puntosAdelante: number;
  /** Gasto proyectado a fin de mes (regla de tres). */
  proyeccion: number;
  /** proyeccion − budget, si es positivo. 0 si la proyección no se pasa. */
  excesoProyectado: number;
  diasRestantes: number;
  salidas: SalidaRitmo[];
};

const redondear = (n: number): number => Math.round(n);

/**
 * Detecta sobres yendo más rápido que el calendario.
 *
 * `dia` y `diasDelMes` vienen ya resueltos en la zona del PERFIL (nada de `new Date()` acá).
 *
 * Devuelve el peor primero (más puntos adelante). Quien llama decide cuántos mostrar: en la
 * campana conviene uno o dos — una lista de seis sobres "en rojo" es un muro, no un consejo.
 */
export function detectarRitmo(input: {
  sobres: SobrePace[];
  dia: number;
  diasDelMes: number;
  currency: string;
  margenPuntos?: number;
  pesoMinimo?: number;
}): SenalRitmo[] {
  const margen = (input.margenPuntos ?? RITMO_MARGEN_PUNTOS) / 100;
  const pesoMin = input.pesoMinimo ?? RITMO_PESO_MINIMO;

  // El día 1 no hay ritmo que medir: cualquier gasto sería "infinitamente rápido" porque el
  // transcurrido es ~3%. Avisarle a alguien el día 1 de que "a este ritmo llega a ₡3M" es
  // aritmética correcta y consejo inútil.
  if (input.dia < 2 || input.diasDelMes <= 0) return [];

  const pctTranscurrido = input.dia / input.diasDelMes;
  const totalBudget = input.sobres.reduce((acc, s) => acc + Math.max(0, s.budget), 0);
  const diasRestantes = Math.max(0, input.diasDelMes - input.dia);

  const relevante = (s: SobrePace): boolean => {
    if (s.budget <= 0) return false;
    // Sin presupuesto total (cuenta recién armada) no se puede pesar: se acepta cualquier
    // sobre con monto en vez de quedarse mudo.
    if (totalBudget <= 0) return true;
    return s.budget / totalBudget >= pesoMin;
  };

  const senales: SenalRitmo[] = [];

  for (const s of input.sobres) {
    if (!relevante(s)) continue;
    const pctGastado = s.spent / s.budget;
    const puntosAdelante = pctGastado - pctTranscurrido;
    if (puntosAdelante < margen) continue;

    const proyeccion = (s.spent / input.dia) * input.diasDelMes;
    const excesoProyectado = Math.max(0, proyeccion - s.budget);

    senales.push({
      categoryId: s.categoryId,
      path: s.path,
      currency: input.currency,
      budget: s.budget,
      spent: s.spent,
      pctGastado,
      pctTranscurrido,
      puntosAdelante,
      proyeccion,
      excesoProyectado,
      diasRestantes,
      salidas: [],
    });
  }

  // Las salidas se calculan DESPUÉS de conocer todas las señales: "mover desde el sobre con
  // holgura" necesita saber cuáles NO están apretados, y un sobre que también va rápido no
  // puede ser donante por más saldo que le quede.
  const apretados = new Set(senales.map((x) => x.categoryId));
  const donantes = candidatosDonantes({
    sobres: input.sobres,
    apretados,
    pctTranscurrido,
    relevante,
  });

  for (const senal of senales) {
    senal.salidas = construirSalidas({ senal, donantes, currency: input.currency });
  }

  return senales.sort((a, b) => b.puntosAdelante - a.puntosAdelante);
}

/** Sobre con holgura: va POR DEBAJO del calendario y le sobra plata. */
type Donante = { categoryId: string; path: string; holgura: number };

/**
 * Sobres que pueden ceder presupuesto, de mayor a menor holgura.
 *
 * La holgura NO es "lo que le queda" sino "lo que le sobra según el calendario":
 * `budget − spent − (lo que razonablemente va a gastar en lo que resta al ritmo actual)`.
 * Usar el restante a secas propondría vaciar el sobre de comida el día 10 porque "todavía
 * tiene ₡300.000" — plata que sí va a necesitar.
 */
function candidatosDonantes(args: {
  sobres: SobrePace[];
  apretados: Set<string>;
  pctTranscurrido: number;
  relevante: (s: SobrePace) => boolean;
}): Donante[] {
  const out: Donante[] = [];
  for (const s of args.sobres) {
    if (args.apretados.has(s.categoryId)) continue; // el que también va rápido no dona
    if (!args.relevante(s)) continue;

    const pctGastado = s.spent / s.budget;
    if (pctGastado >= args.pctTranscurrido) continue; // va al día o por encima: sin holgura

    // Proyección de ESTE sobre al ritmo que lleva; lo que exceda de eso es lo que sobra.
    const proyeccion = args.pctTranscurrido > 0 ? s.spent / args.pctTranscurrido : 0;
    const holgura = s.budget - Math.max(proyeccion, s.spent);
    if (holgura <= 0) continue;
    out.push({ categoryId: s.categoryId, path: s.path, holgura });
  }
  return out.sort((a, b) => b.holgura - a.holgura);
}

/** Las tres salidas, en orden: la que resuelve, la que ajusta y la que acepta. */
function construirSalidas(args: {
  senal: SenalRitmo;
  donantes: Donante[];
  currency: string;
}): SalidaRitmo[] {
  const { senal } = args;
  const salidas: SalidaRitmo[] = [];

  // 1. MOVER — solo si hay de dónde y hay algo que cubrir.
  const mejor = args.donantes[0];
  if (mejor && senal.excesoProyectado > 0) {
    const monto = redondear(Math.min(senal.excesoProyectado, mejor.holgura));
    // Un movimiento simbólico no resuelve nada y ensucia dos presupuestos. Si la holgura no
    // cubre al menos un cuarto del exceso, mejor no ofrecerlo.
    if (monto > 0 && monto >= senal.excesoProyectado * 0.25) {
      salidas.push({
        tipo: "mover",
        desdeCategoryId: mejor.categoryId,
        desdePath: mejor.path,
        monto,
        texto: `Mover de ${mejor.path} a ${senal.path}`,
      });
    }
  }

  // 2. BAJAR EL RITMO — siempre disponible mientras queden días.
  if (senal.diasRestantes > 0) {
    const restante = Math.max(0, senal.budget - senal.spent);
    salidas.push({
      tipo: "bajar_ritmo",
      restante,
      diasRestantes: senal.diasRestantes,
      porDia: restante / senal.diasRestantes,
      texto: "Bajar el ritmo",
    });
  }

  // 3. DEJARLO ASÍ — no hacer nada es una decisión, y nombrarla la vuelve elegible en vez de
  // un abandono silencioso.
  salidas.push({ tipo: "dejarlo", texto: "Dejarlo así" });

  return salidas;
}

// ── Copy ────────────────────────────────────────────────────────────────────

type Fmt = (amount: number, currency: string) => string;

/**
 * El diagnóstico: "Llevás ₡200.000 de ₡400.000 y es el día 8. A este ritmo llegás a ₡750.000."
 *
 * Enuncia HECHOS y una proyección, sin adjetivos. No hay "cuidado", no hay "demasiado": el
 * usuario saca su propia conclusión de tres números, y una conclusión propia se sostiene
 * mucho mejor que una ajena.
 */
export function textoDiagnostico(
  senal: SenalRitmo,
  dia: number,
  fmt: Fmt,
  voz: "vos" | "tu" = "vos",
): string {
  const llevas = voz === "vos" ? "Llevás" : "Llevas";
  const llegas = voz === "vos" ? "llegás" : "llegas";
  return (
    `${llevas} ${fmt(senal.spent, senal.currency)} de ${fmt(senal.budget, senal.currency)} ` +
    `y es el día ${dia}. A este ritmo ${llegas} a ${fmt(senal.proyeccion, senal.currency)}.`
  );
}

/** El texto de una salida, ya con sus cifras. Lo consume el botón y la campana. */
export function textoSalida(salida: SalidaRitmo, currency: string, fmt: Fmt): string {
  switch (salida.tipo) {
    case "mover":
      return `Mover ${fmt(salida.monto, currency)} de ${salida.desdePath}`;
    case "bajar_ritmo": {
      // "Te quedan" y "Dejarlo así" se escriben igual en voseo y tuteo: no se bifurcan.
      // Ver la nota de sobre-remaining-copy.ts sobre ramas gemelas.
      const dias = salida.diasRestantes === 1 ? "1 día" : `${salida.diasRestantes} días`;
      return `Te quedan ${fmt(salida.restante, currency)} para ${dias} = ${fmt(salida.porDia, currency)} por día`;
    }
    case "dejarlo":
      return "Dejarlo así y compensar en otro sobre";
  }
}

/**
 * "2026-W33" — ancla semanal de la clave del insight.
 *
 * Es lo que implementa "máximo 1 aviso por sobre por semana", y lo hace sin tabla ni
 * contador: con la semana dentro de `related_id`, el upsert de `syncInsights` por
 * (kind, related_id) dedupea solo. Todas las pasadas de la misma semana caen en la MISMA
 * fila —la tarjeta se actualiza con cifras frescas en vez de multiplicarse— y descartarla la
 * calla hasta el lunes, cuando la clave cambia y vuelve a ser una pregunta legítima.
 *
 * Semana ISO (lunes a domingo) calculada sobre un "YYYY-MM-DD" ya resuelto en la zona del
 * perfil. Se usa `Date.UTC` para el cálculo de calendario: la fecha ya viene localizada, así
 * que tratarla como UTC evita que el reloj del servidor la vuelva a correr un día.
 */
export function semanaISO(todayIso: string): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  if (!y || !m || !d) return todayIso;
  // ISO 8601: la semana 1 es la que contiene el primer jueves del año. Se corre la fecha al
  // jueves de SU semana y se cuenta contra el jueves de la semana 1 — comparar jueves con
  // jueves hace que la cuenta sea siempre un múltiplo exacto de 7 días.
  const alJueves = (fecha: Date): Date => {
    const copia = new Date(fecha.getTime());
    const diaSemana = (copia.getUTCDay() + 6) % 7; // 0 = lunes
    copia.setUTCDate(copia.getUTCDate() - diaSemana + 3);
    return copia;
  };

  const jueves = alJueves(new Date(Date.UTC(y, m - 1, d)));
  // El 4 de enero siempre cae en la semana 1 (por definición de la norma), así que el jueves
  // de su semana es el jueves de la semana 1.
  const juevesSemana1 = alJueves(new Date(Date.UTC(jueves.getUTCFullYear(), 0, 4)));
  const semana = 1 + Math.round((jueves.getTime() - juevesSemana1.getTime()) / 604_800_000);
  return `${jueves.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}
