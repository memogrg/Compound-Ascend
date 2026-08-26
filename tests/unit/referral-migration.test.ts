/**
 * Contrato de la migración de referidos y de su cableado.
 *
 * Se lee el SQL y los archivos de enganche porque lo que hay que proteger aquí
 * no es un cálculo, son GARANTÍAS estructurales: el UNIQUE que hace idempotente
 * la atribución, la RLS que impide inventarse referidos, el `sameSite: lax` sin
 * el cual toda atribución vía Google se pierde en silencio, y el backfill sin
 * el cual los usuarios existentes se quedan sin código.
 *
 * Un test que ejecutara SQL de verdad vive en tests/rls (requiere credenciales y
 * se salta en CI); esto corre siempre.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

const SQL = read("supabase", "migrations", "20260826000001_referrals.sql");
const FIX = read("supabase", "migrations", "20260826000002_referrals_search_path_fix.sql");
const DEFAULTS = read("supabase", "migrations", "20260826000003_referral_code_default.sql");

/**
 * REGRESIÓN 2 — el upsert sobre `profiles` que dejó de funcionar.
 *
 * 000001 dejó `referral_code` NOT NULL y SIN default. El trigger lo pone en el
 * alta, así que ese camino quedó cubierto; cualquier OTRO que inserte en
 * `profiles` sin nombrar la columna, no. Y falla incluso cuando la fila ya
 * existe: en `insert ... on conflict do update`, Postgres valida la tupla
 * PROPUESTA antes de detectar el conflicto, así que el patrón normal de
 * "asegurá esta fila" quedó roto para toda la tabla.
 *
 * Se vio en el seed del E2E: 23502 descartado en silencio →
 * onboarding_completed en false → /dashboard redirigía a /bienvenida → el smoke
 * fallaba cinco pasos después con un mensaje sin relación.
 */
describe("regresión: insertar en profiles sin referral_code no puede fallar", () => {
  it("la columna tiene DEFAULT, no solo el trigger", () => {
    expect(DEFAULTS).toMatch(
      /alter column referral_code set default public\.gen_unique_referral_code\(\)/,
    );
  });

  it("la migración se verifica a sí misma reproduciendo el insert que rompía", () => {
    expect(DEFAULTS).toContain("insert into public.profiles (id, display_name, onboarding_completed)");
    expect(DEFAULTS).toContain("raise exception");
    // Y no deja rastro: la verificación se revierte.
    expect(DEFAULTS).toContain("rollback_de_verificacion");
  });

  it("el seed del E2E no vuelve a descartar el error del perfil", () => {
    // El defecto de fondo no era el upsert, era el error ignorado: el seed decía
    // "listo" con el perfil sin marcar.
    const seed = read("scripts", "seed-e2e-user.mjs");
    expect(seed).toContain("profileError");
    expect(seed).toMatch(/if \(profileError\)[\s\S]*process\.exit\(1\)/);
  });

  it("el seed usa update: el perfil ya existe, el insert del upsert solo estorbaba", () => {
    const seed = read("scripts", "seed-e2e-user.mjs");
    expect(seed).not.toMatch(/\.upsert\(/);
    expect(seed).toMatch(/\.update\(\{[^}]*onboarding_completed: true/);
  });
});

/**
 * REGRESIÓN — el bug que rompió el alta de usuarios.
 *
 * `handle_new_user` es SECURITY DEFINER con `set search_path = public`. Una
 * función llamada desde ahí HEREDA ese search_path si no declara el suyo, y
 * `gen_random_bytes` es de pgcrypto, que en Supabase vive en `extensions`.
 * Resultado: el generador no encontraba la función, el trigger lanzaba y el
 * INSERT en auth.users se revertía entero. Ningún usuario podía registrarse.
 *
 * Ni la suite ni el job de "migraciones aplican en BD fresca" lo vieron: en una
 * base vacía el backfill no recorre filas, así que la función se DEFINE pero
 * nunca se EJECUTA. Lo cazó el E2E smoke, que sí crea un usuario.
 */
describe("regresión: los generadores no dependen del search_path del llamador", () => {
  /** Funciones que usan pgcrypto y por tanto necesitan `extensions` en su search_path. */
  const GENERADORES = ["gen_referral_code", "gen_unique_referral_code"];

  it("cada generador declara su propio search_path con extensions", () => {
    for (const nombre of GENERADORES) {
      const i = FIX.indexOf(`function public.${nombre}()`);
      expect(i, `${nombre} no está en el hotfix`).toBeGreaterThan(-1);
      const cuerpo = FIX.slice(i, FIX.indexOf("$$;", i));
      expect(cuerpo, `${nombre} sin search_path`).toMatch(/set search_path = public, extensions/);
    }
  });

  it("toda función que use pgcrypto declara extensions en su search_path", () => {
    // La regla general, no solo estos dos casos: si alguien agrega otra función
    // con gen_random_bytes y se olvida del search_path, vuelve el mismo bug.
    const ultimaDefinicion = new Map<string, string>();
    for (const sql of [SQL, FIX]) {
      const re = /create or replace function (public\.\w+)\(([\s\S]*?)\$\$;/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql))) ultimaDefinicion.set(m[1]!, m[2]!);
    }
    const culpables = [...ultimaDefinicion]
      .filter(([, cuerpo]) => /gen_random_bytes/.test(cuerpo))
      .filter(([, cuerpo]) => !/set search_path[^\n]*extensions/.test(cuerpo))
      .map(([nombre]) => nombre);
    expect(culpables).toEqual([]);
  });

  it("el hotfix se verifica a sí mismo simulando el contexto del trigger", () => {
    // Fija search_path = public (lo que impone handle_new_user) y llama al
    // generador: si volviera el bug, la migración falla en vez de quedar a medias.
    expect(FIX).toContain("set_config('search_path', 'public', true)");
    expect(FIX).toContain("raise exception");
  });
});

