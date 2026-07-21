/**
 * Motor patrimonial (puro, determinista, sin IO). Calcula las métricas del Marco
 * Patrimonial: patrimonio neto ajustado, número/años de libertad, índice 0-100,
 * calidad del patrimonio, niveles, lecturas de millonario y banderas de
 * diagnóstico. Las constantes son DECISIONES DE PRODUCTO ajustables (ver §refs).
 *
 * El ensamblador (patrimonio-service, fase siguiente) llena PatrimonioInput desde
 * los datos reales y corre este motor; aquí no se toca BD, UI ni IA.
 */

import { mesesDeColchon } from "@/lib/wealth-math";
export { mesesDeColchon };

export type AssetClassKey = "liquido" | "inversion" | "productivo" | "uso_personal" | "especial";

export type PatrimonioInput = {
  /** Montos brutos en moneda principal, por clase de activo (las 5 del repo). */
  assetsByClass: Record<AssetClassKey, number>;
  totalLiabilities: number;
  protectedCoverage: number; // cobertura total de seguros
  protectionScore: number; // 0-100 (de computeProtection)
  monthlyExpenses: number;
  passiveIncomeMonthly: number;
  netMonthlyIncome: number;
  monthlyInvested: number; // aportes recurrentes
  badDebtMonthlyPayment: number; // pagos mensuales de deuda cara/consumo (Fuga #3)
  diversification: "baja" | "media" | "alta";
  topConcentration: number; // 0-1 (mayor peso de un activo)
  age?: number | null;
  annualNetIncome?: number | null;
  freedomMultiplier?: 25 | 30 | 33; // default 25 (legacy; ya no se usa para los números)
  /** Gasto ESENCIAL mensual (N1) → número de seguridad. */
  essentialMonthlyExpenses?: number;
  /** Estilo de vida DESEADO mensual (dato personal) → número de libertad; null = sin definir. */
  desiredMonthlyLifestyle?: number | null;
  /**
   * Saldo de los fondos de defensa (current_amount de metas defensa:fondo_*).
   * Se RESTA del líquido en el capital que trabaja: está earmarkeado como colchón,
   * contarlo como capital generador sería usarlo dos veces.
   */
  defenseFundsBalance?: number;
  currency: string;
};

export type PatrimonioReport = {
  totalAssets: number;
  netWorth: number;
  adjustedNetWorth: number;
  liquidWealth: number;
  /**
   * Capital que TRABAJA (genera renta): inversión + productivo + (líquido −
   * fondos de defensa). Nunca < 0. Es el numerador del progreso hacia los tres
   * números. Su definición CAMBIÓ (antes = inversión + productivo): ahora suma el
   * líquido invertible pero descuenta el colchón earmarkeado.
   */
  investableWealth: number;
  productiveWealth: number;
  protectedWealth: number;
  /**
   * Saldo de los fondos de defensa (emergencia/paz) EXCLUIDO del capital que
   * trabaja. Se expone para que la UI explique por qué el progreso puede verse más
   * bajo de lo esperado (el colchón no genera renta). No es un recálculo: es el
   * mismo valor que restó el motor.
   */
  defenseFundsBalance: number;
  /** Los TRES números (capital que, al 8%, cubre cada nivel de gasto). */
  numeroDeSeguridad: number;
  numeroDeIndependencia: number;
  /** null cuando el usuario no definió su estilo de vida deseado (no se inventa). */
  numeroDeLibertad: number | null;
  progresoSeguridad: number; // 0-1
  progresoIndependencia: number; // 0-1
  progresoLibertad: number; // 0-1 (0 si numeroDeLibertad es null)
  hitoAlcanzado: Hito;
  siguienteHito: Exclude<Hito, "ninguno"> | null;
  /** Comparación informativa (mismo gasto total) a 4/6/8/10%. */
  sensibilidadTasa: Record<"0.04" | "0.06" | "0.08" | "0.10", number>;
  ratioLibertad: number; // 0-1 (= progresoIndependencia; alias legacy)
  mesesDeColchon: number;
  coberturaPasiva: number; // 0-1+ (ingreso pasivo / gasto)
  tasaInversion: number; // 0-1
  ratioDeudaActivos: number; // 0-1
  ratioDeudaMala: number; // 0-1
  añosDeLibertad: number;
  calidadPatrimonio: number; // 0-100
  patrimonioEsperado: number | null;
  ratioAcumulacion: number | null;
  indice: number; // 0-100
  // Pass-through para que el diagnóstico (§15) sea autocontenido desde el report.
  protectionScore: number; // 0-100
  topConcentration: number; // 0-1
  monthlyExpenses: number;
  currency: string;
};

