/**
 * Siembra DEMO de economic_indicators (datos sintéticos) y renderiza en consola
 * las tarjetas tal como las computa el frontend. Borrar con --clean.
 *
 *   node scripts/seed-indicators-demo.cjs          # siembra + demo
 *   node scripts/seed-indicators-demo.cjs --clean  # borra los datos demo
 */
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

// --- Lee credenciales de .env.local sin dependencias extra ---
const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CODES = ["TBP", "TPM", "USDCRC_COMPRA", "USDCRC_VENTA"];

// Series con tendencia decreciente realista (CR en desinflación, ~2025-2026).
const SERIES = {
  TBP: { unit: "percent", from: 4.25, to: 3.75 },
  TPM: { unit: "percent", from: 4.75, to: 4.0 },
  USDCRC_COMPRA: { unit: "currency", from: 512, to: 499 },
  USDCRC_VENTA: { unit: "currency", from: 520, to: 508 },
};

/** 13 puntos mensuales hasta hoy, interpolando from→to con ruido leve. */
function monthlyPoints({ from, to }) {
  const pts = [];
  const today = new Date("2026-06-04T00:00:00Z");
  for (let k = 12; k >= 0; k--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - k, 1));
    const t = (12 - k) / 12;
    const noise = (Math.sin(k * 1.7) * (to * 0.004));
    const value = +(from + (to - from) * t + noise).toFixed(2);
    pts.push({ observedDate: d.toISOString().slice(0, 10), value });
  }
  return pts;
}

function num2(v) {
  return new Intl.NumberFormat("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function fmtValue(v, unit) {
  if (unit === "percent") return `${num2(v)}%`;
  if (unit === "currency") return `₡${num2(v)}`;
  return num2(v);
}
function fmtChange(abs, unit) {
  const sign = abs >= 0 ? "+" : "−";
  const m = Math.abs(abs);
  if (unit === "percent") return `${sign}${num2(m)} pp`;
  if (unit === "currency") return `${sign}₡${num2(m)}`;
  return `${sign}${num2(m)}`;
}
/** Réplica de valueSixMonthsBack del indicators-service. */
function sixMonthsBack(points) {
  const last = points[points.length - 1].date;
  const t = new Date(last);
  t.setUTCMonth(t.getUTCMonth() - 6);
  const target = t.toISOString().slice(0, 10);
  let base = null;
  for (const p of points) {
    if (p.date <= target) base = p.value;
    else break;
  }
  return base;
}

async function clean() {
  const { error } = await supabase.from("economic_indicators").delete().in("indicator_code", CODES);
  if (error) throw new Error(error.message);
  console.log("🧹 Datos demo borrados (TBP, TPM, USDCRC_COMPRA, USDCRC_VENTA).");
}

async function seed() {
  const rows = [];
  const fetchedAt = new Date().toISOString();
  for (const code of CODES) {
    const s = SERIES[code];
    for (const p of monthlyPoints(s)) {
      rows.push({
        indicator_code: code,
        source: "BCCR",
        unit: s.unit,
        value: p.value,
        observed_date: p.observedDate,
        fetched_at: fetchedAt,
      });
    }
  }
  const { error } = await supabase
    .from("economic_indicators")
    .upsert(rows, { onConflict: "indicator_code,observed_date" });
  if (error) throw new Error(error.message);
  console.log(`🌱 Sembradas ${rows.length} filas (${CODES.length} indicadores × 13 meses).\n`);

  // Lee de vuelta y renderiza las tarjetas como el frontend.
  const LABELS = {
    TBP: "Tasa Básica Pasiva",
    TPM: "Tasa de Política Monetaria",
    USDCRC_COMPRA: "Dólar — compra",
    USDCRC_VENTA: "Dólar — venta",
  };
  console.log("┌─────────────────────────  COSTA RICA  ─────────────────────────┐\n");
  for (const code of CODES) {
    const { data, error: e } = await supabase
      .from("economic_indicators")
      .select("observed_date, value, unit")
      .eq("indicator_code", code)
      .order("observed_date", { ascending: true });
    if (e) throw new Error(e.message);
    const pts = data.map((r) => ({ date: r.observed_date, value: Number(r.value) }));
    const unit = data[0].unit;
    const latest = pts[pts.length - 1];
    const base = sixMonthsBack(pts);
    const abs = base !== null ? latest.value - base : null;
    const pct = base ? ((latest.value - base) / base) * 100 : null;
    const arrow = abs === null ? "" : abs >= 0 ? "▲" : "▼";
    const color = abs === null ? "" : abs >= 0 ? "[pos]" : "[neg]";

    console.log(`  ╭───────────────────────────────────────────────╮  [BCCR]`);
    console.log(`  │ ${LABELS[code].padEnd(45)} │`);
    console.log(`  │                                               │`);
    console.log(`  │   ${(fmtValue(latest.value, unit) + "  ").padEnd(20)}${arrow} ${color} ${fmtChange(abs, unit)} vs hace 6m`.padEnd(50) + " │");
    console.log(`  │   ${("(" + (pct === null ? "—" : (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%") + " relativo)").padEnd(45)} │`);
    console.log(`  │   ▁▂▃▄▅▆▇  histórico: ${pts.length} puntos  ·  últ: ${latest.date}`.padEnd(50) + " │");
    console.log(`  ╰───────────────────────────────────────────────╯\n`);
  }
  console.log("└────────────────────────────────────────────────────────────────┘");
  console.log('\n(Estados Unidos no aparece: FRED está deshabilitado en el catálogo.)');
}

(async () => {
  try {
    if (process.argv.includes("--clean")) await clean();
    else await seed();
  } catch (err) {
    console.error("ERROR:", err.message);
    process.exit(1);
  }
})();
