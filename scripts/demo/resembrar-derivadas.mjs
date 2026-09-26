/**
 * Resiembra las partidas DERIVADAS (`debt`, `goal`) de los meses CERRADOS de la demo.
 *
 * Por qué hace falta: `syncDerivedBudget` solo corre para el mes en curso y los futuros
 * —el PR #819 le puso ese guard porque una LECTURA no debe escribir, y abrir un mes viejo
 * creaba sus líneas CON LOS MONTOS DE HOY, un presupuesto que nunca existió—. Resultado:
 * la demo tiene sus doce meses cerrados con solo `manual`, y septiembre con `manual` +
 * `debt` + `goal`. El histórico de `/gastos` compara un gasto completo contra un
 * presupuesto al que le faltan las cuotas y los aportes.
 *
 * Qué hace: CLONA las líneas derivadas del mes en curso a cada mes cerrado. No inventa
 * montos — copia los que la propia app escribió, con su `source_id`, su `category_id` y su
 * `household_id`. En esta demo los compromisos son constantes (las tres deudas y las dos
 * metas arrancan el 2025-09-01 y no cambian de cuota), así que clonar ES la historia
 * correcta. En una cuenta con cuotas variables NO lo sería, y por eso esto vive en
 * `scripts/demo/` y no en el producto.
 *
 * NUNCA corre contra producción por accidente: exige `DEMO_ENV_FILE` explícito.
 *
 * Habla con PostgREST por `fetch` y no con `@supabase/supabase-js`: esa librería exige
 * Node 22+ (WebSocket nativo para realtime, que acá no se usa para nada) y revienta al
 * construir el cliente en Node 20.
 *
 *   DEMO_ENV_FILE=.env.local node scripts/demo/resembrar-derivadas.mjs --dry
 *   DEMO_ENV_FILE=.env.local node scripts/demo/resembrar-derivadas.mjs
 */
import { readFileSync } from "node:fs";

const ENVFILE = process.env.DEMO_ENV_FILE;
if (!ENVFILE) {
  console.error("Falta DEMO_ENV_FILE. Se exige explícito para no tocar producción sin querer.");
  process.exit(2);
}
const SECO = process.argv.includes("--dry");

const env = {};
for (const line of readFileSync(new URL(`../../${ENVFILE}`, import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const cab = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(ruta, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${ruta}`, {
    ...init,
    headers: { ...cab, ...(init.headers ?? {}) },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${ruta}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}
async function admin(ruta) {
  const r = await fetch(`${URL_}/auth/v1/${ruta}`, { headers: cab });
  if (!r.ok) throw new Error(`${r.status} ${ruta}`);
  return r.json();
}

const EMAIL = process.env.DEMO_EMAIL ?? "information.theglowup@gmail.com";
console.log(`objetivo: ${URL_}  (${ENVFILE})${SECO ? "  [SIMULACRO]" : ""}`);

// ── la cuenta ────────────────────────────────────────────────────────────────
const usuarios = await admin("admin/users?per_page=200");
const lista = usuarios.users ?? usuarios;
const user = lista.find((u) => u.email === EMAIL);
if (!user) {
  console.error(`No existe la cuenta ${EMAIL} en este entorno.`);
  process.exit(1);
}
console.log(`cuenta: ${EMAIL}  ${user.id}`);

// ── el molde: las derivadas del mes MÁS RECIENTE que las tenga ───────────────
const todas = await rest(
  `budget_items?select=*&user_id=eq.${user.id}&source_kind=in.(debt,goal)` +
    `&order=period_year.desc,period_month.desc&limit=5000`,
);
if (!todas.length) {
  console.error(
    "La cuenta no tiene ninguna línea derivada que clonar. Abrí /mi-base-financiera primero.",
  );
  process.exit(1);
}
const molde = { year: todas[0].period_year, month: todas[0].period_month };
const plantillas = todas.filter(
  (r) => r.period_year === molde.year && r.period_month === molde.month,
);
console.log(
  `molde: ${molde.year}-${String(molde.month).padStart(2, "0")} · ${plantillas.length} líneas`,
);
for (const p of plantillas)
  console.log(`   ${p.source_kind}  ${p.name}  ${Number(p.amount).toLocaleString("es-CR")}`);

// ── los meses cerrados que ya tienen `manual` pero no derivadas ──────────────
const manuales = await rest(
  `budget_items?select=period_year,period_month&user_id=eq.${user.id}&source_kind=eq.manual&limit=5000`,
);
const conManual = new Set(manuales.map((r) => `${r.period_year}-${r.period_month}`));
const conDerivadas = new Set(todas.map((r) => `${r.period_year}-${r.period_month}`));
const objetivo = [...conManual]
  .filter((k) => !conDerivadas.has(k))
  .map((k) => k.split("-").map(Number))
  .sort((a, b) => a[0] * 12 + a[1] - (b[0] * 12 + b[1]));

console.log(`\nmeses a completar: ${objetivo.length}`);
if (objetivo.length === 0) {
  console.log("nada que hacer.");
  process.exit(0);
}

const filas = [];
for (const [y, m] of objetivo)
  for (const p of plantillas) {
    // Se copia TODO menos lo que identifica a la fila y a su mes. `created_at`/`updated_at`
    // los pone la base: falsearlos diría que esta línea existía desde entonces.
    const { id: _id, created_at: _c, updated_at: _u, ...resto } = p;
    filas.push({ ...resto, id: crypto.randomUUID(), period_year: y, period_month: m });
  }

console.log(`filas a insertar: ${filas.length}`);
if (SECO) {
  console.log("SIMULACRO: no se escribe nada.");
  process.exit(0);
}
for (let i = 0; i < filas.length; i += 400) {
  await rest("budget_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(filas.slice(i, i + 400)),
  });
}
console.log(`listo: ${filas.length} líneas derivadas en ${objetivo.length} meses.`);
