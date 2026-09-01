/**
 * Simulación de un préstamo que TODAVÍA NO SE TOMÓ, y las lecturas deterministas que salen de ella.
 *
 * No hay motor de amortización nuevo acá: `simulateLoan` compone `pmt` + `buildSchedule` de
 * `amortization.ts` y se limita a agregar (por año) y a totalizar. Todo lo demás son lecturas
 * derivadas de ese mismo schedule.
 *
 * Los textos NO formatean plata: reciben un `fmt` inyectado. Así el módulo queda puro y testeable
 * sobre los NÚMEROS (un test puede pasar `String` y afirmar cifras exactas) sin arrastrar la moneda
 * de visualización ni el locale hasta acá.
 *
 * Tono: informar y mostrar la matemática. No se prohíbe ni se regaña; el cierre siempre devuelve la
 * decisión al usuario.
 */

import { buildSchedule, pmt, type ScheduleRow } from "./amortization";

export interface LoanSimInput {
  /** Capital prestado. */
  principal: number;
  /** Tasa de interés anual en %. */
  aprPct: number;
  /** Plazo total en meses. */
  termMonths: number;
  /** Seguro mensual: se suma a la cuota y NO capitaliza. */
  insuranceMonthly: number;
}

/** Un año del cuadro de amortización, con sus meses adentro para poder desplegarlo. */
export interface LoanYear {
  /** 1-based. */
  year: number;
  /** Meses que caen en este año (el último puede traer menos de 12). */
  months: number;
  interest: number;
  principal: number;
  insurance: number;
  paid: number;
  openingBalance: number;
  closingBalance: number;
  rows: ScheduleRow[];
}

export interface LoanSim {
  schedule: ScheduleRow[];
  years: LoanYear[];
  /** Cuota nivelada (PMT), SIN seguro. */
  monthlyPayment: number;
  insuranceMonthly: number;
  /** Lo que sale de la cuenta cada mes: cuota + seguro. */
  monthlyTotal: number;
  totalInterest: number;
  totalInsurance: number;
  /** Capital + intereses + seguro. */
  totalPaid: number;
  /** Cuánto se termina pagando por cada 100 prestados. */
  costPer100: number;
  months: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ¿Los datos alcanzan para simular? Sin capital o sin plazo no hay nada que calcular. */
export function isSimulable(input: LoanSimInput): boolean {
  return (
    Number.isFinite(input.principal) &&
    input.principal > 0 &&
    Number.isFinite(input.termMonths) &&
    input.termMonths > 0 &&
    Number.isFinite(input.aprPct) &&
    input.aprPct >= 0
  );
}

const SIM_VACIA: LoanSim = {
  schedule: [],
  years: [],
  monthlyPayment: 0,
  insuranceMonthly: 0,
  monthlyTotal: 0,
  totalInterest: 0,
  totalInsurance: 0,
  totalPaid: 0,
  costPer100: 0,
  months: 0,
};

/**
 * Simula el préstamo completo. La cuota es la MISMA que usa `buildSchedule` internamente (el PMT
 * de `amortization.ts` sobre capital, tasa y plazo); se recalcula acá solo para poder mostrarla,
 * no para imponerla — por eso no se pasa como `paymentOverride`.
 */
export function simulateLoan(input: LoanSimInput): LoanSim {
  if (!isSimulable(input)) return SIM_VACIA;

  const insurance = Math.max(0, input.insuranceMonthly || 0);
  const schedule = buildSchedule({
    balance: input.principal,
    apr: input.aprPct,
    termMonths: input.termMonths,
    insurance,
  });
  if (schedule.length === 0) return SIM_VACIA;

  const monthlyPayment = round2(pmt(input.principal, input.aprPct / 100 / 12, input.termMonths));

  const years: LoanYear[] = [];
  for (const row of schedule) {
    const idx = Math.ceil(row.month / 12);
    let year = years[idx - 1];
    if (!year) {
      // El saldo de apertura del año es el de cierre del mes anterior; para el primero, el capital.
      const previo = years[idx - 2];
      year = {
        year: idx,
        months: 0,
        interest: 0,
        principal: 0,
        insurance: 0,
        paid: 0,
        openingBalance: previo ? previo.closingBalance : input.principal,
        closingBalance: 0,
        rows: [],
      };
      years[idx - 1] = year;
    }
    year.months += 1;
    year.interest += row.interest;
    year.principal += row.principal;
    year.insurance += row.insurance;
    year.paid += row.payment;
    year.closingBalance = row.balance;
    year.rows.push(row);
  }
  for (const y of years) {
    y.interest = round2(y.interest);
    y.principal = round2(y.principal);
    y.insurance = round2(y.insurance);
    y.paid = round2(y.paid);
  }

  const totalInterest = round2(schedule.reduce((s, r) => s + r.interest, 0));
  const totalInsurance = round2(schedule.reduce((s, r) => s + r.insurance, 0));
  const totalPaid = round2(schedule.reduce((s, r) => s + r.payment, 0));

  return {
    schedule,
    years,
    monthlyPayment,
    insuranceMonthly: insurance,
    monthlyTotal: round2(monthlyPayment + insurance),
    totalInterest,
    totalInsurance,
    totalPaid,
    costPer100: input.principal > 0 ? round2((totalPaid / input.principal) * 100) : 0,
    months: schedule.length,
  };
}

/**
 * Plazos "de catálogo": los que un banco realmente ofrece. Se busca sobre esta escalera en vez de
 * partir el plazo a la mitad y quedar con "13,3 años", que nadie puede pedir.
 */
const ESCALERA_ANOS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 35, 40] as const;

