import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isStale, KINDS_DETECTORES } from "@/lib/insights";
import { getInsightsFreshness } from "@/lib/insights/insights-service";
import type { Database } from "@/lib/supabase/database.types";

describe("isStale", () => {
  it("sin corrida previa (null) → stale", () => {
    expect(isStale(null)).toBe(true);
  });

  it("corrida reciente → no stale", () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    expect(isStale(oneHourAgo)).toBe(false);
  });

  it("corrida vieja (> maxAgeHours) → stale", () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000);
    expect(isStale(thirteenHoursAgo)).toBe(true);
  });

  it("respeta un maxAgeHours personalizado", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(isStale(twoHoursAgo, 1)).toBe(true);
    expect(isStale(twoHoursAgo, 3)).toBe(false);
  });
});

/**
 * El filtro por `kind` de getInsightsFreshness (fix: la frescura solo la marcan los kinds
 * que escribe la PASADA de detectores).
 *
 * Se prueba la función REAL, no una parte extraída: `AuthContext` inyecta {db, userId}, así
 * que basta un cliente falso que aplique `.in("kind", …)` de verdad sobre unas filas y
 * devuelva la más reciente — el mismo patrón de los tests sim-authctx-*.
 */
type Fila = { kind: string; updated_at: string };

function fakeDb(filas: Fila[]): { db: SupabaseClient<Database>; filtroAplicado: string[] | null } {
  const capturado: { kinds: string[] | null } = { kinds: null };
  const builder = () => {
    let restantes = filas;
    const b: Record<string, unknown> = {};
    const self = () => b;
    Object.assign(b, {
      select: self,
      eq: self,
      in: (columna: string, valores: readonly string[]) => {
        // Lo que el fix agrega. Si alguien lo quita, `restantes` deja de filtrarse y el
        // primer test (ritual fresco + detectores viejos) vuelve a dar "fresco".
        if (columna === "kind") {
          capturado.kinds = [...valores];
          restantes = restantes.filter((f) => valores.includes(f.kind));
        }
        return b;
      },
      order: (columna: string, opts?: { ascending?: boolean }) => {
        if (columna === "updated_at") {
          restantes = [...restantes].sort((x, y) =>
            opts?.ascending ? (x.updated_at < y.updated_at ? -1 : 1) : x.updated_at < y.updated_at ? 1 : -1,
          );
        }
        return b;
      },
      limit: self,
      maybeSingle: async () => ({ data: restantes[0] ?? null }),
    });
    return b;
  };
  const db = { from: () => builder() } as unknown as SupabaseClient<Database>;
  return {
    db,
    get filtroAplicado() {
      return capturado.kinds;
    },
  };
}

const haceHoras = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

describe("getInsightsFreshness · solo cuenta los kinds de detectores", () => {
  it("ritual de hace 1 h + detectores de hace 3 días → stale", async () => {
    // El bug exacto: el cron del ritual (13:00Z) insertaba la fila más reciente de la tabla
    // y los detectores quedaban "frescos" sin haber corrido.
    const { db } = fakeDb([
      { kind: "ritual_patrimonio", updated_at: haceHoras(1) },
      { kind: "deuda_cara", updated_at: haceHoras(72) },
    ]);
    const last = await getInsightsFreshness({ db, userId: "u_1" });
    expect(last).not.toBeNull();
    expect(isStale(last)).toBe(true);
  });

  it("detectores de hace 1 h y ningún ritual → fresco", async () => {
    const { db } = fakeDb([{ kind: "deuda_cara", updated_at: haceHoras(1) }]);
    expect(isStale(await getInsightsFreshness({ db, userId: "u_2" }))).toBe(false);
  });

  it("sin ninguna fila de detector → null, o sea stale (umbral intacto)", async () => {
    const { db } = fakeDb([{ kind: "ritual_patrimonio", updated_at: haceHoras(1) }]);
    const last = await getInsightsFreshness({ db, userId: "u_3" });
    expect(last).toBeNull();
    expect(isStale(last)).toBe(true);
  });

  it("el filtro que se manda a la consulta es KINDS_DETECTORES", async () => {
    const fake = fakeDb([{ kind: "deuda_cara", updated_at: haceHoras(1) }]);
    await getInsightsFreshness({ db: fake.db, userId: "u_4" });
    expect(fake.filtroAplicado).toEqual([...KINDS_DETECTORES]);
  });
});

describe("KINDS_DETECTORES", () => {
  it("incluye deuda_cara y ventana_presupuesto; excluye ritual_patrimonio", () => {
    const set = new Set<string>(KINDS_DETECTORES);
    expect(set.has("deuda_cara")).toBe(true);
    // El ritmo llega a user_insights SOLO por refreshInsights → detectMonthRhythm; sus crons
    // (14:00Z) no insertan, solo marcan 'descartado'. Así que también prueba que la pasada corrió.
    expect(set.has("ventana_presupuesto")).toBe(true);
    expect(set.has("ritual_patrimonio")).toBe(false);
  });

  it("no tiene duplicados", () => {
    expect(new Set<string>(KINDS_DETECTORES).size).toBe(KINDS_DETECTORES.length);
  });

  /**
   * Guardrail contra la duplicación a mano: no hay un registro de detectores del que derivar
   * la lista (los `kind` son literales dentro de cada función), así que la única defensa es
   * contrastarla con el fuente. Si alguien agrega un detector y no toca la constante, o al
   * revés, este test lo dice.
   */
  it("coincide exactamente con los literales kind: de los tres ficheros de detectores", () => {
    const fuentes = [
      "src/lib/insights/detectors.ts",
      "src/lib/insights/dividendo-cobro.ts",
      "src/lib/rhythm/detectors.ts",
    ];
    const enElFuente = new Set<string>();
    for (const f of fuentes) {
      const texto = readFileSync(path.join(process.cwd(), f), "utf8");
      // Solo el cuerpo de los detectores: la propia constante vive al final de detectors.ts
      // y sus entradas no son `kind: "…"`, así que no se cuela.
      for (const m of texto.matchAll(/\bkind:\s*"([a-z_]+)"/g)) enElFuente.add(m[1]!);
    }
    expect([...enElFuente].sort()).toEqual([...KINDS_DETECTORES].sort());
  });
});