export type PatrimonioLevel = { min: number; max: number; name: string; reading: string };

export type MillonarioReadings = {
  nominal: boolean;
  netWorth: boolean;
  invertible: boolean;
  libertad: boolean;
  flujo: boolean;
};

export type DiagnosisFlag = { code: string; hint: string };

// ── Constantes (decisiones de producto, ajustables) ──────────────────────────

/** §6.11 · Descuentos de liquidación por clase (midpoints conservadores). */
const ADJUSTMENT_DISCOUNTS: Record<AssetClassKey, number> = {
  liquido: 1.0,
  inversion: 0.95,
  productivo: 0.8,
  uso_personal: 0.65,
  especial: 0.55,
};

/** §7 · Pesos del Índice Patrimonial (suman 100). */
const INDEX_WEIGHTS = {
  netoAjustado: 20,
  invertible: 20,
  mesesLibertad: 15,
  coberturaPasiva: 15,
  tasaInversion: 10,
  calidadDeuda: 10,
  proteccion: 5,
  diversificacion: 5,
} as const;

/**
 * §6.10 · Pesos de Calidad del Patrimonio (suman 1.0). Decisión de producto
 * ajustable: cada sub-puntaje está acotado a 0-1 y se promedia ponderadamente,
 * para que la calidad sea honesta (no se infla por sumar bases distintas) e
 * invariante a la moneda. No entra al Índice Patrimonial; solo se muestra.
 */
const CALIDAD_WEIGHTS = {
  productive: 0.3,
  liquid: 0.15,
  diversification: 0.15,
  protection: 0.15,
  lowBadDebt: 0.15,
  lowConcentration: 0.1,
} as const;

/** §8 · Niveles del Índice Patrimonial. */
const LEVELS: PatrimonioLevel[] = [
  { min: 0, max: 15, name: "Punto de partida", reading: "Estás empezando a construir tu base patrimonial." },
  { min: 16, max: 30, name: "Base en construcción", reading: "Tu base toma forma; el siguiente paso es darle estructura." },
  { min: 31, max: 45, name: "Estabilidad inicial", reading: "Ganas estabilidad; ya puedes pensar en hacer crecer tu capital." },
  { min: 46, max: 60, name: "Constructor patrimonial", reading: "Construyes patrimonio con criterio; enfócate en el capital que trabaja." },
  { min: 61, max: 75, name: "Patrimonio sólido", reading: "Tu patrimonio es sólido; afina liquidez, protección y diversificación." },
  { min: 76, max: 90, name: "Alta independencia", reading: "Estás cerca de la independencia; tu dinero ya hace gran parte del trabajo." },
  { min: 91, max: 100, name: "Libertad patrimonial", reading: "Tu patrimonio te da libertad real; el foco es preservar y dejar legado." },
];

