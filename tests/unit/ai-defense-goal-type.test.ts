/**
 * Fix de producto (fondo de defensa por INTENCIÓN): la acción `create_goal` del asesor declara el
 * tipo de fondo formal en el payload; una whitelist estricta (defenseGoalType) es la única puerta
 * por la que ese tipo entra al borrador de la tarjeta. Este test LOCKEA:
 *  (a) los dos tipos formales pasan; ausente / basura / tipo no-defensa / no-string ⇒ genérica;
 *  (b) NEGATIVO: una meta discrecional (viaje, carro) emitida por el modelo queda genérica.
 * Todo puro: `defenseGoalType` + `parseAction` (types.ts), sin BD ni client component.
 */
import { describe, it, expect } from "vitest";
import { defenseGoalType, parseAction } from "@/lib/ai/types";

describe("defenseGoalType — whitelist estricta del fondo de defensa", () => {
  it("(a) acepta EXACTAMENTE los dos tipos formales", () => {
    expect(defenseGoalType({ goalType: "defensa:fondo_emergencia" })).toBe(
      "defensa:fondo_emergencia",
    );
    expect(defenseGoalType({ goalType: "defensa:fondo_paz" })).toBe("defensa:fondo_paz");
  });

  it("(a) rechaza ausente / basura / no-defensa / no-string ⇒ undefined (meta genérica)", () => {
    expect(defenseGoalType({})).toBeUndefined(); // ausente
    expect(defenseGoalType({ goalType: "banana" })).toBeUndefined(); // basura
    expect(defenseGoalType({ goalType: "defensa:otro_inventado" })).toBeUndefined(); // defensa:* no válido
    expect(defenseGoalType({ goalType: "meta" })).toBeUndefined(); // tipo no-defensa
    expect(defenseGoalType({ goalType: 42 })).toBeUndefined(); // no-string
    expect(defenseGoalType({ goalType: null })).toBeUndefined();
    expect(defenseGoalType({ goalType: ["defensa:fondo_emergencia"] })).toBeUndefined(); // no-string
  });
});

describe("flujo realista: bloque ```action``` del modelo → parseAction → defenseGoalType", () => {
  it("un create_goal del FONDO con goalType formal ⇒ tipado", () => {
    const bloque =
      '```action\n{"type":"create_goal","payload":{"name":"Fondo de emergencia","targetAmount":3000000,"monthlyContribution":130000,"currency":"CRC","goalType":"defensa:fondo_emergencia"},"summary":"Crear tu fondo de emergencia"}\n```';
    const { action } = parseAction(bloque);
    expect(action?.type).toBe("create_goal");
    expect(defenseGoalType(action!.payload)).toBe("defensa:fondo_emergencia");
  });

  it("(b) NEGATIVO: una meta discrecional (viaje) sin goalType ⇒ genérica", () => {
    const bloque =
      '```action\n{"type":"create_goal","payload":{"name":"Viaje familiar","targetAmount":50000000,"monthlyContribution":273305,"currency":"CRC","targetDate":"2036-07-01"},"summary":"Meta de viaje"}\n```';
    const { action } = parseAction(bloque);
    expect(action?.type).toBe("create_goal");
    expect(defenseGoalType(action!.payload)).toBeUndefined();
  });

  it("(b) NEGATIVO: 'Carro' aunque el modelo cuele un goalType basura ⇒ genérica", () => {
    const bloque =
      '```action\n{"type":"create_goal","payload":{"name":"Carro nuevo","targetAmount":8000000,"monthlyContribution":200000,"currency":"CRC","goalType":"auto"},"summary":"Meta carro"}\n```';
    const { action } = parseAction(bloque);
    expect(defenseGoalType(action!.payload)).toBeUndefined();
  });
});
