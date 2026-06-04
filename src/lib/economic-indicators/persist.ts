import "server-only";

/**
 * Escritura de indicadores en economic_indicators. Tabla global sin RLS de
 * escritura: solo el service-role puede insertar/actualizar (igual que
 * market_price_cache). Upsert idempotente por (indicator_code, observed_date).
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { IndicatorUnit } from "@/lib/economic-indicators/catalog";

export interface IndicatorUpsert {
  indicatorCode: string;
  source: string;
  unit: IndicatorUnit;
  value: number;
  observedDate: string; // yyyy-mm-dd
}

/**
 * Hace upsert de un lote de observaciones. Lanza si la escritura falla
 * (error-checking obligatorio en toda mutación).
 */
export async function upsertIndicators(rows: IndicatorUpsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createServiceRoleClient();
  const fetchedAt = new Date().toISOString();

  const payload = rows.map((r) => ({
    indicator_code: r.indicatorCode,
    source: r.source,
    unit: r.unit,
    value: r.value,
    observed_date: r.observedDate,
    fetched_at: fetchedAt,
  }));

  const { error } = await supabase
    .from("economic_indicators")
    .upsert(payload, { onConflict: "indicator_code,observed_date" });
  if (error) throw new Error(error.message);

  return payload.length;
}