/** Puntaje 0-1 por nivel de diversificación. */
const DIVERSIFICATION_SCORE: Record<PatrimonioInput["diversification"], number> = {
  alta: 1,
  media: 0.6,
  baja: 0.3,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
const clamp01 = (n: number): number => clamp(n, 0, 1);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const safeRatio = (num: number, den: number): number => (den > 0 ? num / den : 0);

/**
 * TASA_RETIRO — supuesto de retorno anual del capital para los tres números
 * (seguridad/independencia/libertad). Un solo lugar, nombrada y documentada.
 * A MENOR rendimiento necesitás MÁS capital para el mismo gasto (número = gasto
 * anual / tasa). 8% es la decisión de producto; la UI muestra 4/6/10% como
 * comparación informativa, pero el cálculo usa SIEMPRE esta constante.
 */
export const TASA_RETIRO = 0.08;

/** El capital que, a TASA_RETIRO, genera `gastoMensual` para siempre. */
export function numeroPatrimonial(gastoMensual: number, tasa: number = TASA_RETIRO): number {
  return tasa > 0 ? (gastoMensual * 12) / tasa : 0;
}

/** Comparación informativa: qué capital haría falta a cada tasa (mismo gasto). */
export function sensibilidadTasa(gastoMensual: number): Record<"0.04" | "0.06" | "0.08" | "0.10", number> {
  return {
    "0.04": round2(numeroPatrimonial(gastoMensual, 0.04)),
    "0.06": round2(numeroPatrimonial(gastoMensual, 0.06)),
    "0.08": round2(numeroPatrimonial(gastoMensual, 0.08)),
    "0.10": round2(numeroPatrimonial(gastoMensual, 0.1)),
  };
}

export type Hito = "ninguno" | "seguridad" | "independencia" | "libertad";

// ── Motor ─────────────────────────────────────────────────────────────────────

export function computePatrimonio(input: PatrimonioInput): PatrimonioReport {
  const a = input.assetsByClass;
  const totalAssets = a.liquido + a.inversion + a.productivo + a.uso_personal + a.especial;
  const netWorth = totalAssets - input.totalLiabilities;

  // Patrimonio neto ajustado: cada clase descontada por su liquidez de salida.
  const adjustedAssets =
    a.liquido * ADJUSTMENT_DISCOUNTS.liquido +
    a.inversion * ADJUSTMENT_DISCOUNTS.inversion +
    a.productivo * ADJUSTMENT_DISCOUNTS.productivo +
    a.uso_personal * ADJUSTMENT_DISCOUNTS.uso_personal +
    a.especial * ADJUSTMENT_DISCOUNTS.especial;
  const adjustedNetWorth = adjustedAssets - input.totalLiabilities;

  const liquidWealth = a.liquido;
  // Capital que TRABAJA: inversión + productivo + (líquido − fondos de defensa).
  // ⚠️ NO "arreglar" quitando el descuento del colchón: los fondos de defensa
  // (fondo_emergencia/paz) están earmarkeados como colchón de seguridad; contarlos
  // acá como capital generador de renta sería usarlos DOS veces (colchón Y renta).
  // El líquido invertible restante (ahorro de sobra) sí trabaja. Nunca < 0.
  const defenseFunds = input.defenseFundsBalance ?? 0;
  const liquidoInvertible = Math.max(0, liquidWealth - defenseFunds);
  const investableWealth = Math.max(0, a.inversion + a.productivo + liquidoInvertible);
  const productiveWealth = a.productivo;
  const protectedWealth = input.protectedCoverage;

  const annualExpenses = input.monthlyExpenses * 12;

  // Los TRES números, fórmula única con TASA_RETIRO (8%). Libertad = null si el
  // usuario no definió su estilo de vida deseado (nunca se inventa un múltiplo).
  const numeroDeSeguridad = numeroPatrimonial(input.essentialMonthlyExpenses ?? 0);
  const numeroDeIndependencia = numeroPatrimonial(input.monthlyExpenses);
  const numeroDeLibertad =
    input.desiredMonthlyLifestyle != null && input.desiredMonthlyLifestyle > 0
      ? numeroPatrimonial(input.desiredMonthlyLifestyle)
      : null;

  const progreso = (n: number | null): number => (n && n > 0 ? clamp01(investableWealth / n) : 0);
  const progresoSeguridad = progreso(numeroDeSeguridad);
  const progresoIndependencia = progreso(numeroDeIndependencia);
  const progresoLibertad = progreso(numeroDeLibertad);

  // Hito alcanzado = el más alto cuyo número ya cubre el capital que trabaja.
  const hitoAlcanzado: Hito =
    numeroDeLibertad != null && investableWealth >= numeroDeLibertad
      ? "libertad"
      : numeroDeIndependencia > 0 && investableWealth >= numeroDeIndependencia
        ? "independencia"
        : numeroDeSeguridad > 0 && investableWealth >= numeroDeSeguridad
          ? "seguridad"
          : "ninguno";
  const siguienteHito: Exclude<Hito, "ninguno"> | null =
    hitoAlcanzado === "ninguno"
      ? "seguridad"
      : hitoAlcanzado === "seguridad"
        ? "independencia"
        : hitoAlcanzado === "independencia"
          ? numeroDeLibertad != null
            ? "libertad"
            : null
          : null;

  // El ÍNDICE usa el número de INDEPENDENCIA (sostener la vida actual) como
  // denominador — sucesor del viejo numeroDeLibertad (gastos totales). Al 8% el
  // número es menor, así que los ratios (clamped 0-1) son más generosos: refleja
  // el supuesto de retorno, coherente con la decisión de producto.
  const numeroIndiceDenom = numeroDeIndependencia;
  const ratioLibertad = progresoIndependencia; // alias legacy del progreso de independencia
  const mesesColchon = mesesDeColchon(liquidWealth, input.monthlyExpenses);
  const coberturaPasiva = safeRatio(input.passiveIncomeMonthly, input.monthlyExpenses);
  const tasaInversion = safeRatio(input.monthlyInvested, input.netMonthlyIncome);
  const ratioDeudaActivos = safeRatio(input.totalLiabilities, totalAssets);
  const ratioDeudaMala = safeRatio(input.badDebtMonthlyPayment, input.netMonthlyIncome);
  const añosDeLibertad = safeRatio(investableWealth, annualExpenses);

  // §6.10 · Calidad del patrimonio (0-100): promedio ponderado de sub-puntajes
  // acotados a 0-1 (no suma de bases distintas), así es honesta e invariante a
  // la moneda. La protección usa el score acotado, no coverage/netWorth.
  const calidadScores = {
    productive: clamp01(safeRatio(productiveWealth, totalAssets)),
    liquid: clamp01(safeRatio(liquidWealth, totalAssets) / 0.3), // ~30% líquido = pleno
    diversification: DIVERSIFICATION_SCORE[input.diversification],
    protection: clamp01(input.protectionScore / 100),
    lowBadDebt: 1 - clamp01(ratioDeudaMala / 0.2), // 1 = sin deuda cara; 0 = ≥20% del ingreso
    lowConcentration: 1 - clamp01(input.topConcentration), // 1 = sin concentración
  };
  const calidadPatrimonio = clamp(
    Math.round(
      (calidadScores.productive * CALIDAD_WEIGHTS.productive +
        calidadScores.liquid * CALIDAD_WEIGHTS.liquid +
        calidadScores.diversification * CALIDAD_WEIGHTS.diversification +
        calidadScores.protection * CALIDAD_WEIGHTS.protection +
        calidadScores.lowBadDebt * CALIDAD_WEIGHTS.lowBadDebt +
        calidadScores.lowConcentration * CALIDAD_WEIGHTS.lowConcentration) *
        100,
    ),
    0,
    100,
  );

  // §10.2 · Patrimonio esperado por edad e ingreso (regla de Stanley).
  const patrimonioEsperado =
    input.age && input.annualNetIncome ? (input.age * input.annualNetIncome) / 10 : null;
  const ratioAcumulacion =
    patrimonioEsperado && patrimonioEsperado > 0 ? round4(netWorth / patrimonioEsperado) : null;

  // §7 · Índice Patrimonial 0-100. Dimensiones a 0-1 desde valores crudos.
  const dims = {
    netoAjustado: numeroIndiceDenom > 0 ? clamp01(adjustedNetWorth / numeroIndiceDenom) : 0,
    invertible: ratioLibertad,
    mesesLibertad: clamp01(mesesColchon / 12), // 12+ meses = pleno
    coberturaPasiva: clamp01(coberturaPasiva / 1),
    tasaInversion: clamp01(tasaInversion / 0.2), // 20%+ = pleno
    calidadDeuda: 1 - clamp01(ratioDeudaMala / 0.2), // 20%+ ingreso = presión máx
    proteccion: clamp01(input.protectionScore / 100),
    diversificacion: DIVERSIFICATION_SCORE[input.diversification],
  };
  const indice = Math.round(
    dims.netoAjustado * INDEX_WEIGHTS.netoAjustado +
      dims.invertible * INDEX_WEIGHTS.invertible +
      dims.mesesLibertad * INDEX_WEIGHTS.mesesLibertad +
      dims.coberturaPasiva * INDEX_WEIGHTS.coberturaPasiva +
      dims.tasaInversion * INDEX_WEIGHTS.tasaInversion +
      dims.calidadDeuda * INDEX_WEIGHTS.calidadDeuda +
      dims.proteccion * INDEX_WEIGHTS.proteccion +
      dims.diversificacion * INDEX_WEIGHTS.diversificacion,
  );

  return {
    totalAssets: round2(totalAssets),
    netWorth: round2(netWorth),
    adjustedNetWorth: round2(adjustedNetWorth),
    liquidWealth: round2(liquidWealth),
    investableWealth: round2(investableWealth),
    productiveWealth: round2(productiveWealth),
    protectedWealth: round2(protectedWealth),
    defenseFundsBalance: round2(defenseFunds),
    numeroDeSeguridad: round2(numeroDeSeguridad),
    numeroDeIndependencia: round2(numeroDeIndependencia),
    numeroDeLibertad: numeroDeLibertad == null ? null : round2(numeroDeLibertad),
    progresoSeguridad: round4(progresoSeguridad),
    progresoIndependencia: round4(progresoIndependencia),
    progresoLibertad: round4(progresoLibertad),
    hitoAlcanzado,
    siguienteHito,
    sensibilidadTasa: sensibilidadTasa(input.monthlyExpenses),
    ratioLibertad: round4(ratioLibertad),
    mesesDeColchon: round2(mesesColchon),
    coberturaPasiva: round4(coberturaPasiva),
    tasaInversion: round4(tasaInversion),
    ratioDeudaActivos: round4(ratioDeudaActivos),
    ratioDeudaMala: round4(ratioDeudaMala),
    añosDeLibertad: round2(añosDeLibertad),
    calidadPatrimonio,
    patrimonioEsperado: patrimonioEsperado === null ? null : round2(patrimonioEsperado),
    ratioAcumulacion,
    indice,
    protectionScore: input.protectionScore,
    topConcentration: round4(input.topConcentration),
    monthlyExpenses: round2(input.monthlyExpenses),
    currency: input.currency,
  };
}

/** §8 · Nivel del índice (rango inclusivo). Clampea fuera de [0,100]. */
export function patrimonioLevel(indice: number): PatrimonioLevel {
  const i = clamp(Math.round(indice), 0, 100);
  return LEVELS.find((l) => i >= l.min && i <= l.max) ?? LEVELS[0]!;
}

/** §9 · Umbrales "millonario": cinco lecturas booleanas (en la moneda del usuario). */
export function millonarioReadings(input: PatrimonioInput): MillonarioReadings {
  const a = input.assetsByClass;
  const totalAssets = a.liquido + a.inversion + a.productivo + a.uso_personal + a.especial;
  const netWorth = totalAssets - input.totalLiabilities;
  // Mismo capital-que-trabaja que el motor (con el descuento del colchón de defensa).
  const liquidoInvertible = Math.max(0, a.liquido - (input.defenseFundsBalance ?? 0));
  const investableWealth = Math.max(0, a.inversion + a.productivo + liquidoInvertible);
  // "Libertad millonario" = independencia al 8% (sostener la vida actual).
  const numeroIndependencia = numeroPatrimonial(input.monthlyExpenses);
  return {
    nominal: netWorth > 1_000_000,
    netWorth: netWorth >= 1_000_000,
    invertible: investableWealth >= 1_000_000,
    libertad: numeroIndependencia > 0 && investableWealth >= numeroIndependencia,
    flujo: input.passiveIncomeMonthly >= input.monthlyExpenses && input.monthlyExpenses > 0,
  };
}

/** §15 · Banderas de diagnóstico deterministas (code + hint en español). */
export function buildPatrimonioDiagnosis(report: PatrimonioReport): DiagnosisFlag[] {
  const flags: DiagnosisFlag[] = [];
  // "Patrimonio sustancial": ya construyó al menos la mitad de su número de libertad.
  const substantial =
    report.numeroDeIndependencia > 0 && report.netWorth >= report.numeroDeIndependencia * 0.5;
  const investablePct = safeRatio(report.investableWealth, report.totalAssets);
  const annualExpenses = report.monthlyExpenses * 12;

  if (report.netWorth < 0) {
    flags.push({
      code: "patrimonio_neto_negativo",
      hint: "Tus pasivos superan tus activos: estabilizar la deuda es la prioridad.",
    });
  }
  if (substantial && report.mesesDeColchon < 3) {
    flags.push({
      code: "patrimonio_alto_baja_liquidez",
      hint: "Tienes patrimonio pero poca liquidez: refuerza tu colchón disponible.",
    });
  }
  if (substantial && investablePct < 0.3) {
    flags.push({
      code: "alto_pero_poco_productivo",
      hint: "Buena parte de tu patrimonio no trabaja: considera moverlo a capital productivo.",
    });
  }
  if (report.tasaInversion >= 0.15 && report.protectionScore < 50) {
    flags.push({
      code: "alta_tasa_baja_proteccion",
      hint: "Inviertes bien pero tu protección es baja: asegura tu base antes de crecer más.",
    });
  }
  if (report.ratioDeudaMala >= 0.2) {
    flags.push({
      code: "deuda_mala_alta",
      hint: "Tu deuda cara pesa sobre tu ingreso: priorizar pagarla libera flujo.",
    });
  }
  if (report.topConcentration >= 0.6) {
    flags.push({
      code: "alta_concentracion",
      hint: "Tu patrimonio depende demasiado de un solo activo: diversificar reduce el riesgo.",
    });
  }
  if (report.netWorth > 0 && annualExpenses > report.netWorth) {
    flags.push({
      code: "alto_gasto_vs_patrimonio",
      hint: "Tu gasto anual supera tu patrimonio neto: aún es frágil ante un imprevisto largo.",
    });
  }
  return flags;
}
