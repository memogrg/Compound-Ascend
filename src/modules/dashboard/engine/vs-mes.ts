import type { Tone, VsMes } from "./home-cards";

/**
 * Constructores PUROS del delta "vs mes anterior" de cada ficha del Inicio. Reciben datos
 * ya cargados (el service async hace las lecturas y la conversión de moneda) y devuelven el
 * `VsMes` listo para pintar, o `null` para que la ficha degrade sin chip. Aquí vive la
 * SEMÁNTICA (signo, color por dominio, verbo); el componente solo dibuja flecha + color.
 *
 * Convención de color: `dir` es la dirección de la flecha (movimiento del subyacente) y
 * `tone` el color YA resuelto. Para casi todo, subir = bueno; Deudas lo INVIERTE (bajar la
 * deuda es bueno → verde). Ese cruce vive en `toneOf(dir, inverted)`, no en el componente.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toneOf(dir: "up" | "down" | "flat", inverted: boolean): Tone {
  if (dir === "flat") return "neutral";
  const good = inverted ? dir === "down" : dir === "up";
  return good ? "pos" : "neg";
}

/** Delta de MONTO (Ahorros/Deudas): `net` con signo; el valor mostrado es su magnitud. */
function amountVsMes(net: number, label: string, inverted: boolean): VsMes {
  const dir = net > 0 ? "up" : net < 0 ? "down" : "flat";
  return {
    format: "amount",
    value: Math.abs(round2(net)),
    dir,
    tone: toneOf(dir, inverted),
    label,
  };
}

/** Delta de PORCENTAJE (Inversiones/Patrimonio): `deltaPct` en 0-1 con signo. */
function pctVsMes(deltaPct: number, label: string): VsMes {
  const dir = deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat";
  return {
    format: "percent",
    value: Math.abs(round2(deltaPct)),
    dir,
    tone: toneOf(dir, false),
    label,
  };
}

// ---------------------------------------------------------------------------
// Patrimonio — ±% del neto vs mes anterior (wealthVelocity ya = neto − previo)
// ---------------------------------------------------------------------------
/**
 * Piso para decidir "base ≈ 0": si |neto del mes anterior| cae por debajo, el % pierde
 * sentido (÷ casi 0) y se muestra el cambio en MONTO, conservando flecha + tono.
 */
const NETWORTH_BASE_FLOOR = 1;

export function buildPatrimonioVsMes(input: {
  netWorth: number;
  /** RichLifeIndicators.wealthVelocity: null cuando no hay snapshot previo (sin_historico). */
  wealthVelocity: number | null;
  /** RichLifeIndicators.velocityIsPartial: el neto es de HOY contra el cierre del mes
   *  pasado, así que el chip NO puede decir "vs mes ant." —no es un mes cumplido— sino
   *  "en el mes". Mismo número, rótulo honesto. */
  velocityIsPartial?: boolean;
}): VsMes {
  const { netWorth, wealthVelocity } = input;
  const label = input.velocityIsPartial ? "en el mes" : "vs mes ant.";
  if (wealthVelocity == null) return null; // sin histórico → sin chip
  // Flecha + color SIEMPRE del signo de la velocidad (mejora/empeora), sin importar el
  // signo de la base: un neto NEGATIVO que mejora debe mostrar ▲ verde y uno que empeora
  // ▼ rojo. Antes, con neto previo ≤ 0 el chip desaparecía y el sobreendeudado / de ingreso
  // muy bajo no veía su tendencia. NO se toca aggregateNetWorth ni wealthVelocity: sólo la
  // presentación. La magnitud usa |base| para no invertir el signo ni dividir por 0.
  const base = Math.abs(netWorth - wealthVelocity); // |neto del mes anterior|
  if (base < NETWORTH_BASE_FLOOR) {
    // Base ≈ 0: sin % con sentido → cambio en monto (misma flecha + tono).
    return amountVsMes(wealthVelocity, label, false);
  }
  return pctVsMes(wealthVelocity / base, label);
}

// ---------------------------------------------------------------------------
// Inversiones — ±% del valor vs el cierre del mes anterior (portfolio_snapshots)
// ---------------------------------------------------------------------------
export type SnapshotPoint = { date: string; portfolioValue: number };

