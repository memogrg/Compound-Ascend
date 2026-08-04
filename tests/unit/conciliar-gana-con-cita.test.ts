/**
 * PRECEDENCIA: estado citado + intención de verificar → gana `conciliar_estado`.
 *
 * El bug: el mensaje que acompaña a la cita matcheaba `consulta_transacciones` por su cuenta
 * ("verificar … transacciones … DEL MES PASADO" trae la palabra y un periodo), así que
 * `matched != null` y el bloque CITADO no se evaluaba nunca. Respuesta: todo el mes, en vez de
 * cotejar las filas citadas.
 *
 * La traza mostró además un SEGUNDO camino de falla: "¿están registradas?" no matchea ningún
 * carril Y tampoco tiene pronombre, así que la regla de #613 (referencia → rutear el citado)
 * tampoco lo agarraba.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { matchIntent } from "@/lib/ai/router";
import { pareceIntencionDeConciliar } from "@/lib/ai/statement-parse";

const BLOQUE = `246276  2026-07-17  CAFE SIMONETA  9,200.00  COL  D
246277  2026-07-18  STARBUCKS  12,000.00  COL  D
246281  2026-07-20  POPS  1,500.00  COL  D`;

describe("pareceIntencionDeConciliar", () => {
  it("reconoce las formas de pedir verificación", () => {
    for (const f of [
      "verificar si estas transacciones del mes pasado ya están registradas",
      "¿podés verificar estas transacciones del mes pasado?",
      "¿están registradas?",
      "¿ya están anotadas?",
      "cuáles faltan",
      "¿qué me falta de esas?",
      "conciliá esto",
      "chequeá si las tengo cargadas",
      "cotejá con lo que tengo",
    ]) {
      expect(pareceIntencionDeConciliar(f), f).toBe(true);
    }
  });

  it("NO se dispara con una consulta común", () => {
    for (const f of [
      "dame las transacciones de restaurantes del mes pasado",
      "¿cuánto gasté en comida?",
      "¿cómo va mi fondo de emergencia?",
      "registrá un gasto de 5000 en super",
    ]) {
      expect(pareceIntencionDeConciliar(f), f).toBe(false);
    }
  });
});

describe("la conciliación le GANA a consulta_transacciones", () => {
  it("«verificar … transacciones … del mes pasado» con el bloque citado → concilia el CITADO", () => {
    // SIN cita ese mensaje es una consulta del mes: por eso el bug era invisible.
    expect(matchIntent("verificar si estas transacciones del mes pasado ya están registradas")?.intent).toBe(
      "consulta_transacciones",
    );
    const m = matchIntent(
      "verificar si estas transacciones del mes pasado ya están registradas",
      BLOQUE,
    );
    expect(m?.intent).toBe("conciliar_estado");
    expect(m?.params.texto).toBe(BLOQUE); // exactamente las filas citadas
  });

  it("«¿están registradas?» — el caso que tampoco entraba por la regla de referencia", () => {
    expect(matchIntent("¿están registradas?")).toBeNull();
    expect(matchIntent("¿están registradas?", BLOQUE)?.intent).toBe("conciliar_estado");
  });

  it("las demás formas de pedirlo también", () => {
    for (const f of ["¿podés verificar estas transacciones del mes pasado?", "cuáles faltan", "conciliá esto"]) {
      expect(matchIntent(f, BLOQUE)?.intent, f).toBe("conciliar_estado");
    }
  });
});

describe("no secuestra lo que no le toca", () => {
  it("SIN cita, la consulta de siempre sigue igual", () => {
    const m = matchIntent("dame las transacciones de restaurantes del mes pasado");
    expect(m?.intent).toBe("consulta_transacciones");
    expect(m?.params.sobre).toBe("restaurantes");
  });

  it("CON cita pero sin intención de verificar, la consulta gana igual", () => {
    // Responder al bloque preguntando otra cosa NO debe convertirse en conciliación.
    const m = matchIntent("dame las transacciones de restaurantes del mes pasado", BLOQUE);
    expect(m?.intent).toBe("consulta_transacciones");
    expect(m?.params.sobre).toBe("restaurantes");
  });

  it("con intención de verificar pero SIN estado citado, no fuerza conciliación", () => {
    expect(matchIntent("¿están registradas?", "hola, ¿cómo estás?")).toBeNull();
  });

  it("el bloque pegado en el mensaje ACTUAL sigue conciliando", () => {
    expect(matchIntent(BLOQUE)?.intent).toBe("conciliar_estado");
  });
});