describe("higiene del directorio de migraciones", () => {
  it("solo hay UN archivo con esta versión", () => {
    // El CLI resuelve la versión por el prefijo numérico: dos archivos que
    // empiecen con 20260826000001 serían dos migraciones con la misma versión y
    // `supabase db reset` fallaría. Por eso el script de verificación vive en
    // supabase/verify/, no acá.
    const dir = readdirSync(join(process.cwd(), "supabase", "migrations"));
    expect(dir.filter((f) => f.startsWith("20260826000001"))).toHaveLength(1);
  });

  it("el script de verificación existe y prueba las reglas de verdad", () => {
    const verify = read("supabase", "verify", "20260826000001_referrals.verify.sql");
    expect(verify).toContain("auto-referido bloqueado");
    expect(verify).toContain("doble alta no duplica");
    // En transacción revertida: verificar no puede ensuciar la base.
    expect(verify).toContain("rollback");
  });
});

describe("profiles.referral_code", () => {
  it("se agrega, se backfillea y RECIÉN después se pone NOT NULL", () => {
    // El orden importa: con filas existentes, un NOT NULL de entrada falla.
    const add = SQL.indexOf("add column if not exists referral_code");
    const backfill = SQL.indexOf("where referral_code is null");
    const notNull = SQL.indexOf("alter column referral_code set not null");
    expect(add).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(add);
    expect(notNull).toBeGreaterThan(backfill);
  });

  it("el backfill genera un código POR FILA, no uno para todas", () => {
    // Un `default` de columna se evalúa una sola vez y le daría el MISMO código
    // a todo el mundo; el bucle es lo que lo evita.
    expect(SQL).toMatch(/for r in select id from public\.profiles where referral_code is null/);
    expect(SQL).toContain("update public.profiles");
  });

  it("es único", () => {
    expect(SQL).toMatch(/create unique index[\s\S]*?on public\.profiles\(referral_code\)/);
  });

  it("los usuarios NUEVOS lo reciben en el trigger de alta", () => {
    const fn = SQL.slice(SQL.indexOf("function public.handle_new_user()"));
    expect(fn).toContain("referral_code");
    expect(fn).toContain("gen_unique_referral_code()");
    // Y el resto del alta sigue intacto: perfil + settings.
    expect(fn).toContain("insert into public.user_settings");
  });

  it("el código es aleatorio criptográfico, no secuencial", () => {
    // `random()` sería predecible y permitiría adivinar códigos ajenos.
    expect(SQL).toContain("gen_random_bytes");
    expect(SQL).not.toMatch(/:=\s*random\(\)/);
    expect(SQL).not.toContain("sequence");
  });
});

describe("tabla referrals", () => {
  it("una fila por referido: UNIQUE en referred_user_id", () => {
    // Es lo que hace idempotente a la atribución sin coordinar los dos caminos
    // de alta: el segundo intento choca contra el índice.
    expect(SQL).toMatch(/unique \(referred_user_id\)/);
  });

  it("la base bloquea el auto-referido, no solo la aplicación", () => {
    expect(SQL).toMatch(/check \(referrer_user_id <> referred_user_id\)/);
  });

  it("tiene índice por referrer_user_id (es la consulta del contador)", () => {
    expect(SQL).toMatch(/create index[\s\S]*?on public\.referrals\(referrer_user_id\)/);
  });

  it("borrar un usuario no deja filas colgadas", () => {
    const tabla = SQL.slice(SQL.indexOf("create table if not exists public.referrals"));
    expect(tabla.match(/on delete cascade/g) ?? []).toHaveLength(2);
  });
});