export function buildInversionesVsMes(input: {
  currentValue: number;
  snapshots: SnapshotPoint[];
  /** period.to del mes anterior (YYYY-MM-DD): tomamos el último snapshot en/antes de esa fecha. */
  prevMonthEnd: string;
}): VsMes {
  const { currentValue, snapshots, prevMonthEnd } = input;
  const prior = snapshots
    .filter((s) => s.date <= prevMonthEnd && s.portfolioValue > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const prev = prior.length ? prior[prior.length - 1]!.portfolioValue : null;
  if (prev == null || prev <= 0) return null; // serie corta/rala (cuenta nueva) → sin chip
  return pctVsMes((currentValue - prev) / prev, "vs mes ant.");
}

/** Convierte un monto de su moneda a la de display. Lo inyecta el caller (FX vive aquí, testeable). */
export type Convert = (amount: number, from: string) => number;

// ---------------------------------------------------------------------------
// Ahorros — neto aportado/retirado del mes en curso (FX por movimiento)
// ---------------------------------------------------------------------------
export type GoalMovement = {
  kind: "ingreso" | "gasto";
  amount: number;
  currency: string;
  /** false = gasto fuera de presupuesto = consumo del fondo (baja el saldo). */
  countsInBudget: boolean;
};

export function buildAhorrosVsMes(movements: GoalMovement[], convert: Convert): VsMes {
  if (movements.length === 0) return null; // sin movimientos este mes → sin chip
  // Mismo criterio de signo que goal-detail-service: gasto en presupuesto = aporte (+);
  // ingreso = retiro (−); gasto fuera de presupuesto = consumo (−). Cada monto se normaliza
  // a la moneda de display ANTES de netear (metas en varias monedas no se pueden sumar crudas).
  let net = 0;
  for (const m of movements) {
    const amt = convert(m.amount, m.currency);
    if (m.kind === "ingreso") net -= amt;
    else if (m.countsInBudget === false) net -= amt;
    else net += amt;
  }
  const label = net > 0 ? "aportaste" : net < 0 ? "retiraste" : "sin cambios";
  return amountVsMes(net, label, false);
}

// ---------------------------------------------------------------------------
// Deudas — neto (altas − pagos) del mes en curso; COLOR INVERTIDO (bajar = verde)
// ---------------------------------------------------------------------------
/** Pago de deuda (txn linked_kind='debt', kind='gasto' = abono), en su moneda. */
export type DebtPayment = { kind: "ingreso" | "gasto"; amount: number; currency: string };
/** Deuda para detectar ALTAS del periodo por su fecha de alta, en su moneda. */
export type DebtForAltas = {
  balance: number;
  originalAmount: number | null;
  currency: string;
  createdOn: string;
};

export function buildDeudasVsMes(input: {
  payments: DebtPayment[];
  debts: DebtForAltas[];
  /** Ventana del periodo (YYYY-MM-DD) para filtrar las altas por createdOn. */
  from: string;
  to: string;
  convert: Convert;
}): VsMes {
  // CAVEAT (documentado a propósito): esto mide PAGOS − ALTAS (deudas nuevas del periodo,
  // por su fecha de alta), NO el cambio contable exacto del saldo. El saldo de deuda no
  // tiene historial y los pagos ordinarios no lo mutan; por eso esta señal NO refleja el
  // interés que se acumula ni subidas de saldo por edición. Es la aproximación honesta
  // disponible; ver la auditoría vs-mes-por-dominio.
  const { payments, debts, from, to, convert } = input;
  const pagado = payments
    .filter((p) => p.kind === "gasto")
    .reduce((s, p) => s + convert(p.amount, p.currency), 0);
  const adquirido = debts
    .filter((d) => d.createdOn.slice(0, 10) >= from && d.createdOn.slice(0, 10) <= to)
    .reduce((s, d) => s + convert(d.originalAmount ?? d.balance, d.currency), 0);
  if (pagado === 0 && adquirido === 0) return null; // sin movimiento de deuda → sin chip
  const netChange = adquirido - pagado; // + = la deuda creció; − = bajó
  const label = netChange < 0 ? "pagaste" : netChange > 0 ? "adquiriste" : "sin cambios";
  return amountVsMes(netChange, label, /* inverted */ true);
}
