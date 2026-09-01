/**
 * Regresión #82 — el borrado de cuenta con deudas/holdings debe completar.
 *
 * `cleanup_links_on_entity_delete` es un trigger AFTER DELETE en
 * debts/savings_goals/investment_holdings/insurance_policies. Al borrar el auth
 * user, el cascade de auth.users borra esas filas corriendo como
 * `supabase_auth_admin` (rol de GoTrue), que NO tiene UPDATE sobre
 * transactions/budget_items. Si el trigger corre como SECURITY INVOKER →
 * permission denied → aborta admin.deleteUser → la cuenta no se borra.
 *
 * La función DEBE ser SECURITY DEFINER (corre como su dueño) con search_path
 * fijado. Este test lee las migraciones y falla si la definición EFECTIVA (la del
 * último migration que la define) deja de ser SECURITY DEFINER — p.ej. si una
 * migración futura la redefine como INVOKER o si se revierte el fix.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));
const FIX_MIGRATION = "20260901203129_fix_cleanup_links_trigger_security_definer.sql";

/** Bloques `create or replace function ... cleanup_links_on_entity_delete ... $$;`. */
function definitionsOf(sql: string): string[] {
  const re =
    /create\s+or\s+replace\s+function\s+public\.cleanup_links_on_entity_delete\b[\s\S]*?\$\$;/gi;
  return [...sql.matchAll(re)].map((m) => m[0]);
}

describe("regresión #82 · cleanup_links_on_entity_delete", () => {
  // Las versiones YYYYMMDD… ordenan lexicográficamente = orden de aplicación.
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Definición EFECTIVA = la del último migration (por versión) que la define.
  let effective: { file: string; block: string } | null = null;
  for (const f of files) {
    const blocks = definitionsOf(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    const last = blocks.at(-1);
    if (last) effective = { file: f, block: last };
  }

  it("existe la migración del fix", () => {
    expect(files).toContain(FIX_MIGRATION);
  });

  it("alguna migración define la función", () => {
    expect(effective).not.toBeNull();
  });

  it("la definición efectiva es SECURITY DEFINER con search_path fijado", () => {
    const body = effective!.block.toLowerCase();
    expect(body).toContain("security definer");
    expect(body).toMatch(/set\s+search_path\s*=\s*public\s*,\s*pg_temp/);
  });
});
