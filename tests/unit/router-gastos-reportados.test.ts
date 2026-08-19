/**
 * "¿QUÉ GASTOS ESTÁN REPORTADOS PARA {sobre} ESTE MES?" — el ruteo de la primera captura.
 *
 * Caía en `gasto_mes` y contestaba el agregado del mes ENTERO ("tu gasto mensual en sobres ronda
 * $3.132") a una pregunta acotada a un sobre: "qué gastos" matchea el patrón de gasto_mes, y "este
 * mes" a secas no cuenta como periodo explícito, así que ningún carril del libro diario la tomaba.
 *
 * El total no estaba mal calculado: estaba contestando otra cosa.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { matchIntent, extractSobreReportado } from "@/lib/ai/router";

const FRASE = "qué gastos están reportados para transporte de vehículo este mes";

describe("extractSobreReportado", () => {
  it("saca el sobre de la frase exacta, sin la cola temporal", () => {
    expect(extractSobreReportado(FRASE)).toBe("transporte de vehículo");
  });

  it("cubre los otros fraseos naturales de lo mismo", () => {
    expect(extractSobreReportado("qué gastos hay en supermercado")).toBe("supermercado");
    expect(extractSobreReportado("qué gastos tengo en restaurantes este mes")).toBe("restaurantes");
    expect(extractSobreReportado("cuáles movimientos están registrados en el sobre de mascotas")).toBe(
      "mascotas",
    );
  });

  it("lo que quedó es un PERIODO, no un sobre → sin filtro", () => {
    expect(extractSobreReportado("qué gastos hay de julio")).toBeNull();
    expect(extractSobreReportado("qué gastos hay de la semana pasada")).toBeNull();
    expect(extractSobreReportado("qué gastos hay en total")).toBeNull();
  });

  it("sin el sustantivo o sin el verbo no entra", () => {
    expect(extractSobreReportado("cuánto gasté en supermercado")).toBeNull();
    expect(extractSobreReportado("qué opinás de supermercado")).toBeNull();
  });
});

describe("ruteo", () => {
  it("la frase exacta rutea a consulta_transacciones FILTRADA por el sobre", () => {
    const m = matchIntent(FRASE);
    expect(m?.intent).toBe("consulta_transacciones");
    expect(m?.params).toMatchObject({
      sobre: "transporte de vehículo",
      periodo: "mes",
      tipo: "gasto",
      agrupacion: "ninguna",
    });
  });

  it("con un periodo explícito se respeta ese periodo", () => {
    const m = matchIntent("qué gastos están reportados para restaurantes el mes pasado");
    expect(m?.intent).toBe("consulta_transacciones");
    expect(m?.params).toMatchObject({ sobre: "restaurantes", periodo: "mes_pasado" });
  });

  it("los intents viejos NO se rompieron", () => {
    expect(matchIntent("¿cuánto gasto al mes?")?.intent).toBe("gasto_mes");
    expect(matchIntent("¿en qué gasto más?")?.intent).toBe("gasto_categoria");
    expect(matchIntent("¿cuánto gasté la semana pasada?")?.intent).toBe("consulta_transacciones");
  });
});
