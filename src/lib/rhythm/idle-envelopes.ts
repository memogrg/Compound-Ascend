/**
 * SOBRES OCIOSOS — "tenés plata apartada acá y casi no la usás". Motor puro, sin IO.
 *
 * El complemento del detector de ritmo (spend-pace.ts): aquél mira el sobre que va MUY RÁPIDO,
 * éste el que no se mueve. Juntos contestan la pregunta que el usuario hace en voz alta —
 * "¿dónde puedo recortar?"— con los dos lados: de dónde sacar y adónde hace falta.
 *
 * ── POR QUÉ MIRA VARIOS MESES ───────────────────────────────────────────────
 * Un sobre sin movimientos ESTE mes no dice nada: puede ser el seguro que se paga en marzo, o
 * el mes que no hubo que ir al dentista. Recién con dos o tres meses seguidos casi sin uso hay
 * un patrón — y esa distinción es exactamente lo que separa un consejo útil de un reproche por
 * algo que estaba perfectamente bien.
 *
 * Por eso el detector de cierre de mes (engine.ts · pendientesDeCierre) dice "sobres sin
 * movimientos" y NO "sobres que no usás": ahí es un dato del mes, acá es una conclusión.
 *
 * ── SIN CULPA, OTRA VEZ ─────────────────────────────────────────────────────
 * El copy nunca dice que presupuestar de más esté mal. Un sobre ocioso es plata inmovilizada,
 * no un error moral, y a veces es a propósito (el colchón del recibo de luz de verano). Por eso
 * "dejarlo así" sigue siendo una salida de primera clase.
 */

/** Cuántos meses hacia atrás se mira, incluido el actual. */
export const OCIOSO_MESES_VENTANA = 3;

/**
 * Cuánto del presupuesto acumulado tiene que quedar SIN usar para llamarlo ocioso (85%).
 * O sea: usó ≤15% de lo que apartó en la ventana. El "(casi) sin transacciones" del brief con
 * un número, y con margen para el sobre que tuvo un movimiento chico.
 */
export const OCIOSO_UMBRAL_SIN_USAR = 0.85;

/**
 * Peso mínimo sobre el presupuesto total para molestar con el aviso (5%). Igual que el ritmo:
 * una proporción y no un monto, para que funcione igual en colones que en dólares. Liberar
 * ₡3.000 al mes no le cambia el mes a nadie y sí gasta la atención del usuario.
 */
export const OCIOSO_PESO_MINIMO = 0.05;

/** Un sobre con su presupuesto mensual y su gasto acumulado en la ventana. */
export type SobreHistorico = {
  categoryId: string;
  /** "Frasco › Sobre" para el copy. */
  path: string;
  /** Id del frasco (Nivel 1). Solo se propone fusionar entre hermanos del MISMO frasco. */
  frascoId: string | null;
  /** Presupuesto mensual vigente. */
  budgetMensual: number;
  /** Gasto real ACUMULADO en toda la ventana. */
  gastoVentana: number;
};

/** Qué se puede hacer con un sobre ocioso. */
export type SalidaOcioso =
  | {
      tipo: "mover";
      hastaCategoryId: string;
      hastaPath: string;
      /** Cuánto mover: lo ocioso, topeado por lo que al receptor le falta. */
      monto: number;
    }
  | {
      tipo: "fusionar";
      /** Sobre hermano (mismo frasco) que absorbe a éste. */
      hastaCategoryId: string;
      hastaPath: string;
    }
  | { tipo: "dejarlo" };

export type SobreOcioso = {
  categoryId: string;
  path: string;
  currency: string;
  budgetMensual: number;
  /** Gasto acumulado en la ventana. */
  gastoVentana: number;
  /** Promedio mensual realmente gastado. */
  gastoMensualPromedio: number;
  /** Presupuesto mensual que queda sin usar (budgetMensual − promedio). Nunca negativo. */
  ociosoMensual: number;
  mesesVentana: number;
  salidas: SalidaOcioso[];
};

