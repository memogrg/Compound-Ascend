/**
 * Cuenta demo "Familia Ramírez Solano" — José y Marta, Costa Rica.
 * 12 meses de historia (sep 2025 → ago 2026) con arco antes/después de CARTERA+.
 *
 * NO forma parte del producto. Se corre a mano:
 *   node scripts/demo/seed-demo-familia.mjs
 * Lee SUPABASE_URL / SERVICE_ROLE de .env.local. Idempotente: borra y resiembra
 * los datos de los dos usuarios demo antes de escribir.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// ── env ───────────────────────────────────────────────────────────────────────
const env = {};
const ENVFILE = process.env.DEMO_ENV_FILE ?? ".env.prod.local";
for (const line of readFileSync(new URL(`../../${ENVFILE}`, import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(URL_, KEY, { auth: { persistSession: false } });
console.log(`objetivo: ${URL_}  (${ENVFILE})`);

const ok = (label) => (res) => {
  if (res.error) {
    console.error(`✗ ${label}:`, res.error.message, res.error.details ?? "");
    process.exit(1);
  }
  return res.data;
};
const ins = async (table, rows, label) => {
  if (!rows.length) return [];
  const out = [];
  for (let i = 0; i < rows.length; i += 400) {
    const r = await db.from(table).insert(rows.slice(i, i + 400)).select("id");
    out.push(...(ok(label ?? table)(r) ?? []));
  }
  return out;
};

// ── PRNG reproducible ─────────────────────────────────────────────────────────
let _s = 20260828;
const rnd = () => ((_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const jitter = (base, pct) => base * (1 + (rnd() * 2 - 1) * pct);
/** Reparte `total` en n montos con ruido, redondeados a 50, sumando exacto. */
function split(total, n, pct = 0.35) {
  const raw = Array.from({ length: n }, () => jitter(1, pct));
  const s = raw.reduce((a, b) => a + b, 0);
  const parts = raw.map((r) => Math.round((total * r) / s / 50) * 50);
  const diff = total - parts.reduce((a, b) => a + b, 0);
  parts[0] += diff;
  return parts;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

// ── calendario ────────────────────────────────────────────────────────────────
const HOY = "2026-08-28";
const MESES = [];
for (let y = 2025, m = 9; MESES.length < 12; m++) {
  if (m > 12) { m = 1; y++; }
  MESES.push({ y, m, key: `${y}-${String(m).padStart(2, "0")}` });
}
const dim = (y, m) => new Date(y, m, 0).getDate();
const d = (y, m, day) => `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, dim(y, m))).padStart(2, "0")}`;
/** Fase del mes: 'antes' (sep–dic 25), 'giro' (ene 26), 'despues' (feb–ago 26). */
const fase = (k) => (k <= "2025-12" ? "antes" : k === "2026-01" ? "giro" : "despues");

// ── identidades ───────────────────────────────────────────────────────────────
const PASS = "CarteraPlus2026!";
const PERSONAS = [
  { email: "information.theglowup@gmail.com", name: "José Ramírez", role: "owner" },
  { email: "information.theglowup+marta@gmail.com", name: "Marta Solano", role: "adult" },
];

async function upsertUser(email, name) {
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = list?.users.find((u) => u.email === email);
  if (found) {
    await db.auth.admin.updateUserById(found.id, {
      password: PASS, email_confirm: true, user_metadata: { display_name: name },
    });
    return found.id;
  }
  const { data, error } = await db.auth.admin.createUser({
    email, password: PASS, email_confirm: true, user_metadata: { display_name: name },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

// ── main ──────────────────────────────────────────────────────────────────────
const JOSE = await upsertUser(PERSONAS[0].email, PERSONAS[0].name);
const MARTA = await upsertUser(PERSONAS[1].email, PERSONAS[1].name);
console.log("usuarios:", { JOSE, MARTA });

const UIDS = [JOSE, MARTA];

// Limpieza (orden hijo → padre).
const WIPE = [
  "liquidity_ledger", "goal_contributions", "debt_payments", "holding_contributions",
  "investment_transactions", "transactions", "budget_items", "monthly_snapshots",
  "net_worth_snapshots", "portfolio_snapshots", "rich_life_snapshots", "rich_life_scores",
  "user_insights", "profile_snapshots", "savings_goals", "investment_holdings", "investments",
  "insurance_policies", "assets", "liabilities", "debts", "expense_items", "income_sources",
  "recurring_items", "dependents", "financial_goals_profile", "user_priorities",
  "risk_profiles", "behavior_profiles", "knowledge_profiles", "personal_profiles",
  "household_invitations", "household_activity_log", "chat_messages", "ai_conversation_turns",
];
for (const t of WIPE) {
  const col = t === "household_invitations" ? "inviter_id" : t === "household_activity_log" ? "actor_id" : "user_id";
  const { error } = await db.from(t).delete().in(col, UIDS);
  if (error && !/column .* does not exist|relation .* does not exist/.test(error.message)) {
    console.warn(`  (aviso) limpieza ${t}: ${error.message}`);
  }
}
await db.from("household_members").delete().in("user_id", UIDS);
await db.from("households").delete().in("owner_id", UIDS);
console.log("limpieza lista");

// ── hogar ─────────────────────────────────────────────────────────────────────
const HH = ok("households")(
  await db.from("households").insert({ owner_id: JOSE, name: "Familia Ramírez Solano", type: "familia" }).select("id").single()
).id;
ok("household_members")(await db.from("household_members").insert([
  { household_id: HH, user_id: JOSE, role: "owner", status: "active" },
  { household_id: HH, user_id: MARTA, role: "adult", status: "active" },
]).select("id"));
const B = { user_id: JOSE, household_id: HH, created_by: JOSE };

// ── catálogo de categorías ────────────────────────────────────────────────────
const cats = ok("cats")(
  await db.from("expense_categories").select("id,key").is("user_id", null).is("merged_into_id", null)
    .eq("is_system", true).eq("is_active", true).not("key", "is", null)
);
const C = Object.fromEntries(cats.map((c) => [c.key, c.id]));
const cat = (k) => { if (!C[k]) throw new Error(`categoría ${k} no existe`); return C[k]; };

console.log("hogar y catálogo listos");

// ── perfil financiero (ADN) ───────────────────────────────────────────────────
const draft = {
  displayName: "José Ramírez", age: 38, country: "Costa Rica", primaryCurrency: "CRC",
  maritalStatus: "casado", financialNucleus: "familia", dependentsCount: 2,
  // Valores CANÓNICOS de constants.ts (opción real por campo). Antes traía slugs
  // inventados (familia_con_hijos, educacion_hijos, mantener_el_presupuesto…) que no
  // existen como opción → el perfil los mostraba humanizados-de-typo. #98
  lifeStage: ["salir_deudas", "proteger_familia"], perceivedControl: 2, satisfaction: 2,
  urgency: "alta", mainConcern: "deudas", mainConcerns: ["deudas", "no_ahorro", "sin_emergencia"],
  dominantEmotionAnswer: ["presion", "frustracion"],
  singleProblem: ["No me alcanza para ahorrar", "La tarjeta no baja"],
  goals: ["salir_deudas", "estudios", "fondo_emergencia"],
  priorities: ["familia", "vivienda", "seguridad"],
  willingToSacrifice: ["comer_fuera", "suscripciones", "impulsivas"],
  discipline: 3, impulsivity: 3, consistency: 2, reviewHabit: "mensual",
  hardest: ["controlar_gastos", "decir_no"],
  moneyScriptPhrase: ["El dinero se gana para la familia"],
  knowledgeLevel: "basico",
  topicsKnown: ["presupuesto", "ahorro"],
  topicsToLearn: ["inversiones", "interes_compuesto", "deudas"],
  lossReaction: ["espero"], riskPreference: "seguridad",
  investHorizon: "mas_10", hasInvested: true, volatilityComfort: 2,
  hasEmergencyFund: "construyendo", insurances: [],
  coachingTone: "suave", coachingFrequency: "semanal", alertIntensity: "normales",
  richLifeVision:
    "Que Sofía y Mateo estudien lo que quieran sin que nosotros tengamos que pedir prestado, " +
    "que la casa sea nuestra de verdad y poder llevar a la familia a la playa dos veces al año " +
    "sin sacar la tarjeta.",
};

ok("personal_profiles")(await db.from("personal_profiles").insert({
  ...B, age: 38, country: "Costa Rica", marital_status: "casado", financial_nucleus: "familia",
  dependents_count: 2, life_stage: "salir_deudas", perceived_control: 2, satisfaction: 2,
  urgency: "alta", main_concern: "deudas",
  archetype_primary: "protector", archetype_secondary: "constructor",
  dominant_emotion: "presion", ai_tone_recommended: "suave",
  money_script: "evitacion", ai_reading_key: "deuda_alta_sin_colchon",
  ai_reading:
    "Ingresos estables de dos fuentes, pero el 40% se iba en deuda y no quedaba nada para el " +
    "colchón. El problema no es cuánto entra: es el orden en que sale.",
  extra: { draft, richLifeVision: draft.richLifeVision },
}).select("id"));

ok("risk_profiles")(await db.from("risk_profiles").insert({
  ...B, loss_reaction: "espero", preference: "seguridad", horizon: "largo",
  has_invested: true, invested_in: ["certificado", "cuenta_ahorro"], volatility_comfort: 2,
  risk_class: "conservador",
}).select("id"));
ok("behavior_profiles")(await db.from("behavior_profiles").insert({
  ...B, discipline: 3, impulsivity: 3, consistency: 2, review_habit: "mensual",
  hardest: ["controlar_gastos", "decir_no"],
}).select("id"));
ok("knowledge_profiles")(await db.from("knowledge_profiles").insert({
  ...B, level: "basico", topics_known: ["presupuesto", "ahorro"],
  topics_to_learn: ["inversiones", "interes_compuesto", "deudas"],
  learning_format: ["ejemplos", "pasos_cortos"],
}).select("id"));

await ins("dependents", [
  { ...B, name: "Sofía Ramírez Solano", relation: "hija", age: 9 },
  { ...B, name: "Mateo Ramírez Solano", relation: "hijo", age: 5 },
]);
await ins("user_priorities", [
  { ...B, priority: "educacion_hijos", kind: "no_negociable", rank: 1 },
  { ...B, priority: "vivienda", kind: "no_negociable", rank: 2 },
  { ...B, priority: "salir_de_deudas", kind: "prioriza", rank: 3 },
  { ...B, priority: "fondo_emergencia", kind: "prioriza", rank: 4 },
  { ...B, priority: "restaurantes", kind: "sacrificable", rank: 1 },
  { ...B, priority: "streaming", kind: "sacrificable", rank: 2 },
  { ...B, priority: "ropa", kind: "sacrificable", rank: 3 },
]);
await ins("financial_goals_profile", [
  { ...B, name: "Salir de la tarjeta de crédito", target_amount: 1850000, currency: "CRC",
    target_date: "2026-07-31", priority: "alta", horizon: "corto", scope: "familia",
    motive: "Dejar de pagar 45% al banco", importance: 10 },
  { ...B, name: "Fondo de emergencia de 3 meses", target_amount: 3500000, currency: "CRC",
    target_date: "2027-12-31", priority: "alta", horizon: "mediano", scope: "familia",
    motive: "Que un imprevisto no nos devuelva a la tarjeta", importance: 9 },
  { ...B, name: "Universidad de Sofía", target_amount: 6000000, currency: "CRC",
    target_date: "2035-02-01", priority: "alta", horizon: "largo", scope: "familia",
    motive: "Que no tenga que endeudarse para estudiar", importance: 10 },
  { ...B, name: "Cancelar el carro antes de tiempo", target_amount: 7200000, currency: "CRC",
    target_date: "2028-06-30", priority: "media", horizon: "mediano", scope: "familia",
    motive: "Liberar la cuota para invertirla", importance: 7 },
]);
console.log("perfil financiero listo");

// ── ingresos ──────────────────────────────────────────────────────────────────
const mb = (amount, freq) => (freq === "anual" ? Math.round(amount / 12) : amount);
const incomeRows = [
  ["Salario José — Grupo Q", "activo", "salario", 1150000, "mensual", true, "seguro", null],
  ["Salario Marta — Escuela República de Corea", "activo", "salario", 650000, "mensual", true, "seguro", null],
  ["Repostería por encargo — Marta", "activo", "negocio", 130000, "mensual", true, "probable", null],
  ["Aguinaldo José", "extraordinario", "aguinaldo", 1150000, "anual", false, "seguro", "2026-12-15"],
  ["Aguinaldo Marta", "extraordinario", "aguinaldo", 650000, "anual", false, "seguro", "2026-12-15"],
  ["Salario escolar Marta", "extraordinario", "salario_escolar", 650000, "anual", false, "seguro", "2027-01-22"],
].map(([name, income_type, category, amount, frequency, include_in_budget, certainty, estimated_date]) => ({
  ...B, name, income_type, category, amount, currency: "CRC", frequency,
  is_fixed: name.startsWith("Repostería") ? false : true,
  certainty, owner_scope: "familia", include_in_budget, estimated_date,
  amount_monthly_base: mb(amount, frequency),
}));
const incomeIds = await ins("income_sources", incomeRows);
const INC = Object.fromEntries(incomeRows.map((r, i) => [r.name, incomeIds[i].id]));

// ── lista base de gastos (foto de HOY, post-asesor) ───────────────────────────
const expenseRows = [
  ["Hipoteca casa — BAC",              312180, "financiero", "mensual", true,  "obligatorio", "no",       5,  "vivienda_hipoteca"],
  ["Préstamo vehículo — BCR",          216000, "financiero", "mensual", true,  "obligatorio", "no",      15,  "deuda_vehiculo"],
  ["Supermercado y feria",             250000, "esencial",   "mensual", false, "obligatorio", "tal_vez", null,"alim_super"],
  ["Combustible",                       90000, "esencial",   "mensual", false, "obligatorio", "tal_vez", null,"trans_combustible"],
  ["Luz (ICE)",                         32000, "esencial",   "mensual", true,  "obligatorio", "tal_vez",  8,  "serv_luz"],
  ["Agua (AyA)",                        12000, "esencial",   "mensual", true,  "obligatorio", "no",      10,  "serv_agua"],
  ["Internet (Kölbi)",                  27000, "esencial",   "mensual", true,  "obligatorio", "tal_vez",  3,  "serv_internet"],
  ["Celulares (2 líneas)",              24000, "esencial",   "mensual", true,  "obligatorio", "tal_vez", 12,  "serv_celular"],
  ["Colegiatura Sofía y kínder Mateo",  85000, "crecimiento","mensual", true,  "obligatorio", "no",       5,  "edu_formacion"],
  ["Restaurantes y delivery",           75000, "estilo_vida","mensual", false, "flexible",    "si",     null,"alim_restaurantes"],
  ["Streaming (Netflix)",                9000, "estilo_vida","mensual", true,  "deseable",    "si",       2,  "estilo_streaming"],
  ["Ropa",                              22000, "estilo_vida","mensual", false, "flexible",    "si",     null,"estilo_ropa"],
  ["Cuidado personal",                  22000, "estilo_vida","mensual", false, "flexible",    "si",     null,"cuidado_personal"],
  ["Kira (perra) — comida y veterinario",22000,"estilo_vida","mensual", false, "flexible",    "tal_vez",null,"mascotas"],
  ["Farmacia y consultas",              28000, "proteccion", "mensual", false, "flexible",    "no",     null,"salud_farmacia"],
  ["Misceláneos",                       22000, "miscelaneo", "mensual", false, "flexible",    "si",     null,"miscelaneos"],
  ["Marchamo",                         245000, "esencial",   "anual",   true,  "obligatorio", "no",      18,  "auto_marchamo"],
  ["Mantenimiento del vehículo",       180000, "esencial",   "anual",   false, "obligatorio", "tal_vez",null,"trans_mantenimiento"],
  ["Aporte al fondo de emergencia",    200000, "ahorro",     "mensual", true,  "obligatorio", "no",      26,  "fondo_emergencia"],
  ["Ahorro universidad de Sofía",      150000, "inversion",  "mensual", true,  "obligatorio", "no",      26,  "ahorro_metas"],
].map(([name, amount, nature, frequency, is_fixed, obligation, reducible, pay_day, key]) => ({
  ...B, name, amount, currency: "CRC", nature, frequency, is_fixed, obligation, reducible,
  pay_day, owner_scope: "familia", category_id: cat(key),
  amount_monthly_base: mb(amount, frequency),
}));
await ins("expense_items", expenseRows);
console.log("ingresos y gastos base listos");

// ── deudas ────────────────────────────────────────────────────────────────────
// `debts.balance` es el ANCLA (saldo al 1-sep-2025). El saldo vivo lo recalcula
// la app reproduciendo `debt_payments` sobre el ancla — por eso original_amount
// se fija igual al ancla: si fuera el monto del préstamo de 2021, el replay
// arrancaría ahí y el saldo saldría disparatado.
const DEUDAS = [
  {
    key: "hipoteca", name: "Hipoteca casa — BAC", debt_type: "hipoteca",
    balance: 28500000, original_amount: 28500000, apr: 10.5, rate_type: "variable",
    rate_index: "tbp", rate_spread: 4.25, currency: "CRC", pay_day: 5,
    term_months: 184, term_remaining_months: 172, start_date: "2025-09-01",
    min_payment: 312180, current_payment: 312180, insurance: 0, extra_monthly: 0,
    classification: "estrategica", delinquency: "no", allows_extra_payment: "si",
    stress: 6, is_essential: true, bank: "BAC Credomatic",
    secured_asset: "Casa en San Joaquín de Flores, Heredia",
    notes: "Tasa variable atada a la TBP + 4.25. Revisar cada semestre.",
    catKey: "deuda_hipoteca",
  },
  {
    key: "carro", name: "Préstamo vehículo — BCR", debt_type: "vehiculo",
    balance: 7200000, original_amount: 7200000, apr: 13.5, rate_type: "fija",
    rate_index: null, rate_spread: null, currency: "CRC", pay_day: 15,
    term_months: 42, term_remaining_months: 30, start_date: "2025-09-01",
    min_payment: 216000, current_payment: 216000, insurance: 0, extra_monthly: 150000,
    classification: "controlada", delinquency: "no", allows_extra_payment: "si",
    stress: 5, is_essential: false, bank: "Banco de Costa Rica",
    secured_asset: "Hyundai Tucson 2019",
    notes: "Admite abonos a capital sin penalidad. Objetivo: cancelarlo en 2028.",
    catKey: "deuda_vehiculo",
  },
  {
    key: "tarjeta", name: "Tarjeta BAC Visa", debt_type: "tarjeta",
    balance: 1850000, original_amount: 1850000, apr: 45, rate_type: "fija",
    rate_index: null, rate_spread: null, currency: "CRC", pay_day: 20,
    term_months: null, term_remaining_months: null, start_date: "2025-09-01",
    min_payment: 92500, current_payment: 92500, insurance: 0, extra_monthly: 0,
    classification: "critica", delinquency: "no", allows_extra_payment: "si",
    stress: 9, is_essential: false, bank: "BAC Credomatic", secured_asset: null,
    notes: "La deuda más cara del hogar. Método avalancha: se ataca primero.",
    catKey: "deuda_tarjeta",
  },
];
const D = {};
for (const x of DEUDAS) {
  const { key, catKey, ...row } = x;
  D[key] = { id: ok("debts")(await db.from("debts").insert({ ...B, ...row }).select("id").single()).id, catKey, apr: row.apr };
}

// ── activos ───────────────────────────────────────────────────────────────────
await ins("assets", [
  { ...B, name: "Casa — San Joaquín de Flores", asset_class: "uso_personal", value: 52000000,
    currency: "CRC", generates_income: false, liquidity: "baja", linked_debt_id: D.hipoteca.id,
    last_valued_on: "2026-02-10" },
  { ...B, name: "Hyundai Tucson 2019", asset_class: "uso_personal", value: 8900000,
    currency: "CRC", generates_income: false, liquidity: "media", linked_debt_id: D.carro.id,
    last_valued_on: "2026-02-10" },
]);

// ── inversiones: dos CDP (uno viejo en colones, uno nuevo en dólares) ──────────
const invCRC = ok("inv1")(await db.from("investments").insert({
  ...B, asset_type: "certificado", name: "CDP Banco Nacional — colones", symbol: "CDP-BN-CRC",
  invested_amount: 1800000, contribution: 0, contribution_frequency: null,
  started_on: "2024-11-20", linked_goal: "Universidad de Sofía", horizon: "menos_1",
  perceived_risk: "bajo", liquidity: "penalidad", fees: 0, understanding: 4, currency: "CRC",
}).select("id").single()).id;
const invUSD = ok("inv2")(await db.from("investments").insert({
  ...B, asset_type: "certificado", name: "CDP BAC — dólares", symbol: "CDP-BAC-USD",
  invested_amount: 2000, contribution: 0, contribution_frequency: null,
  started_on: "2026-05-28", linked_goal: "Universidad de Sofía", horizon: "1_3",
  perceived_risk: "bajo", liquidity: "penalidad", fees: 0, understanding: 3, currency: "USD",
}).select("id").single()).id;

const hCRC = ok("h1")(await db.from("investment_holdings").insert({
  ...B, investment_id: invCRC, symbol: "CDP-BN-CRC", asset_type: "certificado",
  quantity: 1, average_cost: 1800000, cost_basis: 1800000, currency: "CRC",
  label: "CDP Banco Nacional 12 meses", broker: "Banco Nacional", purchase_date: "2024-11-20",
  category: "deposito_plazo", nature: "cashflow", region: "cr", annual_rate_pct: 7.85,
  maturity_date: "2026-11-20", term_years: 1, current_value_manual: 1906000,
  is_recurring: false, needs_detail: false,
}).select("id").single()).id;
const hUSD = ok("h2")(await db.from("investment_holdings").insert({
  ...B, investment_id: invUSD, symbol: "CDP-BAC-USD", asset_type: "certificado",
  quantity: 1, average_cost: 2000, cost_basis: 2000, currency: "USD",
  label: "CDP BAC 12 meses (dólares)", broker: "BAC Credomatic", purchase_date: "2026-05-28",
  category: "deposito_plazo", nature: "cashflow", region: "us", annual_rate_pct: 4.25,
  maturity_date: "2027-05-28", term_years: 1, current_value_manual: 2018,
  is_recurring: false, needs_detail: false,
}).select("id").single()).id;

await ins("investment_transactions", [
  { ...B, investment_id: invCRC, holding_id: hCRC, tx_type: "compra", amount: 1800000,
    quantity: 1, currency: "CRC", occurred_on: "2024-11-20" },
  { ...B, investment_id: invUSD, holding_id: hUSD, tx_type: "compra", amount: 2000,
    quantity: 1, currency: "USD", occurred_on: "2026-05-28" },
]);

// ── metas de ahorro ───────────────────────────────────────────────────────────
const G = {};
G.fondo = ok("g1")(await db.from("savings_goals").insert({
  ...B, name: "Fondo de emergencia", goal_type: "defensa:fondo_emergencia",
  target_amount: 3500000, current_amount: 0, monthly_contribution: 200000, currency: "CRC",
  target_date: "2027-12-31", priority: "alta", scope: "familia", automated: true,
  stored_in: "Cuenta de ahorro BAC", status: "saludable", kind: "meta", recurrence: "ninguna",
  is_essential: true, classification: "proteccion",
}).select("id").single()).id;
G.uni = ok("g2")(await db.from("savings_goals").insert({
  ...B, name: "Universidad de Sofía", goal_type: null,
  target_amount: 6000000, current_amount: 0, monthly_contribution: 150000, currency: "CRC",
  target_date: "2035-02-01", priority: "alta", scope: "familia", automated: true,
  stored_in: "Cuenta BN — se traslada a CDP cada año", status: "saludable", kind: "meta",
  recurrence: "ninguna", is_essential: false, classification: "crecimiento",
}).select("id").single()).id;
console.log("deudas, activos, inversiones y metas listos");

// ── generación de 12 meses de movimientos ─────────────────────────────────────
const TX = [];      // filas de transactions (+ campos auxiliares _nature/_link)
const PAGOS = [];   // debt_payments
const APORTES = []; // goal_contributions

const tx = (o) => { TX.push(o); return o; };
const gasto = (fecha, desc, monto, catKey, nature, extra = {}) =>
  tx({ ...B, kind: "gasto", description: desc, amount: Math.round(monto), currency: "CRC",
       occurred_on: fecha, category_id: cat(catKey), source: "manual", origin: "manual",
       status: "confirmed", confirmed_by_user: true, counts_in_budget: true,
       linked_kind: "none", _nature: nature, ...extra });
const ingreso = (fecha, desc, monto, catKey, srcName = null) =>
  tx({ ...B, kind: "ingreso", description: desc, amount: Math.round(monto), currency: "CRC",
       occurred_on: fecha, category_id: cat(catKey), source: "manual", origin: "manual",
       status: "confirmed", confirmed_by_user: true, counts_in_budget: true,
       linked_kind: "none",
       income_source_id: srcName ? (BUDGET_INC[fecha.slice(0, 7)]?.[srcName] ?? null) : null,
       _nature: "ingreso" });

const SUPERS = ["Automercado", "Walmart", "Maxi Palí", "Perimercados", "Súper La Familia"];
const FERIAS = ["Feria del agricultor — Heredia", "Feria del agricultor — San Joaquín"];
const GAS = ["Gasolinera Delta", "Gasolinera Uno", "Servicentro La Valencia"];
const RESTOS = ["Rosti Pollos", "Spoon", "Pizza Hut", "Soda La Casona", "Taco Bell", "Pops",
                "McDonald's", "Uber Eats", "PedidosYa", "Cafetería Britt"];
const MISC = ["Ferretería EPA", "Librería Universal", "Amazon", "Aliexpress", "Bazar del barrio",
              "Parqueo San José", "Peaje Ruta 27"];
const FARMA = ["Farmacia La Bomba", "Farmacia Fischel", "Consulta pediatra", "Clínica dental"];
const ROPA = ["Zara", "Bershka", "Universal", "Payless"];
const CUIDADO = ["Barbería El Corte", "Salón de belleza Marta", "Farmacia — cuidado personal"];

const PERFIL = {
  antes:   { super: 295000, comb: 90000, fuera: 265000, nFuera: 9, ropa: 85000, cuidado: 45000, misc: 95000, nMisc: 4, stream: 24000, paseo: 60000 },
  giro:    { super: 275000, comb: 90000, fuera: 175000, nFuera: 6, ropa: 55000, cuidado: 32000, misc: 55000, nMisc: 3, stream: 24000, paseo: 30000 },
  despues: { super: 250000, comb: 90000, fuera:  75000, nFuera: 3, ropa: 22000, cuidado: 22000, misc: 22000, nMisc: 2, stream:  9000, paseo: 0 },
};

// "final" = liquidación: saldo vigente + el interés del mes.
const PAGO_TARJETA = {
  "2025-09": 92500, "2025-10": 92500, "2025-11": 92500, "2025-12": 92500,
  "2026-01": 177500, "2026-02": 380000, "2026-03": 380000, "2026-04": 380000,
  "2026-05": 380000, "2026-06": "final",
};
const APORTE_FONDO = {
  "2026-01": 500000, "2026-02": 120000, "2026-03": 120000, "2026-04": 120000,
  "2026-05": 120000, "2026-06": 120000, "2026-07": 200000, "2026-08": 200000,
};
const APORTE_UNI = {
  "2026-02": 80000, "2026-03": 80000, "2026-04": 80000, "2026-05": 80000,
  "2026-06": 80000, "2026-07": 150000, "2026-08": 150000,
};
const ABONO_CARRO = { "2026-07": 100000, "2026-08": 150000 };

// ── presupuesto mensual de los 12 meses (líneas manuales) ─────────────────────
// Las líneas derivadas (Pago — deuda, Aporte — meta) las genera la app sola al
// abrir la pantalla; acá solo van las manuales, con el monto de cada fase.
const BUDGET_GASTO = {
  antes:   { super: 295000, comb: 90000, fuera: 265000, stream: 24000, ropa: 85000, cuidado: 45000, misc: 95000 },
  giro:    { super: 275000, comb: 90000, fuera: 175000, stream: 24000, ropa: 55000, cuidado: 32000, misc: 55000 },
  despues: { super: 250000, comb: 90000, fuera:  75000, stream:  9000, ropa: 22000, cuidado: 22000, misc: 22000 },
};
const BUDGET_INC = {};
const budgetRows = [];
for (const { y, m, key } of MESES) {
  const g = BUDGET_GASTO[fase(key)];
  const ingresos = [
    ["Salario José — Grupo Q", 1150000, "activo"],
    ["Salario Marta — Escuela República de Corea", 650000, "activo"],
    ...(key >= "2026-02" ? [["Repostería por encargo — Marta", key === "2026-02" ? 75000 : 130000, "activo"]] : []),
    ...(key === "2025-12" ? [["Aguinaldo José", 1150000, "extraordinario"], ["Aguinaldo Marta", 650000, "extraordinario"]] : []),
    ...(key === "2026-01" ? [["Salario escolar Marta", 650000, "extraordinario"]] : []),
    ...(key === "2026-05" ? [["Venta de la moto (Suzuki 2015)", 1080000, "extraordinario"]] : []),
  ];
  BUDGET_INC[key] = {};
  for (const [name, amount, income_type] of ingresos) {
    const id = crypto.randomUUID();
    BUDGET_INC[key][name] = id;
    budgetRows.push({ ...B, id, type: "income", name, amount, currency: "CRC", frequency: "mensual",
      period_month: m, period_year: y, source_kind: "manual", income_type,
      category_id: cat(income_type === "extraordinario" ? "inc_extra" : "inc_salario") });
  }
  const gastos = [
    ["Supermercado y feria", g.super, "alim_super"], ["Combustible", g.comb, "trans_combustible"],
    ["Luz (ICE)", 32000, "serv_luz"], ["Agua (AyA)", 12000, "serv_agua"],
    ["Internet (Kölbi)", 27000, "serv_internet"], ["Celulares (2 líneas)", 24000, "serv_celular"],
    ["Colegiatura Sofía y kínder Mateo", 85000, "edu_formacion"],
    ["Restaurantes y delivery", g.fuera, "alim_restaurantes"], ["Streaming", g.stream, "estilo_streaming"],
    ["Ropa", g.ropa, "estilo_ropa"], ["Cuidado personal", g.cuidado, "cuidado_personal"],
    ["Kira (perra)", 22000, "mascotas"], ["Farmacia y consultas", 28000, "salud_farmacia"],
    ["Misceláneos", g.misc, "miscelaneos"], ["Marchamo (provisión mensual)", 20417, "auto_marchamo"],
    ["Mantenimiento del vehículo (provisión)", 15000, "trans_mantenimiento"],
  ];
  for (const [name, amount, k] of gastos)
    budgetRows.push({ ...B, id: crypto.randomUUID(), type: "expense", name, amount,
      currency: "CRC", frequency: "mensual", period_month: m, period_year: y,
      source_kind: "manual", category_id: cat(k) });
}
await ins("budget_items", budgetRows);
console.log("presupuesto sembrado:", budgetRows.length, "líneas");

// Saldos vivos que se van amortizando igual que en la app (interés = saldo × apr/1200).
const saldo = { hipoteca: 28500000, carro: 7200000, tarjeta: 1850000 };
const saldoMes = {}; // key → { hipoteca, carro, tarjeta } al cierre del mes

function abonar(key, fecha, monto, kind = "ordinario") {
  const apr = D[key].apr;
  let principal, interes;
  if (kind === "extraordinario") {
    principal = Math.min(monto, saldo[key]); interes = 0;
  } else {
    interes = saldo[key] * (apr / 1200);
    principal = Math.min(Math.max(0, monto - interes), saldo[key]);
    interes = Math.min(interes, monto);
  }
  saldo[key] = Math.round((saldo[key] - principal) * 100) / 100;
  PAGOS.push({ ...B, debt_id: D[key].id, amount: Math.round(monto),
    principal: Math.round(principal), interest: Math.round(interes),
    occurred_on: fecha, kind, extra_amount: 0, _fecha: fecha, _key: key });
  return { principal, interes };
}

for (const { y, m, key } of MESES) {
  const f = PERFIL[fase(key)];
  const last = key === "2026-08";
  const D_ = (day) => d(y, m, last ? Math.min(day, 27) : day);

  // ── ingresos
  ingreso(D_(15), "Salario quincena — Grupo Q", 575000, "inc_salario", "Salario José — Grupo Q");
  ingreso(D_(27), "Salario quincena — Grupo Q", 575000, "inc_salario", "Salario José — Grupo Q");
  ingreso(D_(25), "Salario — Escuela República de Corea", 650000, "inc_salario", "Salario Marta — Escuela República de Corea");
  if (key >= "2026-02") ingreso(D_(22), "Repostería por encargo",
      Math.round(jitter(key === "2026-02" ? 75000 : 130000, 0.12) / 500) * 500,
      "inc_comision", "Repostería por encargo — Marta");
  if (key === "2025-12") {
    ingreso(d(y, m, 10), "Aguinaldo — Grupo Q", 1150000, "inc_extra", "Aguinaldo José");
    ingreso(d(y, m, 12), "Aguinaldo — MEP", 650000, "inc_extra", "Aguinaldo Marta");
  }
  if (key === "2026-01") ingreso(d(y, m, 22), "Salario escolar — MEP", 650000, "inc_extra", "Salario escolar Marta");
  if (key === "2026-05") ingreso(d(y, m, 22), "Venta de la moto (Suzuki 2015)", 1080000, "inc_venta", "Venta de la moto (Suzuki 2015)");

  // ── deudas
  const hip = abonar("hipoteca", D_(5), 312180);
  gasto(D_(5), "Cuota hipoteca — BAC", 312180, "deuda_hipoteca", "financiero",
        { linked_kind: "debt", linked_id: D.hipoteca.id, merchant_or_source: "BAC Credomatic", _pago: { key: "hipoteca", fecha: D_(5) } });
  const car = abonar("carro", D_(15), 216000);
  gasto(D_(15), "Cuota préstamo vehículo — BCR", 216000, "deuda_vehiculo", "financiero",
        { linked_kind: "debt", linked_id: D.carro.id, merchant_or_source: "Banco de Costa Rica", _pago: { key: "carro", fecha: D_(15) } });
  if (PAGO_TARJETA[key]) {
    const monto = PAGO_TARJETA[key] === "final"
      ? Math.round(saldo.tarjeta * (1 + D.tarjeta.apr / 1200))
      : PAGO_TARJETA[key];
    abonar("tarjeta", D_(20), monto);
    gasto(D_(20), PAGO_TARJETA[key] === "final" ? "Último pago — tarjeta BAC liquidada" : key >= "2026-02" ? "Pago tarjeta BAC (plan avalancha)" : "Pago mínimo tarjeta BAC",
          monto, "deuda_tarjeta", "financiero",
          { linked_kind: "debt", linked_id: D.tarjeta.id, merchant_or_source: "BAC Credomatic", _pago: { key: "tarjeta", fecha: D_(20) } });
  }
  if (ABONO_CARRO[key]) {
    abonar("carro", D_(16), ABONO_CARRO[key], "extraordinario");
    gasto(D_(16), "Abono extraordinario al capital — vehículo", ABONO_CARRO[key], "deuda_vehiculo", "financiero",
          { linked_kind: "debt", linked_id: D.carro.id, merchant_or_source: "Banco de Costa Rica", _pago: { key: "carro", fecha: D_(16) } });
  }

  // ── fijos del hogar
  gasto(D_(3), "Internet — Kölbi", 27000, "serv_internet", "esencial");
  gasto(D_(8), "Electricidad — ICE", Math.round(jitter(32000, 0.18) / 100) * 100, "serv_luz", "esencial");
  gasto(D_(10), "Agua — AyA", Math.round(jitter(12000, 0.12) / 100) * 100, "serv_agua", "esencial");
  gasto(D_(12), "Celulares (2 líneas) — Kölbi", 24000, "serv_celular", "esencial");
  gasto(D_(5), "Colegiatura Sofía y kínder Mateo", 85000, "edu_formacion", "crecimiento");
  if (fase(key) === "despues") gasto(D_(2), "Netflix", 9000, "estilo_streaming", "estilo_vida");
  else {
    gasto(D_(2), "Netflix", 9000, "estilo_streaming", "estilo_vida");
    gasto(D_(2), "Disney+", 5500, "estilo_streaming", "estilo_vida");
    gasto(D_(4), "HBO Max", 5500, "estilo_streaming", "estilo_vida");
    gasto(D_(6), "Spotify Familiar", 4000, "estilo_streaming", "estilo_vida");
  }

  // ── variables
  const superParts = split(Math.round(f.super * 0.72), 4);
  superParts.forEach((v, i) => gasto(D_(4 + i * 7), pick(SUPERS), v, "alim_super", "esencial"));
  split(f.super - superParts.reduce((a, b) => a + b, 0), 2).forEach((v, i) =>
    gasto(D_(6 + i * 14), FERIAS[i % 2], v, "alim_feria", "esencial"));
  split(f.comb, 3).forEach((v, i) => gasto(D_(3 + i * 9), pick(GAS), v, "trans_combustible", "esencial"));
  split(f.fuera, f.nFuera).forEach((v, i) => {
    const n = pick(RESTOS);
    const k = n === "Uber Eats" || n === "PedidosYa" ? "alim_delivery" : n === "Cafetería Britt" ? "alim_cafe" : "alim_restaurantes";
    gasto(D_(2 + Math.floor((i * 26) / f.nFuera)), n, v, k, "estilo_vida");
  });
  gasto(D_(17), pick(ROPA), f.ropa, "estilo_ropa", "estilo_vida");
  gasto(D_(11), pick(CUIDADO), f.cuidado, "cuidado_personal", "estilo_vida");
  gasto(D_(9), "Kira — comida y veterinario", 22000, "mascotas", "estilo_vida");
  gasto(D_(19), pick(FARMA), 28000, "salud_farmacia", "proteccion");
  split(f.misc, f.nMisc).forEach((v, i) => gasto(D_(7 + i * 8), pick(MISC), v, "miscelaneos", "miscelaneo"));
  if (f.paseo > 0) gasto(D_(21), pick(["Paseo familiar", "Salida del fin de semana", "Cine y helados"]), f.paseo, "disfrute", "estilo_vida");

  // ── puntuales del calendario tico
  if (key === "2025-12") {
    gasto(d(y, m, 18), "Marchamo 2026 — INS", 245000, "auto_marchamo", "esencial");
    gasto(d(y, m, 14), "Regalos de Navidad", 385000, "estilo_regalos", "estilo_vida");
    gasto(d(y, m, 27), "Paseo familiar a Jacó", 320000, "viajes", "estilo_vida");
    gasto(d(y, m, 20), "Estrenos de fin de año", 180000, "estilo_ropa", "estilo_vida");
    gasto(d(y, m, 24), "Cena de Navidad y fiestas", 150000, "alim_restaurantes", "estilo_vida");
    gasto(d(y, m, 22), "Compras de fin de año", 250000, "miscelaneos", "miscelaneo");
  }
  if (key === "2026-01") gasto(d(y, m, 8), "Útiles y uniformes escolares", 145000, "edu_formacion", "crecimiento");
  if (key === "2026-03") gasto(d(y, m, 10), "Revisión técnica vehicular", 13500, "auto_revision", "esencial");
  if (key === "2026-04") gasto(d(y, m, 14), "Mantenimiento del vehículo", 65000, "trans_mantenimiento", "esencial");
  if (key === "2026-07") gasto(d(y, m, 11), "Mantenimiento del vehículo", 65000, "trans_mantenimiento", "esencial");
  if (key === "2026-05") gasto(d(y, m, 28), "Apertura CDP BAC en dólares (USD 2 000)", 1060000, "inversiones", "inversion",
        { linked_kind: "holding", linked_id: hUSD, merchant_or_source: "BAC Credomatic" });

  // ── aportes a metas
  if (APORTE_FONDO[key]) {
    const monto = APORTE_FONDO[key];
    const fecha = key === "2026-01" ? d(y, m, 26) : D_(26);
    gasto(fecha, "Aporte al fondo de emergencia", monto, "fondo_emergencia", "ahorro",
          { linked_kind: "goal", linked_id: G.fondo });
    APORTES.push({ ...B, goal_id: G.fondo, amount: monto, occurred_on: fecha });
  }
  if (key === "2026-05") {
    gasto(d(y, m, 25), "Aporte extra al fondo (resto de la venta de la moto)", 20000, "fondo_emergencia", "ahorro",
          { linked_kind: "goal", linked_id: G.fondo });
    APORTES.push({ ...B, goal_id: G.fondo, amount: 20000, occurred_on: d(y, m, 25) });
  }
  if (APORTE_UNI[key]) {
    const monto = APORTE_UNI[key];
    gasto(D_(26), "Ahorro universidad de Sofía", monto, "ahorro_metas", "ahorro",
          { linked_kind: "goal", linked_id: G.uni });
    APORTES.push({ ...B, goal_id: G.uni, amount: monto, occurred_on: D_(26) });
  }

  saldoMes[key] = { ...saldo };
}
console.log("movimientos generados:", TX.length, "| pagos de deuda:", PAGOS.length);

// ── escritura de movimientos + enlaces ────────────────────────────────────────
for (const t of TX) t.id = crypto.randomUUID();
const txPorPago = new Map();
for (const t of TX) if (t._pago) txPorPago.set(`${t._pago.key}|${t._pago.fecha}|${t.amount}`, t.id);
for (const p of PAGOS) {
  const id = txPorPago.get(`${p._key}|${p._fecha}|${p.amount}`);
  if (id) p.transaction_id = id;
}

const limpio = (o, ...drop) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("_") && !drop.includes(k)));
await ins("transactions", TX.map((t) => limpio(t)));
await ins("debt_payments", PAGOS.map((p) => limpio(p)));
await ins("goal_contributions", APORTES);

// current_amount de cada meta = suma de sus aportes.
for (const gid of [G.fondo, G.uni]) {
  const total = APORTES.filter((a) => a.goal_id === gid).reduce((s, a) => s + a.amount, 0);
  ok("goal.current_amount")(await db.from("savings_goals").update({ current_amount: total }).eq("id", gid).select("id"));
}

// ── saco de liquidez ──────────────────────────────────────────────────────────
const delta = (t) => (t.kind === "ingreso" ? t.amount : -t.amount);
const totalDelta = TX.reduce((s, t) => s + delta(t), 0);
const apertura = 180000;                       // saco de liquidez al 1-sep-2025
const SALDO_HOY = Math.round(apertura + totalDelta);
await ins("liquidity_ledger", [
  { ...B, delta: apertura, currency: "CRC", reason: "apertura", occurred_on: "2025-09-01" },
  ...TX.map((t) => ({ ...B, delta: delta(t), currency: "CRC", reason: "transaccion",
                      transaction_id: t.id, occurred_on: t.occurred_on })),
]);
console.log(`liquidez: apertura ₡${apertura.toLocaleString("es-CR")} → saldo hoy ₡${SALDO_HOY.toLocaleString("es-CR")}`);

// ── snapshots mensuales ───────────────────────────────────────────────────────
const NAT = ["esencial", "estilo_vida", "financiero", "proteccion", "crecimiento", "ahorro", "inversion", "donacion", "miscelaneo"];
const ratio = (p, w) => (w <= 0 ? 0 : Math.round((p / w) * 1000) / 1000);
const presion = (inc, exp, dw) => {
  if (inc <= 0) return "critica";
  if (inc - exp < 0) return "critica";
  const u = exp / inc;
  if (u >= 0.9 || dw >= 0.4) return "alta";
  if (u >= 0.75) return "media";
  return "baja";
};

const snapsMes = [], snapsNW = [], snapsPort = [];
let liq = apertura, metasAcum = 0;
for (const { y, m, key } of MESES) {
  const delMes = TX.filter((t) => t.occurred_on.startsWith(key));
  const income = delMes.filter((t) => t.kind === "ingreso").reduce((s, t) => s + t.amount, 0);
  const expense = delMes.filter((t) => t.kind === "gasto").reduce((s, t) => s + t.amount, 0);
  const byNat = Object.fromEntries(NAT.map((n) => [n, 0]));
  for (const t of delMes) if (t.kind === "gasto") byNat[t._nature] = (byNat[t._nature] ?? 0) + t.amount;
  const free = income - expense;
  const dw = ratio(byNat.financiero, income);
  snapsMes.push({ ...B, period: `${key}-01`, income_monthly: income, expense_monthly: expense,
    free_cashflow: free, savings_rate: ratio(byNat.ahorro + Math.max(0, free), income),
    investment_rate: ratio(byNat.inversion, income), debt_weight: dw,
    essentials_weight: ratio(byNat.esencial, income), lifestyle_weight: ratio(byNat.estilo_vida, income),
    financial_pressure: presion(income, expense, dw),
    breakdown: { currency: "CRC", byNature: byNat, transactions: delMes.length, fase: fase(key) } });

  liq += delMes.reduce((s, t) => s + delta(t), 0);
  metasAcum += APORTES.filter((a) => a.occurred_on.startsWith(key)).reduce((s, a) => s + a.amount, 0);
  const invCRCv = 1800000, invUSDv = key >= "2026-05" ? 1040000 : 0;
  const activos = 52000000 + 8900000 + invCRCv + invUSDv + Math.max(0, liq) + metasAcum;
  const s = saldoMes[key];
  const pasivos = Math.round(s.hipoteca + s.carro + s.tarjeta);
  snapsNW.push({ ...B, period: `${key}-01`, total_assets: Math.round(activos),
    total_liabilities: pasivos, net_worth: Math.round(activos - pasivos),
    breakdown: { currency: "CRC", casa: 52000000, vehiculo: 8900000, inversiones: invCRCv + invUSDv,
      liquidez: Math.round(Math.max(0, liq)), metas: metasAcum,
      deudas: { hipoteca: Math.round(s.hipoteca), vehiculo: Math.round(s.carro), tarjeta: Math.round(s.tarjeta) } } });
  snapsPort.push({ ...B, date: d(y, m, dim(y, m)), portfolio_value: invCRCv + invUSDv,
    investment_value: invCRCv + invUSDv, net_worth: Math.round(activos - pasivos), currency: "CRC" });
}
await ins("monthly_snapshots", snapsMes);
// El mes en curso lo reescriben las pantallas; el histórico CERRADO es el que importa.
await ins("net_worth_snapshots", snapsNW.slice(0, -1));
await ins("portfolio_snapshots", snapsPort);

// ── perfil de la cuenta ───────────────────────────────────────────────────────
ok("profiles.jose")(await db.from("profiles").update({
  display_name: "José Ramírez", onboarding_completed: true, profile_completion: 100, plan: "premium",
}).eq("id", JOSE).select("id"));
ok("profiles.marta")(await db.from("profiles").update({
  display_name: "Marta Solano", onboarding_completed: true, profile_completion: 60, plan: "premium",
}).eq("id", MARTA).select("id"));
for (const uid of UIDS)
  ok("user_settings")(await db.from("user_settings").upsert({
    user_id: uid, theme: "light", primary_currency: "CRC", timezone: "America/Costa_Rica",
    coaching_tone: "suave", coaching_frequency: "semanal", alert_intensity: "normales",
    peace_fund_months: 3, notifications: { email: true, push: true },
  }, { onConflict: "user_id" }).select("user_id"));

// ── resumen ───────────────────────────────────────────────────────────────────
const p = (n) => "₡" + Math.round(n).toLocaleString("es-CR");
const first = snapsMes[0], lastS = snapsMes[snapsMes.length - 1];
console.log("\n  mes      ingreso      gasto       libre   deuda  ahorro  presión");
for (const sm of snapsMes)
  console.log(`  ${sm.period.slice(0, 7)}  ${p(sm.income_monthly).padStart(11)} ${p(sm.expense_monthly).padStart(11)} ${p(sm.free_cashflow).padStart(11)}  ${(sm.debt_weight * 100).toFixed(0).padStart(4)}%  ${(sm.savings_rate * 100).toFixed(0).padStart(5)}%  ${sm.financial_pressure}`);
console.log(`
═══ CUENTA DEMO LISTA ═══
  Login   : ${PERSONAS[0].email}  /  ${PASS}
  Pareja  : ${PERSONAS[1].email}  (mismo password)
  Hogar   : Familia Ramírez Solano — ${TX.length} movimientos, ${MESES[0].key} → ${MESES[11].key}

  ANTES (${first.period.slice(0, 7)})   ingreso ${p(first.income_monthly)} · gasto ${p(first.expense_monthly)} · libre ${p(first.free_cashflow)} · deuda ${(first.debt_weight * 100).toFixed(0)}% · ahorro ${(first.savings_rate * 100).toFixed(0)}%
  HOY   (${lastS.period.slice(0, 7)})   ingreso ${p(lastS.income_monthly)} · gasto ${p(lastS.expense_monthly)} · libre ${p(lastS.free_cashflow)} · deuda ${(lastS.debt_weight * 100).toFixed(0)}% · ahorro ${(lastS.savings_rate * 100).toFixed(0)}%

  Deudas  hipoteca ${p(saldo.hipoteca)} (ancla ${p(28500000)})
          vehículo ${p(saldo.carro)} (ancla ${p(7200000)})
          tarjeta  ${p(saldo.tarjeta)} (ancla ${p(1850000)})
  Metas   fondo de emergencia ${p(APORTES.filter(a => a.goal_id === G.fondo).reduce((s, a) => s + a.amount, 0))} / ${p(3500000)}
          universidad Sofía   ${p(APORTES.filter(a => a.goal_id === G.uni).reduce((s, a) => s + a.amount, 0))} / ${p(6000000)}
  Patrimonio  ${p(snapsNW[0].net_worth)} → ${p(snapsNW[snapsNW.length - 1].net_worth)}  (+${p(snapsNW[snapsNW.length - 1].net_worth - snapsNW[0].net_worth)})
`);
