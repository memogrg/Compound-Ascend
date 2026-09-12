/**
 * El muro de plan del móvil. Dos cosas que tiene que hacer bien:
 *
 *  1. Bloquear la app cuando la cuenta no tiene plan, PERO dejar abierto /m/perfil —
 *     ahí se exportan los datos y se borra la cuenta. Un muro que también tapa la
 *     salida convierte los datos de la persona en rehenes.
 *  2. Fallar ABIERTO ante la duda. Un muro que se equivoca hacia el bloqueo deja a
 *     alguien encerrado en su propia app.
 */
import { describe, it, expect } from "vitest";
import { debeRedirigirSinPlan } from "@/app/(mobile)/m/lib/plan-guard";

describe("debeRedirigirSinPlan", () => {
  it("sin plan, en una pantalla cualquiera → redirige", () => {
    expect(debeRedirigirSinPlan("ninguno", "/m")).toBe(true);
    expect(debeRedirigirSinPlan("ninguno", "/m/gastos")).toBe(true);
    expect(debeRedirigirSinPlan("ninguno", "/m/asistente")).toBe(true);
  });

  it("sin plan, en /m/perfil → NO redirige (ahí se exporta y se borra la cuenta)", () => {
    expect(debeRedirigirSinPlan("ninguno", "/m/perfil")).toBe(false);
  });

  it("sin plan, ya en /m/sin-plan → NO redirige (sería un bucle)", () => {
    expect(debeRedirigirSinPlan("ninguno", "/m/sin-plan")).toBe(false);
  });

  it("con plan activo → nunca redirige", () => {
    expect(debeRedirigirSinPlan("pro", "/m")).toBe(false);
    expect(debeRedirigirSinPlan("esencial", "/m/gastos")).toBe(false);
    expect(debeRedirigirSinPlan("max", "/m/perfil")).toBe(false);
  });

  it("sin fila de perfil todavía (null/undefined) → no bloquea", () => {
    expect(debeRedirigirSinPlan(null, "/m")).toBe(false);
    expect(debeRedirigirSinPlan(undefined, "/m")).toBe(false);
  });

  it("sin pathname conocido → no bloquea (si no, /m/sin-plan no se reconoce y hace bucle)", () => {
    expect(debeRedirigirSinPlan("ninguno", "")).toBe(false);
    expect(debeRedirigirSinPlan("ninguno", null)).toBe(false);
    expect(debeRedirigirSinPlan("ninguno", undefined)).toBe(false);
  });

  it("las subrutas de las permitidas también pasan", () => {
    expect(debeRedirigirSinPlan("ninguno", "/m/perfil/algo")).toBe(false);
  });

  it("una ruta que solo EMPIEZA parecido sí se bloquea", () => {
    expect(debeRedirigirSinPlan("ninguno", "/m/perfil-financiero")).toBe(true);
  });
});
