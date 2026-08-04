/**
 * Guardas del catálogo de categorías de sistema.
 *
 * Contexto (auditoría 2026-08-03). Cuatro migraciones sembraron taxonomía una encima de otra y
 * dejaron tres pares de GEMELAS: el mismo concepto, dos `key` distintas, dentro del mismo frasco.
 * La migración 20260811000001 las consolidó y dejó dos guardas en la BD:
 *
 *   · `uq_expense_categories_sys_parent_name` — mismo padre + mismo nombre exacto.
 *   · el trigger `cat_sin_gemelas` — dentro de un mismo FRASCO, dos descendientes activos no
 *     pueden normalizar al mismo nombre ("Supermercado" vs "Supermercados").
 *
 * Esas dos rompen el job `migrations` del CI (que hace `supabase db reset` sobre una BD limpia) si
 * una migración futura reintroduce el patrón. Lo que la BD NO puede vigilar es el código: una
 * constante de TypeScript puede seguir nombrando una categoría retirada sin que nada falle, y ese
 * fue justamente el bug que la auditoría encontró vivo en producción — el diccionario de comercios
 * apuntaba a las dos gemelas MUERTAS. De eso se encarga este archivo.
 */
import { describe, it, expect } from "vitest";
import { MERCHANT_SEED, CATEGORIAS_RETIRADAS } from "@/modules/financial-base/engine/merchant-seed";

describe("diccionario de comercios vs. categorías retiradas", () => {
  it("ninguna entrada apunta a una categoría retirada", () => {
    const rotas = MERCHANT_SEED.filter((s) => s.categoryKey in CATEGORIAS_RETIRADAS).map(
      (s) => `${s.patterns[0]}… → ${s.categoryKey} (usar ${CATEGORIAS_RETIRADAS[s.categoryKey]})`,
    );
    expect(rotas, "hay patrones apuntando a categorías fusionadas").toEqual([]);
  });

  it("los dos casos que estaban rotos apuntan ahora a la canónica", () => {
    const destino = (pattern: string) =>
      MERCHANT_SEED.find((s) => s.patterns.includes(pattern))?.categoryKey;

    // 19 transacciones y 2 presupuestos vivían en `alim_super`; `alim_supermercado` tenía 0.
    expect(destino("walmart")).toBe("alim_super");
    expect(destino("automercado")).toBe("alim_super");
    // Los presupuestos derivados escriben en `viv_alquiler`, no en la nieta legada.
    expect(destino("alquiler")).toBe("viv_alquiler");
  });

  it("una canónica nunca es a su vez una retirada (la fusión no encadena)", () => {
    for (const [perdedora, canonica] of Object.entries(CATEGORIAS_RETIRADAS)) {
      expect(canonica, `${perdedora} apunta a sí misma`).not.toBe(perdedora);
      expect(canonica in CATEGORIAS_RETIRADAS, `${canonica} también está retirada`).toBe(false);
    }
  });
});

describe("integridad del diccionario", () => {
  it("no hay patrones vacíos ni con mayúsculas (el match es en minúsculas)", () => {
    for (const seed of MERCHANT_SEED) {
      expect(seed.patterns.length, seed.categoryKey).toBeGreaterThan(0);
      for (const p of seed.patterns) {
        expect(p.trim(), `patrón vacío en ${seed.categoryKey}`).not.toBe("");
        expect(p, `"${p}" tiene mayúsculas`).toBe(p.toLowerCase());
      }
    }
  });

  it("ningún patrón se repite apuntando a dos categorías distintas", () => {
    const visto = new Map<string, string>();
    const choques: string[] = [];
    for (const seed of MERCHANT_SEED) {
      for (const p of seed.patterns) {
        const previo = visto.get(p);
        if (previo && previo !== seed.categoryKey) {
          choques.push(`"${p}" → ${previo} y ${seed.categoryKey}`);
        }
        visto.set(p, seed.categoryKey);
      }
    }
    expect(choques).toEqual([]);
  });
});
