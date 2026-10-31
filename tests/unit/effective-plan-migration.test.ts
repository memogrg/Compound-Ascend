/**
 * Guard: la regla «qué plan incluye hogar» vive dos veces, en `PLAN_FEATURES` (src/lib/plan.ts)
 * y en la función SQL `effective_plan`. Si se suma un plan con hogar en TS y la migración no se
 * actualiza, sus miembros no heredarían y caerían en el muro sin aviso. Este test lee la última
 * migración que define la función y compara las dos listas, y el orden de planes con PLAN_RANK.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { can, PLAN_RANK, type Plan } from "@/lib/plan";

const DIR = join(process.cwd(), "supabase", "migrations");

function ultimaDefinicion(): { archivo: string; sql: string } {
  const archivos = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let ultima: { archivo: string; sql: string } | null = null;
  for (const archivo of archivos) {
    const sql = readFileSync(join(DIR, archivo), "utf8");
    if (/create\s+or\s+replace\s+function\s+public\.effective_plan\s*\(/i.test(sql)) {
      ultima = { archivo, sql };
    }
  }
  if (!ultima) throw new Error("ninguna migración define public.effective_plan");
  return ultima;
}

const { archivo, sql } = ultimaDefinicion();

describe(`effective_plan (${archivo}) vs src/lib/plan.ts`, () => {
  it("los planes con hogar del SQL son los de can(p, 'household')", () => {
    const m = /o\.plan\s+in\s*\(([^)]*)\)/i.exec(sql);
    expect(m, "no se encontró el filtro `o.plan in (...)`").not.toBeNull();
    const enSql = [...m![1]!.matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort();
    const enTs = (Object.keys(PLAN_RANK) as Plan[]).filter((p) => can(p, "household")).sort();
    expect(enSql).toEqual(enTs);
  });

  it("el orden del CASE es PLAN_RANK", () => {
    const enSql = Object.fromEntries(
      [...sql.matchAll(/when\s+'([a-z]+)'\s+then\s+(\d+)/gi)].map((x) => [x[1], Number(x[2])]),
    );
    const { ninguno, ...conRango } = PLAN_RANK;
    // `ninguno` es el `else 0` del CASE.
    expect(ninguno).toBe(0);
    expect(/else\s+0\s+end/i.test(sql)).toBe(true);
    expect(enSql).toEqual(conRango);
  });

  it("SECURITY DEFINER con search_path vacío y sin EXECUTE para anon", () => {
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*''/i);
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.effective_plan\(uuid\)\s+from\s+anon/i,
    );
  });
});
