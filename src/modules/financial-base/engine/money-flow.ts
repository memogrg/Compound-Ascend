/**
 * "El viaje del dinero" — motor puro, sin IO (Trazabilidad Fase B). Deriva de una
 * transacción de dónde salió el dinero, a dónde llegó/se almacena, y su efecto en
 * tu liquidez. Web y móvil consumen ESTA función para contar la misma historia.
 *
 * La contraparte (fuente/comercio/entidad) SIEMPRE vive en `merchantOrSource`: los
 * builders de vínculos (engine/linked.ts) hornean ahí el nombre de la deuda, la
 * meta, la póliza o el activo. Por eso la función es pura sobre la transacción; no
 * necesita un mapa externo de nombres.
 */
import type { LinkedKind, Transaction } from "@/modules/financial-base/types";

/** Efecto en el saco de liquidez: sale (−), entra (+) o no lo toca. */
export type MoneyFlowEffect = "out" | "in" | "neutral";

export type MoneyFlowVerb =
  | "se_almacena_en"
  | "abona_a"
  | "pagado_a"
  | "recibido_en"
  | "movido_entre_cuentas"
  | "ajuste";

export type MoneyFlow = {
  effect: MoneyFlowEffect;
  /** Origen del dinero. */
  fromLabel: string;
  /** Destino del dinero (vacío en el consumo de frasco: la UI usa copia especial). */
  toLabel: string;
  verb: MoneyFlowVerb;
  /** true sólo en el consumo de un frasco de meta: la UI muestra
   *  "sale del frasco · no toca tu liquidez" (neutro/gris). */
  isJarSpend: boolean;
};

/** Etiqueta fija del saco de liquidez en la línea de viaje. */
export const LIQUIDITY_LABEL = "Tu liquidez";

/** Copia del verbo para la sección de detalle (español, "tú"). */
export const FLOW_VERB_LABEL: Record<MoneyFlowVerb, string> = {
  se_almacena_en: "Se almacena en",
  abona_a: "Abona a",
  pagado_a: "Pagado a",
  recibido_en: "Recibido en",
  movido_entre_cuentas: "Movido entre cuentas",
  ajuste: "Ajuste",
};

/** Sólo los campos que la función necesita (mantiene el test trivial). */
export type MoneyFlowInput = Pick<
  Transaction,
  "kind" | "linkedKind" | "merchantOrSource" | "accountLabel" | "countsInBudget"
>;

/** Contraparte legible: el comercio/fuente/entidad, con fallback por tipo. */
function counterpartyOf(t: MoneyFlowInput): string {
  const m = t.merchantOrSource?.trim();
  if (m) return m;
  return t.kind === "ingreso" ? "Ingreso" : t.kind === "gasto" ? "Gasto" : "Movimiento";
}

/** Parte una transferencia "A → B" en [origen, destino]; cae a accountLabel. */
function splitTransfer(merchant: string | null, accountLabel: string | null): [string, string] {
  const m = merchant?.trim();
  if (m && m.includes("→")) {
    const [a, b] = m.split("→");
    return [a?.trim() || accountLabel || "Cuenta", b?.trim() || "Otra cuenta"];
  }
  return [accountLabel || "Cuenta", m || "Otra cuenta"];
}

/**
 * Describe el viaje del dinero y su efecto en la liquidez. Ver la tabla de verdad
 * en money-flow.test.ts.
 */
export function describeMoneyFlow(t: MoneyFlowInput): MoneyFlow {
  const linked: LinkedKind = t.linkedKind ?? "none";
  const counterparty = counterpartyOf(t);

  // Consumo de un frasco de meta (gasto OFF-BUDGET): el dinero sale del frasco, NO
  // de tu liquidez (ya salió al aportar). Neutro. La contraparte es el frasco.
  if (t.kind === "gasto" && linked === "goal" && t.countsInBudget === false) {
    return { effect: "neutral", fromLabel: counterparty, toLabel: "", verb: "pagado_a", isJarSpend: true };
  }

  // Transferencia entre cuentas: neutra. merchant_or_source viene como "A → B".
  if (t.kind === "transferencia") {
    const [from, to] = splitTransfer(t.merchantOrSource, t.accountLabel);
    return { effect: "neutral", fromLabel: from, toLabel: to, verb: "movido_entre_cuentas", isJarSpend: false };
  }

  // Ajuste: neutro, sin viaje.
  if (t.kind === "ajuste") {
    return { effect: "neutral", fromLabel: "—", toLabel: "—", verb: "ajuste", isJarSpend: false };
  }

  // Ingreso (salario, dividendo/renta, venta o retiro): entra a tu liquidez.
  if (t.kind === "ingreso") {
    return { effect: "in", fromLabel: counterparty, toLabel: LIQUIDITY_LABEL, verb: "recibido_en", isJarSpend: false };
  }

  // Gasto: sale de tu liquidez. El verbo del destino depende del vínculo:
  //  · deuda/póliza → "abona a"; meta/inversión → "se almacena en"; suelto → "pagado a".
  const verb: MoneyFlowVerb =
    linked === "debt" || linked === "policy"
      ? "abona_a"
      : linked === "goal" || linked === "holding"
        ? "se_almacena_en"
        : "pagado_a";
  return { effect: "out", fromLabel: LIQUIDITY_LABEL, toLabel: counterparty, verb, isJarSpend: false };
}