export interface ShorterTerm {
  termMonths: number;
  years: number;
  /** Cuota + seguro del plazo corto. */
  monthlyTotal: number;
  /** Cuánto MÁS por mes que el plazo simulado. */
  monthlyDelta: number;
  totalInterest: number;
  /** Intereses que se dejan de pagar respecto del plazo simulado. */
  interestSaved: number;
  monthsSaved: number;
}

/** El escalón de la escalera más cercano a `objetivo` años, siempre por debajo de `topeAnos`. */
function escalonCercano(objetivo: number, topeAnos: number, usados: Set<number>): number | null {
  let mejor: number | null = null;
  let mejorDist = Infinity;
  for (const a of ESCALERA_ANOS) {
    if (a >= topeAnos || usados.has(a)) continue;
    const dist = Math.abs(a - objetivo);
    // El `<` (y no `<=`) hace que un empate se quede con el escalón MÁS CORTO, que es el que ahorra
    // más intereses — que es de lo que trata la comparación.
    if (dist < mejorDist) {
      mejorDist = dist;
      mejor = a;
    }
  }
  return mejor;
}

/**
 * Dos plazos más cortos para comparar: uno a ~2/3 del simulado y otro a ~1/2. Con 30 años eso da
 * 20 y 15, que son justo los otros dos plazos que ofrece cualquier banco.
 *
 * Devuelve [] si el plazo ya es tan corto que no hay escalón debajo, o si acortarlo no ahorra nada.
 */
export function shorterTermOptions(input: LoanSimInput, sim: LoanSim): ShorterTerm[] {
  if (!isSimulable(input) || sim.months === 0) return [];
  const anosActual = input.termMonths / 12;
  const usados = new Set<number>();
  const out: ShorterTerm[] = [];

  for (const fraccion of [2 / 3, 1 / 2]) {
    const escalon = escalonCercano(anosActual * fraccion, anosActual, usados);
    if (escalon == null) continue;
    usados.add(escalon);

    const corta = simulateLoan({ ...input, termMonths: escalon * 12 });
    if (corta.months === 0 || corta.totalInterest >= sim.totalInterest) continue;

    out.push({
      termMonths: escalon * 12,
      years: escalon,
      monthlyTotal: corta.monthlyTotal,
      monthlyDelta: round2(corta.monthlyTotal - sim.monthlyTotal),
      totalInterest: corta.totalInterest,
      interestSaved: round2(sim.totalInterest - corta.totalInterest),
      monthsSaved: sim.months - corta.months,
    });
  }
  return out;
}