describe("RLS", () => {
  it("el usuario ve SOLO sus propios referidos", () => {
    expect(SQL).toContain("alter table public.referrals enable row level security");
    expect(SQL).toContain("alter table public.referrals force row level security");
    expect(SQL).toMatch(/for select using \(auth\.uid\(\) = referrer_user_id\)/);
  });

  it("NO hay política de escritura: el usuario no puede inventarse referidos", () => {
    const politicas = SQL.slice(SQL.indexOf("alter table public.referrals enable row level"));
    expect(politicas).not.toMatch(/on public\.referrals\s+for insert/);
    expect(politicas).not.toMatch(/on public\.referrals\s+for update/);
    expect(politicas).not.toMatch(/on public\.referrals\s+for all/);
  });

  it("resolver un código no expone el perfil de quien invita", () => {
    const fn = SQL.slice(SQL.indexOf("function public.resolve_referral_code"));
    expect(fn).toContain("security definer");
    // Devuelve el id y nada más: ni nombre ni correo.
    expect(fn).toMatch(/returns uuid/);
    expect(fn).toContain("select id from public.profiles");
  });
});

describe("visibilidad para el equipo", () => {
  it("existe la vista de conteo por usuario", () => {
    expect(SQL).toContain("create or replace view public.referral_counts");
    expect(SQL).toContain("count(r.id)");
  });

  it("la vista respeta las RLS de quien la consulta", () => {
    // Sin `security_invoker`, una vista corre con los permisos de su dueño y
    // filtraría los referidos de todo el mundo a cualquier usuario.
    expect(SQL).toContain("security_invoker = true");
  });
});

describe("captura del código (el punto donde se pierde la atribución)", () => {
  const cookie = read("src", "lib", "referrals", "cookie.ts");
  const middleware = read("src", "lib", "supabase", "middleware.ts");

  it("la cookie es sameSite lax: con strict, Google no la devolvería", () => {
    // Es EL detalle del que depende toda la atribución vía OAuth.
    expect(cookie).toContain('sameSite: "lax"');
    expect(cookie).not.toContain('sameSite: "strict"');
  });

  it("dura lo suficiente para escanear hoy y registrarse otro día", () => {
    expect(cookie).toContain("60 * 60 * 24 * 30");
  });

  it("el middleware la escribe, que es el único sitio que puede", () => {
    // Un Server Component no puede escribir cookies durante el render.
    expect(middleware).toContain("captureReferral");
    expect(middleware).toContain("REFERRAL_COOKIE");
  });

  it("solo guarda códigos con forma válida (no pisa una atribución previa)", () => {
    const fn = middleware.slice(middleware.indexOf("function captureReferral"));
    expect(fn).toContain("isValidReferralCode");
  });

  it("captura también cuando la petición termina en redirect", () => {
    // Si solo se capturara en la respuesta normal, un `?ref=` que cae en una
    // ruta protegida se perdería al redirigir a /login.
    expect(middleware.match(/captureReferral\(/g) ?? []).toHaveLength(4);
  });
});

describe("atribución enganchada donde converge el alta", () => {
  it("el callback de auth atribuye (Google y confirmación por correo pasan por ahí)", () => {
    const cb = read("src", "app", "auth", "callback", "route.ts");
    expect(cb).toContain("attributeReferralFromCookie");
    // `await`, no fire-and-forget: en serverless una promesa suelta se cancela.
    expect(cb).toMatch(/await attributeReferralFromCookie\(\)/);
  });

  it("la bienvenida atribuye como red de seguridad", () => {
    const bv = read("src", "app", "(onboarding)", "bienvenida", "page.tsx");
    expect(bv).toContain("attributeReferralFromCookie");
  });
});

describe("la tarjeta es una sola, en web y en móvil", () => {
  const card = read("src", "components", "referrals", "referral-card.tsx");

  it("el QR se genera en el cliente, no en un servicio externo", () => {
    expect(card).toContain('"use client"');
    expect(card).toContain("QRCode.toDataURL");
    // Nada de api.qrserver / chart.googleapis: filtrarían quién invita a quién.
    expect(card).not.toMatch(/https?:\/\/[^"']*qr/i);
  });

  it("el QR solo lleva la URL de invitación (sin PII)", () => {
    expect(card).toContain("referralUrl(origin, code)");
    expect(card).not.toMatch(/toDataURL\((?!url)/);
  });

  it("ofrece copiar, compartir nativo y descargar el QR", () => {
    expect(card).toContain("clipboard.writeText");
    expect(card).toContain("navigator.share");
    expect(card).toContain("download=");
  });

  it("muestra el contador del usuario", () => {
    expect(card).toContain("count");
    expect(card).toMatch(/persona/);
  });

  it("la montan las DOS pantallas de configuración con el mismo componente", () => {
    const web = read("src", "app", "(dashboard)", "configuracion", "page.tsx");
    const movil = read("src", "app", "(mobile)", "m", "(app)", "perfil", "page.tsx");
    expect(web).toContain("<ReferralCard");
    expect(movil).toContain("<ReferralCard");
    expect(movil).toContain('skin="mobile"');
  });
});