/** Un sobre que SÍ se usa y suele quedarse corto: el candidato a recibir. */
type Receptor = { categoryId: string; path: string; frascoId: string | null; falta: number };

const redondear = (n: number): number => Math.round(n);

/**
 * Detecta sobres ociosos y les arma las salidas.
 *
 * `mesesVentana` es cuántos meses cubre `gastoVentana` (normalmente OCIOSO_MESES_VENTANA). Se
 * recibe explícito porque una cuenta nueva puede tener menos historia que la ventana, y en ese
 * caso dividir por 3 subestimaría el gasto promedio e inventaría ociosos que no lo son.
 *
 * Devuelve el que más plata inmoviliza primero.
 */
export function detectarOciosos(input: {
  sobres: SobreHistorico[];
  mesesVentana: number;
  currency: string;
  umbralSinUsar?: number;
  pesoMinimo?: number;
}): SobreOcioso[] {
  const umbral = input.umbralSinUsar ?? OCIOSO_UMBRAL_SIN_USAR;
  const pesoMin = input.pesoMinimo ?? OCIOSO_PESO_MINIMO;
  const meses = input.mesesVentana;

  // Con menos de dos meses de historia no hay patrón que declarar: un solo mes flojo es ruido.
  // Devolver [] y no adivinar es la diferencia entre un consejo y una corazonada.
  if (meses < 2) return [];

  const totalBudget = input.sobres.reduce((acc, s) => acc + Math.max(0, s.budgetMensual), 0);
  const relevante = (s: SobreHistorico): boolean => {
    if (s.budgetMensual <= 0) return false;
    if (totalBudget <= 0) return true; // cuenta recién armada: no se puede pesar
    return s.budgetMensual / totalBudget >= pesoMin;
  };

  const ociosos: SobreOcioso[] = [];
  for (const s of input.sobres) {
    if (!relevante(s)) continue;
    const presupuestoVentana = s.budgetMensual * meses;
    const sinUsar = 1 - s.gastoVentana / presupuestoVentana;
    if (sinUsar < umbral) continue;

    const gastoMensualPromedio = s.gastoVentana / meses;
    ociosos.push({
      categoryId: s.categoryId,
      path: s.path,
      currency: input.currency,
      budgetMensual: s.budgetMensual,
      gastoVentana: s.gastoVentana,
      gastoMensualPromedio,
      ociosoMensual: Math.max(0, s.budgetMensual - gastoMensualPromedio),
      mesesVentana: meses,
      salidas: [],
    });
  }

  const idsOciosos = new Set(ociosos.map((o) => o.categoryId));
  const receptores = candidatosReceptores({ sobres: input.sobres, idsOciosos, meses, relevante });

  for (const o of ociosos) {
    o.salidas = construirSalidas({ ocioso: o, receptores, sobres: input.sobres, idsOciosos });
  }

  return ociosos.sort((a, b) => b.ociosoMensual - a.ociosoMensual);
}

/**
 * Sobres que SÍ se usan y se quedan cortos, de mayor faltante a menor.
 *
 * "Se queda corto" es gastar por encima del presupuesto en la ventana, no simplemente gastar
 * mucho: un sobre que usa el 95% de lo suyo está bien calibrado y moverle plata sería resolver
 * un problema que no tiene.
 */
function candidatosReceptores(args: {
  sobres: SobreHistorico[];
  idsOciosos: Set<string>;
  meses: number;
  relevante: (s: SobreHistorico) => boolean;
}): Receptor[] {
  const out: Receptor[] = [];
  for (const s of args.sobres) {
    if (args.idsOciosos.has(s.categoryId)) continue; // un ocioso no recibe
    if (!args.relevante(s)) continue;
    const presupuestoVentana = s.budgetMensual * args.meses;
    if (s.gastoVentana <= presupuestoVentana) continue;
    // Lo que le falta POR MES, que es la unidad en la que se mueve el presupuesto.
    out.push({
      categoryId: s.categoryId,
      path: s.path,
      frascoId: s.frascoId,
      falta: (s.gastoVentana - presupuestoVentana) / args.meses,
    });
  }
  return out.sort((a, b) => b.falta - a.falta);
}

