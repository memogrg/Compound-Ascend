/**
 * ONE-OFF · normaliza a "mensual" las fuentes de ingreso sub-mensuales que ya
 * existían cuando se unificó la semántica del monto (PR #740).
 *
 * POR QUÉ: hasta #740, `getBudgetTotals` ignoraba la frecuencia y sumaba el
 * monto crudo. Una fuente marcada `quincenal` con monto 1.085.000 contaba
 * 1.085.000 en el mes. Con la semántica única (el monto es lo que se recibe POR
 * PAGO) esa misma fila pasa a contar 2.170.000 — y desde afuera es imposible
 * saber si la persona cargó su quincena (el número nuevo es el correcto) o su
 * salario mensual mal etiquetado (el número nuevo la infla al doble).
 *
 * QUÉ HACE: deja la frecuencia en "mensual" CONSERVANDO el monto, así el
 * presupuesto del mes queda idéntico a hoy — cero cambio visible — y siembra un
 * aviso único (`frecuencia_ingreso_revisar`, exento de la reconciliación de
 * syncInsights) para que la persona la vuelva a marcar ella misma, ahora con la
 * UI que muestra el equivalente mensual en vivo.
 *
 * NO toca el hogar de MI_HOGAR: esas filas van con la semántica nueva, ya confirmado.
 *
 * USO:
 *   node scripts/normalize-income-frequency.mjs            # simulación (no escribe)
 *   node scripts/normalize-income-frequency.mjs --aplicar  # escribe
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local. Idempotente: al correrlo de
 * nuevo no encuentra filas (ya están en mensual) y el insight va por upsert.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const APLICAR = process.argv.includes("--aplicar");
const MI_HOGAR = "cc526753-f776-4442-ab39-0330ceda4e0b"; // el hogar de David: sus filas NO se tocan

// Fuentes de ingreso con frecuencia != mensual, fuera del hogar de David.
const { data: filas } = await db
  .from("budget_items")
  .select("id,name,amount,currency,frequency,period_year,period_month,user_id,household_id,recurring_item_id")
  .eq("type", "income")
  .neq("frequency", "mensual");

const objetivo = (filas ?? []).filter((r) => r.household_id !== MI_HOGAR);

console.log(`=== filas a normalizar: ${objetivo.length} (modo: ${APLICAR ? "APLICAR" : "simulación"}) ===`);
for (const r of objetivo) {
  console.log(`  ${r.period_year}-${String(r.period_month).padStart(2,"0")} | ${r.name}`);
  console.log(`     ANTES:   ${r.amount} ${r.currency} · frequency=${r.frequency}  -> presupuesto del mes se duplicaría`);
  console.log(`     DESPUÉS: ${r.amount} ${r.currency} · frequency=mensual        -> presupuesto del mes IDÉNTICO a hoy`);
}
if (objetivo.length === 0) { console.log("  (nada que hacer)"); process.exit(0); }

const usuarios = [...new Set(objetivo.map((r) => r.user_id))];
console.log(`\n=== cuentas afectadas: ${usuarios.length} ===`);

if (!APLICAR) { console.log("\nSimulación: no se escribió nada. Correr con --aplicar."); process.exit(0); }

// 1) Normalizar la frecuencia conservando el monto.
for (const r of objetivo) {
  const { error } = await db.from("budget_items").update({ frequency: "mensual" }).eq("id", r.id);
  console.log(`  budget_items ${r.id} -> mensual ${error ? "ERROR " + error.message : "OK"}`);
  // Y su plantilla recurrente, si la tiene, para que la agenda no la reintroduzca con la vieja frecuencia.
  if (r.recurring_item_id) {
    const { error: e2 } = await db.from("recurring_items").update({ frequency: "mensual" }).eq("id", r.recurring_item_id);
    console.log(`    recurring_items ${r.recurring_item_id} -> mensual ${e2 ? "ERROR " + e2.message : "OK"}`);
  }
}

// 2) Sembrar el aviso único por cuenta (kind exento de la reconciliación).
for (const uid of usuarios) {
  const suyas = objetivo.filter((r) => r.user_id === uid);
  const nombres = [...new Set(suyas.map((r) => r.name))].join(", ");
  const { data: hh } = await db.from("budget_items").select("household_id").eq("user_id", uid).limit(1);
  const { error } = await db.from("user_insights").upsert(
    {
      user_id: uid,
      household_id: hh?.[0]?.household_id ?? null,
      kind: "frecuencia_ingreso_revisar",
      severity: "observar",
      title: "Revisá la frecuencia de tu ingreso",
      body:
        `Cambiamos cómo se lee el monto de una fuente: ahora es SIEMPRE lo que recibís POR PAGO ` +
        `(tu quincena, no el total del mes). Para no mover tus números sin avisar, dejamos ` +
        `${suyas.length === 1 ? "esta fuente" : "estas fuentes"} en frecuencia mensual: ${nombres}. ` +
        `Si en realidad te pagan por quincena, marcalo de nuevo y vas a ver el equivalente mensual en vivo mientras escribís.`,
      metric: null,
      related_kind: null,
      related_id: null,
      status: "activo",
    },
    { onConflict: "user_id,kind,related_id" },
  );
  console.log(`  insight sembrado para ${uid}: ${error ? "ERROR " + error.message : "OK"}`);
}