/** Lo que ya sabemos del usuario. `null` cuando todavía no hay datos suficientes. */
export interface SimContext {
  /** Ingreso mensual. 0 = desconocido. */
  incomeMonthly: number;
  /** Sobrante mensual (free cashflow). Puede ser 0 o negativo. */
  freeCashflow: number;
  /** Suma de las cuotas de las deudas que YA tiene. */
  existingDebtPayments: number;
}

export type SimInsightKind =
  "interes_vs_capital" | "plazo_corto" | "capacidad" | "seguro" | "cierre";

export interface SimInsight {
  kind: SimInsightKind;
  tone: "info" | "warn" | "good";
  title: string;
  body: string;
}

/** Umbral a partir del cual los intereses dejan de ser un detalle del préstamo. */
export const UMBRAL_INTERES = 0.5;
/** Carga de deuda sobre el ingreso a partir de la cual conviene decirlo en voz alta. */
export const UMBRAL_DTI = 0.35;
/** Y a partir de acá ya es la señal fuerte. */
export const UMBRAL_DTI_ALTO = 0.4;

/**
 * La voz de la segunda persona. La web habla de VOS y el móvil de TÚ (es-MX), y las lecturas las
 * escribe este módulo para las dos: sin este parámetro habría que duplicar el engine — o dejar
 * al móvil hablando en voseo, que es lo que pasaba.
 *
 * Solo viven acá las formas que cambian; todo lo neutro ("Tu carga de deuda pasaría…") se escribe
 * una sola vez.
 */
export type Voz = "vos" | "tu";

const CONJUGACION: Record<Voz, Record<string, string>> = {
  vos: {
    pedis: "pedís",
    devolves: "devolvés",
    ahorras: "ahorrás",
    terminas: "terminás",
    pagas: "pagás",
    Simula: "Simulá",
    tenes: "tenés",
    tu: "vos",
  },
  tu: {
    pedis: "pides",
    devolves: "devuelves",
    ahorras: "ahorras",
    terminas: "terminas",
    pagas: "pagas",
    Simula: "Simula",
    tenes: "tienes",
    tu: "tú",
  },
};

function pct(ratio: number, decimales = 0): string {
  return `${(ratio * 100).toFixed(decimales)}%`;
}

function anosTexto(meses: number): string {
  const a = meses / 12;
  const txt = Number.isInteger(a) ? String(a) : a.toFixed(1).replace(".", ",");
  return `${txt} ${a === 1 ? "año" : "años"}`;
}

/**
 * Las lecturas de la simulación, en orden de lo que más pesa en la decisión. Siempre cierra con el
 * recordatorio de que la decisión es del usuario.
 */
