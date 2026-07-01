/**
 * Chequeo READ-ONLY: lista inversiones de flujo/manuales que probablemente
 * quedaron FUSIONADAS antes del fix (PR #212) y perdieron su ingreso.
 *
 * Síntoma: el merge por promedio no reescribía rental_income/nature, así que la
 * posición dejó de verse en Ingresos (el bloque derivado filtra
 * nature='cashflow' AND rental_income>0). Este script las lista para reeditarlas
 * una vez (reingresar el ingreso y guardar).
 *
 * NO modifica nada (solo SELECT). Usa service-role del Supabase de .env.local.
 * Uso:  node scripts/check-flow-holdings.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Carga mínima de .env.local (sin dependencia de dotenv).
function loadEnvLocal() {
  const out = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* noop: puede venir del entorno */
  }
  return out;
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const QUOTED = new Set(["etf", "accion", "cripto"]);
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data, error } = await admin
  .from("investment_holdings")
  .select(
    "id,label,symbol,asset_type,category,nature,rental_income,rental_frequency,currency,current_value_manual,created_at",
  )
  .order("created_at", { ascending: true });

if (error) {
  console.error("Consulta falló:", error.message);
  process.exit(1);
}

// Candidatas: NO cotizadas y sin ingreso efectivo (rental_income nulo o 0), o
// sin nature (el merge no la escribía). Son las que conviene revisar/reeditar.
const candidates = (data ?? []).filter(
  (h) =>
    !QUOTED.has(h.asset_type) &&
    (h.rental_income == null || Number(h.rental_income) <= 0 || h.nature == null),
);

console.log(`\nInversiones no cotizadas: ${(data ?? []).filter((h) => !QUOTED.has(h.asset_type)).length}`);
console.log(`Candidatas a reeditar (sin ingreso / sin nature): ${candidates.length}\n`);

if (candidates.length === 0) {
  console.log("✔ Nada que reeditar: todas las posiciones de flujo tienen ingreso y nature.");
  process.exit(0);
}

for (const h of candidates) {
  console.log(
    [
      `• ${h.label ?? h.symbol}`,
      `tipo=${h.asset_type}`,
      `cat=${h.category ?? "—"}`,
      `nature=${h.nature ?? "NULL"}`,
      `rental_income=${h.rental_income ?? "NULL"}`,
      `freq=${h.rental_frequency ?? "—"}`,
      `valor=${h.current_value_manual ?? "—"} ${h.currency}`,
      `id=${h.id}`,
    ].join("  |  "),
  );
}
console.log(
  "\nAcción: abrí cada una en Patrimonio → editar → reingresá el ingreso y guardá.\n" +
    "Nota: puede haber falsos positivos (activos de crecimiento sin renta); revisá caso por caso.",
);