/** Las salidas: mover al que se queda corto, fusionar con un hermano, o dejarlo. */
function construirSalidas(args: {
  ocioso: SobreOcioso;
  receptores: Receptor[];
  sobres: SobreHistorico[];
  idsOciosos: Set<string>;
}): SalidaOcioso[] {
  const salidas: SalidaOcioso[] = [];
  const { ocioso } = args;

  // 1. MOVER al sobre que más se queda corto. El monto se topea por LOS DOS lados: no se puede
  //    mover más de lo ocioso, ni más de lo que al receptor le falta —sobrefinanciarlo sería
  //    repetir el problema en el otro sobre—.
  const receptor = args.receptores[0];
  if (receptor && ocioso.ociosoMensual > 0) {
    const monto = redondear(Math.min(ocioso.ociosoMensual, receptor.falta));
    if (monto > 0) {
      salidas.push({
        tipo: "mover",
        hastaCategoryId: receptor.categoryId,
        hastaPath: receptor.path,
        monto,
      });
    }
  }

  // 2. FUSIONAR con un hermano del MISMO frasco que sí se use.
  //
  // La redundancia se infiere de la estructura, no de los nombres: dos sobres del mismo frasco
  // donde uno no se mueve y el otro sí es el caso real de "Súper" y "Mercado". Comparar textos
  // sería adivinar, y fusionar es DESTRUCTIVO (mergeCategory reasigna todas las referencias y
  // borra la categoría), así que acá solo se propone donde la estructura ya lo sugiere.
  //
  // Nunca se propone fusionar dos ociosos entre sí: juntar dos sobres que no se usan da un
  // sobre más grande que tampoco se usa.
  const frascoPropio =
    args.sobres.find((s) => s.categoryId === ocioso.categoryId)?.frascoId ?? null;
  const hermano = frascoPropio
    ? args.sobres.find(
        (s) =>
          s.categoryId !== ocioso.categoryId &&
          s.frascoId === frascoPropio &&
          !args.idsOciosos.has(s.categoryId) &&
          s.gastoVentana > 0,
      )
    : undefined;
  if (hermano) {
    salidas.push({
      tipo: "fusionar",
      hastaCategoryId: hermano.categoryId,
      hastaPath: hermano.path,
    });
  }

  // 3. DEJARLO — un sobre ocioso puede ser deliberado (el colchón del recibo de luz de verano).
  salidas.push({ tipo: "dejarlo" });
  return salidas;
}

// ── Copy ────────────────────────────────────────────────────────────────────

type Fmt = (amount: number, currency: string) => string;

/**
 * El diagnóstico: "Tenés ₡60.000 al mes en Farmacia y en 3 meses usaste ₡12.000."
 *
 * Hechos y nada más — sin "estás desperdiciando", sin "deberías". El usuario saca su propia
 * conclusión, que es la que se sostiene.
 */
export function textoOcioso(o: SobreOcioso, fmt: Fmt, voz: "vos" | "tu" = "vos"): string {
  // Solo "Tenés/Tienes" cambia de conjugación; "usaste" es igual en voseo y tuteo.
  const tenes = voz === "vos" ? "Tenés" : "Tienes";
  return (
    `${tenes} ${fmt(o.budgetMensual, o.currency)} al mes en ${o.path} y en ` +
    `${o.mesesVentana} meses usaste ${fmt(o.gastoVentana, o.currency)}.`
  );
}

/** El texto de una salida, con sus cifras. */
export function textoSalidaOcioso(salida: SalidaOcioso, currency: string, fmt: Fmt): string {
  switch (salida.tipo) {
    case "mover":
      return `Mover ${fmt(salida.monto, currency)} a ${salida.hastaPath}`;
    case "fusionar":
      return `Fusionar con ${salida.hastaPath}`;
    case "dejarlo":
      return "Dejarlo como está";
  }
}
