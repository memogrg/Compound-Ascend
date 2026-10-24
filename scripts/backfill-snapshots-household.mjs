/**
 * Backfill de `portfolio_snapshots` sin `household_id`/`created_by`.
 *
 * Dos fases y en este orden: primero LEE las filas afectadas y las imprime con su id, su
 * usuario y el hogar que les tocaría; después actualiza POR ESOS IDS, uno a uno. Un `update`
 * con un `is.null` como filtro tocaría lo que apareciera entre medias; con los ids, lo que se
 * actualiza es exactamente lo que se leyó y se miró.
 *
 * Se corre UNA vez por entorno, con el entorno nombrado a mano:
 *
 *   (set -a; . ./.env.prod.local; set +a; node scripts/backfill-snapshots-household.mjs --dry)
 *   (set -a; . ./.env.prod.local; set +a; node scripts/backfill-snapshots-household.mjs)
 *
 * No hace falta migración: las columnas existen desde `20260601000011_investment_engine.sql`
 * —que crea hasta el índice `idx_portfolio_snapshots_household`—; lo que faltaba era que el
 * insert las pusiera, y que el tipo generado las declarara para que el compilador lo notara.
 *
 * Va DESPUÉS del arreglo del insert, nunca antes: rellenar primero deja el código creando
 * filas nuevas sin los campos y el backfill se queda corto en cuanto alguien abre la pantalla.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECO = process.argv.includes("--dry");
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = async (q, init) => {
  const r = await fetch(`${URL_}/rest/v1/${q}`, {
    ...init,
    headers: { ...h, ...(init?.headers ?? {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${q}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
};

console.log(`objetivo: ${new URL(URL_).host}${SECO ? "  [SIMULACRO]" : ""}\n`);

// ── 1 · la lectura ───────────────────────────────────────────────────────────
const filas = await rest(
  "portfolio_snapshots?select=id,user_id,date,household_id,created_by" +
    "&or=(household_id.is.null,created_by.is.null)&order=date",
);
console.log(`filas sin household_id o sin created_by: ${filas.length}`);
if (filas.length === 0) process.exit(0);

// El hogar que le toca a cada una, por su usuario. Se resuelve igual que la app: la membresía
// activa, prefiriendo aquella donde es owner.
const hogares = new Map();
for (const f of filas) {
  if (hogares.has(f.user_id)) continue;
  const ms = await rest(
    `household_members?select=household_id,role,created_at&user_id=eq.${f.user_id}` +
      "&status=eq.active&order=created_at.asc",
  );
  const owner = ms.find((m) => m.role === "owner");
  hogares.set(f.user_id, (owner ?? ms[0])?.household_id ?? null);
}
console.log(
  "\n  id                                    usuario                               fecha       household_id → le toca",
);
for (const f of filas) {
  console.log(
    `  ${f.id}  ${f.user_id}  ${f.date}  ${f.household_id ?? "(null)"} → ${hogares.get(f.user_id) ?? "(null: sin hogar)"}`,
  );
}

if (SECO) {
  console.log("\nSIMULACRO: no se escribe nada.");
  process.exit(0);
}

// ── 2 · el update, POR IDS ───────────────────────────────────────────────────
let n = 0;
for (const f of filas) {
  const hogar = hogares.get(f.user_id) ?? null;
  const parche = {};
  if (f.household_id == null && hogar != null) parche.household_id = hogar;
  if (f.created_by == null) parche.created_by = f.user_id;
  if (Object.keys(parche).length === 0) {
    console.log(`  ${f.id}: nada que poner (sin hogar)`);
    continue;
  }
  await rest(`portfolio_snapshots?id=eq.${f.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(parche),
  });
  n++;
}
console.log(`\nactualizadas: ${n}`);

// ── 3 · la lectura otra vez ──────────────────────────────────────────────────
const quedan = await rest(
  "portfolio_snapshots?select=id,user_id,date,household_id,created_by&or=(household_id.is.null,created_by.is.null)",
);
console.log(`\nDESPUÉS · filas sin household_id o sin created_by: ${quedan.length}`);
for (const f of quedan) console.log(`  ${f.id}  ${f.user_id}  ${f.date}`);
