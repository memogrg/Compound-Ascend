/**
 * Siembra un USUARIO FIXTURE con datos completos y CONOCIDOS para auditar el chat con cifras
 * exactas. Corre con service-role (bypassa RLS). Idempotente por email (si existe, reusa y no
 * duplica). Todo cuelga del user_id → borrar el usuario en Supabase cascadea y limpia la prueba.
 *
 * Siembra (moneda CRC): ingreso, ~15 sobres de gasto (categorías favoritas propias + budget_items),
 * metas + fondos de defensa (emergencia/paz), holdings con DCA (BTC/ETH/JUP/KMNO/VOO), deudas,
 * seguros, y el perfil. Al final imprime las CIFRAS ESPERADAS y escribe scripts/chat-audit-fixture.json.
 *
 * Ejecutar:  node scripts/chat-audit-seed.mjs
 * Env (de .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AUDIT_EMAIL, AUDIT_PASSWORD.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
try {
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {}
const clean = (v) => (v ?? "").trim().replace(/^["']|["']$/g, "");

const URL = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SERVICE = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const EMAIL = clean(process.env.AUDIT_EMAIL) || "chat-audit-fixture@test.local";
const PASSWORD = clean(process.env.AUDIT_PASSWORD);
const CUR = "CRC";
if (!URL || !SERVICE || !PASSWORD) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / AUDIT_PASSWORD (poné AUDIT_PASSWORD en .env.local).");
  process.exit(1);
}
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1) Usuario (idempotente) ──
async function ensureUser() {
  const { data: created, error } = await db.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Fixture Auditoría" },
  });
  if (!error) return created.user.id;
  if (!/already|exists|registered/i.test(error.message)) throw new Error("createUser: " + error.message);
  // Ya existe → buscar id.
  for (let page = 1; page <= 20; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users.find((x) => x.email === EMAIL);
    if (u) return u.id;
    if (!data?.users.length) break;
  }
  throw new Error("Usuario ya existe pero no pude resolver su id.");
}

// ── 2) Household (handle_new_user suele crearlo; si no, lo creamos) ──
async function ensureHousehold(uid) {
  for (let i = 0; i < 6; i++) {
    const { data } = await db.from("household_members").select("household_id").eq("user_id", uid).eq("status", "active").limit(1);
    if (data && data[0]?.household_id) return data[0].household_id;
    await sleep(500);
  }
  const { data: hh, error } = await db.from("households").insert({ owner_id: uid, name: "Hogar Auditoría" }).select("id").single();
  if (error) throw new Error("households.insert: " + error.message);
  await db.from("household_members").insert({ household_id: hh.id, user_id: uid, role: "owner", status: "active" });
  return hh.id;
}

const cnt = (label, res) => {
  if (res.error) console.warn(`  ⚠ ${label}: ${res.error.message}`);
  else console.log(`  ✓ ${label}`);
  return res;
};

async function main() {
  console.log(`Fixture: ${EMAIL} → ${URL}`);
  const uid = await ensureUser();
  console.log("user_id:", uid);
  const hid = await ensureHousehold(uid);
  console.log("household_id:", hid);
  const base = { user_id: uid, household_id: hid };

  // Guard idempotente: si ya sembramos (hay budget_items), no repetir.
  const { data: already } = await db.from("budget_items").select("id").eq("user_id", uid).limit(1);
  if (already && already.length) {
    console.log("Ya estaba sembrado (hay budget_items). No duplico. Recalculo el fixture.");
  } else {
    await seed(uid, hid, base);
  }
  await writeFixture(uid);
  console.log("\nListo. Usuario fixture sembrado. Para limpiar: borrá el usuario en Supabase (cascadea).");
}

async function seed(uid, hid, base) {
  const now = new Date();
  const pm = now.getMonth() + 1;
  const py = now.getFullYear();

  // Perfil (onboarding completo, país CR, estilo de vida deseado para el número de Libertad).
  cnt("profiles", await db.from("profiles").upsert({ id: uid, display_name: "Fixture Auditoría", onboarding_completed: true, profile_completion: 100 }, { onConflict: "id" }));
  cnt("personal_profiles", await db.from("personal_profiles").upsert({
    user_id: uid, age: 34, country: "Costa Rica", financial_nucleus: "familia", dependents_count: 2,
    life_stage: "hacer_crecer", perceived_control: 5, urgency: "media", main_concern: "no_invertir",
    extra: { fixture: true, desiredMonthlyLifestyle: { amount: 5_000_000, currency: CUR } },
  }, { onConflict: "user_id" }));

  // Ingreso (salario + alquiler pasivo).
  cnt("income_sources", await db.from("income_sources").insert([
    { ...base, name: "Salario", income_type: "activo", category: "salario", amount: 1_500_000, currency: CUR, frequency: "mensual", amount_monthly_base: 1_500_000 },
    { ...base, name: "Alquiler", income_type: "pasivo", category: "alquileres", amount: 300_000, currency: CUR, frequency: "mensual", amount_monthly_base: 300_000 },
  ]));

  // ── 15 SOBRES de gasto: categorías favoritas propias (hoja) bajo los frascos del sistema + budget_items ──
  // Roots del sistema (frascos) para colgar las hojas favoritas.
  const { data: roots } = await db.from("expense_categories").select("id,key,name").is("parent_id", null).eq("is_system", true).eq("category_type", "expense");
  const rootByKey = new Map((roots ?? []).map((r) => [r.key ?? r.name, r]));
  const anyRoot = (roots ?? [])[0]?.id ?? null;
  const pick = (k) => rootByKey.get(k)?.id ?? anyRoot;

  const sobres = [
    ["Mercado", "necesidades", 320_000], ["Transporte", "necesidades", 140_000], ["Servicios", "necesidades", 95_000],
    ["Alquiler", "necesidades", 300_000], ["Salud", "necesidades", 60_000], ["Restaurantes", "estilo_vida", 120_000],
    ["Salidas", "estilo_vida", 80_000], ["Suscripciones", "estilo_vida", 35_000], ["Ropa", "estilo_vida", 50_000],
    ["Gimnasio", "estilo_vida", 30_000], ["Mascotas", "necesidades", 40_000], ["Educación", "necesidades", 70_000],
    ["Regalos", "estilo_vida", 25_000], ["Belleza", "estilo_vida", 45_000], ["Hogar", "necesidades", 55_000],
  ];
  let sobresTotal = 0;
  for (const [name, frasco, amount] of sobres) {
    const { data: cat, error: ce } = await db.from("expense_categories").insert({
      user_id: uid, household_id: hid, name, parent_id: pick(frasco), category_type: "expense",
      default_nature: frasco === "necesidades" ? "esencial" : "estilo_vida", is_favorite: true, is_system: false, is_active: true,
    }).select("id").single();
    if (ce) { console.warn(`  ⚠ categoría ${name}: ${ce.message}`); continue; }
    const { error: be } = await db.from("budget_items").insert({
      ...base, type: "expense", category_id: cat.id, name, amount, currency: CUR, frequency: "mensual",
      period_month: pm, period_year: py, source_kind: "manual",
    });
    if (be) { console.warn(`  ⚠ budget ${name}: ${be.message}`); continue; }
    sobresTotal += amount;
  }
  console.log(`  ✓ ${sobres.length} sobres (total ${sobresTotal} ${CUR})`);

  // Metas + fondos de defensa.
  cnt("savings_goals", await db.from("savings_goals").insert([
    { ...base, name: "Fondo de emergencia", goal_type: "defensa:fondo_emergencia", kind: "meta", target_amount: 3_000_000, current_amount: 1_800_000, monthly_contribution: 100_000, currency: CUR, priority: "alta", is_essential: true },
    { ...base, name: "Fondo de paz", goal_type: "defensa:fondo_paz", kind: "meta", target_amount: 6_000_000, current_amount: 1_200_000, monthly_contribution: 80_000, currency: CUR, priority: "alta", is_essential: true },
    { ...base, name: "Carro nuevo", goal_type: null, kind: "meta", target_amount: 8_000_000, current_amount: 2_000_000, monthly_contribution: 150_000, currency: CUR, priority: "media", is_essential: false },
    { ...base, name: "Casa", goal_type: null, kind: "meta", target_amount: 40_000_000, current_amount: 5_000_000, monthly_contribution: 200_000, currency: CUR, priority: "media", is_essential: false },
    { ...base, name: "Viaje fin de año", goal_type: null, kind: "meta", target_amount: 1_500_000, current_amount: 900_000, monthly_contribution: 50_000, currency: CUR, priority: "baja", is_essential: false },
  ]));

  // Holdings con DCA (para inversiones + carril de mercado: BTC, ETH, JUP, KMNO altcoins + VOO).
  cnt("investment_holdings", await db.from("investment_holdings").insert([
    // monthly_contribution está en la moneda del holding (USD) → valores realistas ($/mes).
    { ...base, symbol: "BTC", asset_type: "cripto", quantity: 0.15, average_cost: 40_000, currency: "USD", monthly_contribution: 100, is_recurring: true, purchase_date: "2024-06-01" },
    { ...base, symbol: "ETH", asset_type: "cripto", quantity: 2, average_cost: 2_500, currency: "USD", monthly_contribution: 60, is_recurring: true, purchase_date: "2024-06-01" },
    { ...base, symbol: "JUP", asset_type: "cripto", quantity: 1_500, average_cost: 0.6, currency: "USD", monthly_contribution: 40, is_recurring: true, purchase_date: "2024-09-01" },
    { ...base, symbol: "KMNO", asset_type: "cripto", quantity: 3_000, average_cost: 0.05, currency: "USD", monthly_contribution: 20, is_recurring: true, purchase_date: "2024-10-01" },
    { ...base, symbol: "VOO", asset_type: "etf", quantity: 5, average_cost: 480, currency: "USD", monthly_contribution: 120, is_recurring: true, purchase_date: "2023-01-01" },
  ]));

  // Deudas + seguros.
  cnt("debts", await db.from("debts").insert([
    { ...base, name: "Tarjeta de crédito", debt_type: "tarjeta", balance: 1_400_000, min_payment: 70_000, current_payment: 90_000, apr: 38, currency: CUR, is_current: true, delinquency: "no", classification: "critica" },
    { ...base, name: "Préstamo personal", debt_type: "prestamo", balance: 2_200_000, min_payment: 95_000, current_payment: 95_000, apr: 18, currency: CUR, is_current: true, delinquency: "no", classification: "controlada" },
  ]));
  cnt("insurance_policies", await db.from("insurance_policies").insert([
    { ...base, policy_type: "vida", provider: "Aseguradora", coverage: 90_000_000, premium: 18_000, premium_frequency: "mensual", currency: CUR },
    { ...base, policy_type: "medico", provider: "Aseguradora", coverage: 50_000_000, premium: 35_000, premium_frequency: "mensual", currency: CUR },
  ]));

  // Liquidez (para meses de colchón) + un activo.
  cnt("assets", await db.from("assets").insert([
    { ...base, name: "Ahorros", asset_class: "liquido", value: 3_000_000, currency: CUR, generates_income: false, liquidity: "alta" },
  ]));
}

// ── Fixture: recalcula desde la BD las cifras que el chat debe reportar ──
async function writeFixture(uid) {
  const monthly = (rows, field) => (rows ?? []).reduce((s, r) => s + Number(r[field] ?? 0), 0);
  const now = new Date();
  const [{ data: budget }, { data: goals }, { data: holds }, { data: debts }, { data: pol }, { data: inc }] = await Promise.all([
    db.from("budget_items").select("amount,source_kind,type").eq("user_id", uid).eq("type", "expense").eq("period_month", now.getMonth() + 1).eq("period_year", now.getFullYear()),
    db.from("savings_goals").select("monthly_contribution").eq("user_id", uid),
    db.from("investment_holdings").select("monthly_contribution").eq("user_id", uid),
    db.from("debts").select("current_payment,min_payment").eq("user_id", uid).eq("is_current", true),
    db.from("insurance_policies").select("premium").eq("user_id", uid),
    db.from("income_sources").select("amount_monthly_base").eq("user_id", uid),
  ]);
  const sobres = monthly((budget ?? []).filter((b) => ["manual", "recurring"].includes(b.source_kind)), "amount");
  // Solo se ASERTAN las cifras CRC-nativas exactas (gasto de sobres, ingreso). El compromiso/
  // independencia incluyen DCA en USD → dependen de la FX en vivo del motor, así que NO se asertan
  // exacto (la consistencia compromiso≈Ind×0,08÷12 la valida el juez/heurísticas). void por claridad.
  void goals; void holds; void debts; void pol;
  const fixture = {
    currency: CUR,
    hasSobres: true,
    ingresoMensual: Math.round(monthly(inc, "amount_monthly_base")),
    gastoMensual: Math.round(sobres),
    _nota: "gasto/ingreso son CRC-exactos (asertables). compromiso/independencia incluyen DCA en USD (FX en vivo) → no se asertan exacto.",
  };
  writeFileSync(join(HERE, "chat-audit-fixture.json"), JSON.stringify(fixture, null, 2));
  console.log("\nCifras esperadas (fixture) →", JSON.stringify(fixture, null, 2));
  console.log("Escrito: scripts/chat-audit-fixture.json");
}

main().catch((e) => {
  console.error("Seed falló:", e.message);
  process.exit(1);
});
