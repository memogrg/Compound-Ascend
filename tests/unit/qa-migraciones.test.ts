/**
 * La guarda de paridad de migraciones del arranque de QA.
 *
 * Lo puro: qué considera «falta». El IO —hablar con el CLI de Supabase— no se prueba acá; lo
 * que puede equivocarse de cuenta es esto.
 *
 * El caso que la motiva es real: la base local iba 24 migraciones por detrás,
 * `investment_holdings` no tenía las columnas `payout_*`, el `select` devolvía 400 y
 * `(data ?? [])` lo convertía en «este usuario no tiene inversiones». `/patrimonio` mostraba ₡0
 * con dos posiciones en la tabla, y la pantalla parecía correcta.
 */
import { describe, expect, it } from "vitest";

// @ts-expect-error — `.mjs` sin tipos: es un script del arnés, no código de la app.
import { comandoParaAplicar, migracionesFaltantes } from "../../scripts/qa/migraciones.mjs";

const par = (local: string, remote: string) => ({ local, remote, time: "" });

describe("migracionesFaltantes", () => {
  it("con la base al día no falta ninguna", () => {
    expect(
      migracionesFaltantes([
        par("20260601000001", "20260601000001"),
        par("20260912000001", "20260912000001"),
      ]),
    ).toEqual([]);
  });

  it("una base ATRASADA las nombra, en orden", () => {
    // Este es el caso de verdad: el fichero está en el repo y la base no lo tiene, así que el
    // CLI devuelve `remote` vacío.
    const pares = [
      par("20260601000001", "20260601000001"),
      par("20260907000002", ""),
      par("20260907000001", ""),
      par("20260912000001", ""),
    ];
    expect(migracionesFaltantes(pares)).toEqual([
      "20260907000001",
      "20260907000002",
      "20260912000001",
    ]);
  });

  it("lo que está aplicado pero YA NO está en el repo no es una falta", () => {
    // Pasa al renombrar o retirar una migración: el CLI la devuelve con `local` vacío. No es
    // asunto de esta guarda, que solo pregunta si la base tiene lo que el código espera.
    expect(migracionesFaltantes([{ local: "", remote: "20260101000001", time: "" }])).toEqual([]);
  });

  it("aguanta una lista vacía o con huecos sin reventar", () => {
    expect(migracionesFaltantes([])).toEqual([]);
    expect(migracionesFaltantes([null as never, undefined as never])).toEqual([]);
  });
});

describe("comandoParaAplicar", () => {
  it("sin faltantes no hay comando que dar", () => {
    expect(comandoParaAplicar([])).toBeNull();
  });

  it("nombra las versiones, para poder copiar y pegar", () => {
    const c = comandoParaAplicar(["20260907000001", "20260907000002"])!;
    expect(c).toContain("supabase db push --local");
    // La segunda salida es la del propio repo: las migraciones se aplican a mano y después se
    // reconcilian con `repair`.
    expect(c).toContain("supabase migration repair --status applied");
    expect(c).toContain("20260907000001 20260907000002");
  });
});

describe("exigirBaseAlDia", () => {
  it("en CI no comprueba nada: la base la crea el propio job desde las migraciones", async () => {
    // @ts-expect-error — `.mjs` sin tipos.
    const { exigirBaseAlDia } = await import("../../scripts/qa/migraciones.mjs");
    const antes = process.env.CI;
    process.env.CI = "true";
    try {
      // Si comprobara, reventaría: en el runner no hay CLI de Supabase que consultar.
      expect(await exigirBaseAlDia({ cwd: "/no/existe" })).toEqual({
        saltada: true,
        faltantes: [],
      });
    } finally {
      if (antes === undefined) delete process.env.CI;
      else process.env.CI = antes;
    }
  });
});
