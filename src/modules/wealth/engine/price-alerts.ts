/**
 * Lógica pura de las alertas de inversión (sin IO). El servicio/cron hacen los
 * SELECT/UPDATE, el fetch de precios y la lectura de purchaseDate; acá vive lo
 * testeable: si una alerta (de cualquier tipo) debe dispararse. Extensible: agregar
 * un tipo nuevo = un `case` en alertFires + su helper puro.
 */

export type AlertDirection = "above" | "below";
export type AlertKind = "price" | "time_held" | "vesting";

/**
 * Mapea el parámetro `?kinds` del cron a los tipos a evaluar:
 *   price → solo precio (la única corrida que llama getMarketPrice).
 *   date  → time_held + vesting (comparado de fechas, sin llamadas de mercado).
 *   all / vacío / desconocido → undefined = todos (retrocompatible).
 */
export function kindsFromParam(param: string | null | undefined): AlertKind[] | undefined {
  if (param === "price") return ["price"];
  if (param === "date") return ["time_held", "vesting"];
  return undefined;
}

/**
 * ¿El precio cruzó el objetivo en la dirección pedida?
 *   above → el precio subió A o por encima del objetivo (price >= target).
 *   below → el precio bajó A o por debajo del objetivo (price <= target).
 * Precio no válido (≤0, NaN) → false (nunca dispara con datos malos).
 */
export function crossed(direction: AlertDirection, price: number, target: number): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  return direction === "above" ? price >= target : price <= target;
}

/**
 * Símbolos distintos a consultar (un getMarketPrice por símbolo, no por alerta).
 * Normaliza a MAYÚSCULAS y guarda el asset_type para el fetch. Si el mismo símbolo
 * aparece con tipos distintos, se consulta cada par (symbol, type) una vez.
 */
export function distinctSymbolFetches<T extends { symbol: string; assetType: string }>(
  alerts: T[],
): { symbol: string; assetType: string }[] {
  const seen = new Set<string>();
  const out: { symbol: string; assetType: string }[] = [];
  for (const a of alerts) {
    const symbol = a.symbol.toUpperCase();
    const key = `${symbol}|${a.assetType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ symbol, assetType: a.assetType });
  }
  return out;
}

/** Clave del mapa de precios: símbolo (MAYÚS) + tipo, para no cruzar el mismo ticker de tipos distintos. */
export function priceKey(symbol: string, assetType: string): string {
  return `${symbol.toUpperCase()}|${assetType}`;
}

/** Años transcurridos (fraccionarios) desde purchaseDate hasta nowIso. 0 si datos malos o futuro. */
export function yearsHeld(purchaseDate: string, nowIso: string): number {
  const start = Date.parse(purchaseDate);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(start) || !Number.isFinite(now) || now <= start) return 0;
  return (now - start) / (365.25 * 24 * 3600 * 1000);
}

/** time_held: dispara cuando los años invertidos alcanzan el umbral. Sin purchaseDate → no dispara. */
export function timeHeldFires(
  purchaseDate: string | null | undefined,
  yearsThreshold: number,
  nowIso: string,
): boolean {
  if (!purchaseDate || !(yearsThreshold > 0)) return false;
  return yearsHeld(purchaseDate, nowIso) >= yearsThreshold;
}

/** vesting: dispara cuando la fecha de hoy alcanzó o pasó la fecha objetivo (comparación ISO). */
export function vestingFires(triggerDate: string | null | undefined, nowIso: string): boolean {
  if (!triggerDate) return false;
  return nowIso.slice(0, 10) >= triggerDate.slice(0, 10);
}

/** Datos externos que necesitan los evaluadores: precios (por símbolo) y purchaseDate (por holding). */
export type AlertEvalContext = {
  nowIso: string;
  priceByKey: ReadonlyMap<string, { price: number }>;
  purchaseDateByHolding: ReadonlyMap<string, string | null>;
};

/** Campos mínimos que una alerta expone para evaluarse (subconjunto del row). */
export type EvaluableAlert = {
  kind: AlertKind;
  symbol: string | null;
  assetType: string | null;
  direction: AlertDirection | null;
  targetPrice: number | null;
  holdingId: string | null;
  yearsThreshold: number | null;
  triggerDate: string | null;
};

/**
 * ¿La alerta debe dispararse AHORA? Un `case` por tipo → un tipo nuevo se agrega acá + su helper.
 * Datos faltantes (sin precio / sin purchaseDate / sin fecha) → false: nunca rompe el barrido.
 * El llamador solo pasa alertas ACTIVAS, así que una one_shot ya disparada no llega → no re-dispara.
 */
export function alertFires(a: EvaluableAlert, ctx: AlertEvalContext): boolean {
  switch (a.kind) {
    case "price": {
      if (!a.symbol || !a.assetType || a.direction === null || a.targetPrice === null) return false;
      const quote = ctx.priceByKey.get(priceKey(a.symbol, a.assetType));
      return quote !== undefined && crossed(a.direction, quote.price, a.targetPrice);
    }
    case "time_held":
      return (
        a.holdingId !== null &&
        a.yearsThreshold !== null &&
        timeHeldFires(ctx.purchaseDateByHolding.get(a.holdingId), a.yearsThreshold, ctx.nowIso)
      );
    case "vesting":
      return vestingFires(a.triggerDate, ctx.nowIso);
    default:
      return false;
  }
}

/** Alertas que deben dispararse (best-effort: las que no cumplen o no tienen datos se descartan). */
export function selectFiringAlerts<T extends EvaluableAlert>(alerts: T[], ctx: AlertEvalContext): T[] {
  return alerts.filter((a) => alertFires(a, ctx));
}
