/**
 * Seed del usuario de prueba E2E para CI (Supabase efímero del runner).
 * Crea (idempotente) el usuario y lo deja con sesión lista para el smoke.
 * Usa service-role del Supabase LOCAL del runner — nunca toca producción.
 *
 * Env requeridas (las exporta el job de CI desde `supabase status -o env`):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   E2E_EMAIL, E2E_PASSWORD
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

/** Quita comillas y espacios envolventes (defensa ante exports tipo KEY="val"). */
const clean = (v) => v?.trim().replace(/^["']|["']$/g, "");

const url = clean(process.env.SUPABASE_URL);
const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = process.env.E2E_EMAIL ?? "e2e@ci.local";
const password = process.env.E2E_PASSWORD;

if (!url || !serviceKey || !password) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / E2E_PASSWORD");
  process.exit(1);
}

if (!/^https?:\/\//i.test(url)) {
  // Causa típica: el valor llegó con comillas literales desde GITHUB_ENV (issue #94).
  console.error(
    `SUPABASE_URL inválida (debe empezar con http(s)://). Recibido: ${JSON.stringify(url)}`,
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: created, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: "E2E Bot" },
});

let userId = created?.user?.id;
if (error) {
  if (!/already (been )?registered|exists/i.test(error.message)) {
    console.error("createUser falló:", error.message);
    process.exit(1);
  }
  // Ya existe: recupera su id paginando la lista.
  const { data: list } = await admin.auth.admin.listUsers();
  userId = list?.users.find((u) => u.email === email)?.id;
  console.log("Usuario E2E ya existía, reutilizado.");
} else {
  console.log("Usuario E2E creado.");
}

if (!userId) {
  console.error("No se pudo resolver el id del usuario E2E.");
  process.exit(1);
}

// Marca onboarding completo para que /dashboard no redirija a /bienvenida.
//
// UPDATE y no upsert: el perfil SIEMPRE existe ya (lo crea el trigger
// handle_new_user al insertar en auth.users), así que el insert del upsert no
// aporta nada y sí arrastra un problema — tiene que satisfacer todas las
// columnas NOT NULL de la tabla aunque la fila exista, porque Postgres valida la
// tupla propuesta antes de detectar el conflicto. Cuando `profiles` ganó
// `referral_code NOT NULL`, ese upsert empezó a devolver 23502.
//
// Y el error se COMPRUEBA: antes se descartaba, así que el seed decía "listo",
// onboarding_completed quedaba en false, /dashboard redirigía a /bienvenida y el
// smoke fallaba cinco pasos después con un mensaje que no tenía nada que ver
// ("Flujo del mes" no visible). Un seed que miente cuesta más que uno que falla.
// El `plan` va acá por la misma razón que `onboarding_completed`: desde que
// existe el muro de suscripción, una cuenta en `ninguno` no llega al panel —
// el middleware la manda a /suscripcion y el smoke muere en "Flujo del mes"
// sin decir por qué. Se siembra en `max` porque el recorrido toca funciones de
// todos los niveles, y un usuario que de verdad usa la app tiene plan.
// `terms_version` se siembra con la versión vigente: sin eso el bot ve la barra de
// aceptación en TODA pantalla del recorrido, tapando el contenido que el smoke va a
// buscar. Se lee de src/lib/legal/version.ts para que suba sola cuando suba la versión.
const legal = await readFile(new URL("../src/lib/legal/version.ts", import.meta.url), "utf8");
const LEGAL_VERSION = /LEGAL_VERSION = "([^"]+)"/.exec(legal)?.[1];
if (!LEGAL_VERSION) {
  console.error("No se pudo leer LEGAL_VERSION de src/lib/legal/version.ts");
  process.exit(1);
}

const { error: profileError } = await admin
  .from("profiles")
  .update({
    display_name: "E2E Bot",
    onboarding_completed: true,
    plan: "max",
    terms_version: LEGAL_VERSION,
    terms_accepted_at: new Date().toISOString(),
  })
  .eq("id", userId);

if (profileError) {
  console.error("No se pudo marcar el perfil E2E:", profileError.message);
  process.exit(1);
}

// Los datos financieros mínimos (un ingreso, para que el dashboard tenga datos)
// se siembran por SQL como superusuario en el workflow: ni service_role ni
// authenticated tienen grant de INSERT sobre income_sources en el stack local.

console.log("Seed E2E listo:", email);