export function buildDebtSimInsights(args: {
  input: LoanSimInput;
  sim: LoanSim;
  shorter: ShorterTerm[];
  context: SimContext | null;
  /** Formateador de moneda inyectado (la UI pasa el suyo; los tests, uno trivial). */
  fmt: (n: number) => string;
  /** Segunda persona: voseo en web (por defecto), "tú" en el móvil. */
  voz?: Voz;
}): SimInsight[] {
  const { input, sim, shorter, context, fmt } = args;
  if (sim.months === 0) return [];
  const v = CONJUGACION[args.voz ?? "vos"];

  const out: SimInsight[] = [];

  // 1) Intereses contra capital: el número que casi nunca se mira al firmar.
  const ratioInteres = input.principal > 0 ? sim.totalInterest / input.principal : 0;
  out.push({
    kind: "interes_vs_capital",
    tone: ratioInteres > UMBRAL_INTERES ? "warn" : "info",
    title:
      ratioInteres > UMBRAL_INTERES
        ? `Los intereses pesan más que la mitad de lo que ${v.pedis}`
        : "Lo que cuesta el préstamo",
    body: `Pagarías ${fmt(sim.totalInterest)} en intereses — un ${pct(ratioInteres)} de lo que ${v.pedis}. Por cada 100 prestados ${v.devolves} ${sim.costPer100.toFixed(0)} en total.`,
  });

  // 2) Plazo más corto: la comparación que cambia más plata con menos esfuerzo.
  const primera = shorter[0];
  if (primera) {
    const segunda = shorter[1];
    const cola = segunda
      ? ` A ${segunda.years} años son ${fmt(segunda.monthlyDelta)} más al mes y ${fmt(segunda.interestSaved)} menos de intereses.`
      : "";
    out.push({
      kind: "plazo_corto",
      tone: "good",
      title: `A ${primera.years} años ${v.ahorras} ${fmt(primera.interestSaved)}`,
      body: `Por ${fmt(primera.monthlyDelta)} más al mes, ${v.terminas} ${primera.monthsSaved} meses antes y ${v.pagas} ${fmt(primera.interestSaved)} menos en intereses.${cola}`,
    });
  }

  // 3) Capacidad: la cuota contra lo que de verdad le sobra y contra su carga actual.
  if (context) {
    const partes: string[] = [];
    let tono: SimInsight["tone"] = "info";
    let titulo = "Cómo entra esta cuota en tu mes";

    if (context.freeCashflow > 0) {
      const share = sim.monthlyTotal / context.freeCashflow;
      partes.push(`Esta cuota es el ${pct(share)} de tu flujo libre mensual.`);
      if (share > 1) {
        tono = "warn";
        titulo = "La cuota no cabe en tu flujo libre de hoy";
      }
    } else {
      tono = "warn";
      titulo = `Hoy no ${v.tenes} flujo libre para esta cuota`;
      partes.push(
        "Tu sobrante mensual actual es cero o negativo, así que la cuota saldría de otro lado.",
      );
    }

    if (context.incomeMonthly > 0) {
      const antes = context.existingDebtPayments / context.incomeMonthly;
      const despues = (context.existingDebtPayments + sim.monthlyTotal) / context.incomeMonthly;
      partes.push(`Tu carga de deuda pasaría del ${pct(antes)} al ${pct(despues)} de tu ingreso.`);
      if (despues >= UMBRAL_DTI_ALTO) {
        tono = "warn";
        titulo = "Tu carga de deuda quedaría en zona de riesgo";
      } else if (despues >= UMBRAL_DTI && tono !== "warn") {
        tono = "warn";
        titulo = "Tu carga de deuda quedaría ajustada";
      }
      partes.push(
        `Por encima del ${pct(UMBRAL_DTI_ALTO)} el margen para un imprevisto se vuelve muy fino.`,
      );
    }

    out.push({ kind: "capacidad", tone: tono, title: titulo, body: partes.join(" ") });
  }

  // 4) El seguro: chico cada mes, grande a lo largo del plazo.
  if (sim.insuranceMonthly > 0) {
    out.push({
      kind: "seguro",
      tone: "info",
      title: "Lo que suma el seguro",
      body: `${fmt(sim.insuranceMonthly)} al mes son ${fmt(sim.totalInsurance)} en ${anosTexto(sim.months)}. No baja el saldo: se paga aparte del capital.`,
    });
  }

  out.push({
    kind: "cierre",
    tone: "info",
    title: "La decisión es tuya",
    body: `Estos son los números; no hay nada guardado ni comprometido. ${v.Simula} los plazos que quieras antes de firmar.`,
  });

  return out;
}

/** El texto que se le manda al asesor cuando el usuario quiere conversar el escenario. */
export function escenarioParaAsesor(args: {
  input: LoanSimInput;
  sim: LoanSim;
  currency: string;
  fmt: (n: number) => string;
  voz?: Voz;
}): string {
  const { input, sim, currency, fmt } = args;
  const v = CONJUGACION[args.voz ?? "vos"];
  const partes = [
    `Estoy evaluando un préstamo de ${fmt(input.principal)} ${currency}`,
    `a ${input.aprPct}% anual`,
    `a ${anosTexto(input.termMonths)}`,
  ];
  if (sim.insuranceMonthly > 0) partes.push(`con ${fmt(sim.insuranceMonthly)} de seguro mensual`);
  return (
    `${partes.join(", ")}. La cuota me daría ${fmt(sim.monthlyTotal)} al mes, ` +
    `${fmt(sim.totalInterest)} de intereses y ${fmt(sim.totalPaid)} pagados en total. ` +
    `¿Me conviene? ¿Qué mirarías ${v.tu} antes de firmar?`
  );
}
