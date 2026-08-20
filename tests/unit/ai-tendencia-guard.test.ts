import { describe, it, expect } from "vitest";
import {
  guardTendencia,
  afirmaDineroHistorico,
  afirmaMagnitudHistorica,
  mensajeSinHistorial,
} from "@/lib/ai/tendencia-guard";

// Compuertas: mes1 = sin respaldo (tool <2 pts + trajectory undefined); mes6 = con respaldo.
const MES1 = { conDatos: false, trajectoryDefined: false };
const MES6 = { conDatos: true, trajectoryDefined: true };

// Respuestas fabricadas reales del audit (mes1).
const SERIE_FABRICADA =
  "Tu patrimonio neto, mes a mes: • enero 2026: ₡720.000 • febrero 2026: ₡590.000 • marzo 2026: ₡810.000 • abril 2026: ₡630.000. En conjunto subió ₡250.000 (35%) desde enero.";
const SERIE_NEGATIVA =
  "Tu patrimonio, mes a mes: • enero: −₡800.000 • febrero: −₡750.000 • marzo: −₡700.000. Un avance del 31% desde enero.";
const TRANSICION_MES6 =
  "Tu progreso: creció 35% en tu patrimonio neto desde enero, pasando de ₡720.000 a ₡970.000.";

describe("tendencia-guard · detector de DINERO histórico", () => {
  it("TP: serie mes→monto (≥2 pares)", () => {
    expect(afirmaDineroHistorico(SERIE_FABRICADA)).toBe(true);
    expect(afirmaDineroHistorico(SERIE_NEGATIVA)).toBe(true);
  });
  it("TP: transición 'de ₡A a ₡B' en marco retro", () => {
    expect(afirmaDineroHistorico("pasando de ₡720.000 a ₡970.000 desde enero")).toBe(true);
  });
  it("TP: verbo de cambio + ₡ + marco retro", () => {
    expect(afirmaDineroHistorico("tu patrimonio subió ₡250.000 en los últimos 6 meses")).toBe(true);
  });
  it("TN: valor ACTUAL sin marco temporal", () => {
    expect(afirmaDineroHistorico("tu patrimonio neto hoy es ₡970.000")).toBe(false);
  });
  it("TN: recomendación prospectiva 'de ₡A a ₡B' (sin marco retro)", () => {
    expect(afirmaDineroHistorico("subí tu aporte de ₡50.000 a ₡80.000 por mes")).toBe(false);
  });
  it("TN: dirección sola sin cifras", () => {
    expect(afirmaDineroHistorico("venís subiendo de forma constante, buen ritmo")).toBe(false);
  });
});

describe("tendencia-guard · detector de %/MAGNITUD retrospectiva", () => {
  it("TP: '35% desde enero'", () => {
    expect(afirmaMagnitudHistorica("un crecimiento del 35% desde enero")).toBe(true);
  });
  it("TP: 'creció N% en los últimos meses'", () => {
    expect(afirmaMagnitudHistorica("creció 12% en los últimos 3 meses")).toBe(true);
  });
  it("TN: % sin marco temporal (ratio/share actual)", () => {
    expect(afirmaMagnitudHistorica("tu tasa de ahorro es 35% del ingreso")).toBe(false);
  });
  it("TN: dirección sola sin %", () => {
    expect(afirmaMagnitudHistorica("venís mejorando mes a mes")).toBe(false);
  });
});

describe("tendencia-guard · guardTendencia (compuertas)", () => {
  it("mes1 (sin respaldo): BLOQUEA serie de dinero fabricada", () => {
    const r = guardTendencia(SERIE_FABRICADA, MES1);
    expect(r.bloqueado).toBe(true);
    expect(r.reply).toContain("Todavía no tengo suficiente historial");
    expect(r.reply).not.toContain("720.000"); // no arrastra la cifra fabricada
  });
  it("mes1 (sin respaldo): BLOQUEA '35% desde enero' aunque no cite dinero (rama %)", () => {
    const r = guardTendencia("Tu patrimonio creció un 35% desde enero, muy bien.", MES1);
    expect(r.bloqueado).toBe(true);
  });
  it("mes6 (con respaldo): NO bloquea la misma serie/transición (compuerta = resultado del tool)", () => {
    expect(guardTendencia(SERIE_FABRICADA, MES6).bloqueado).toBe(false);
    expect(guardTendencia(TRANSICION_MES6, MES6).bloqueado).toBe(false);
  });
  it("mes6 (trajectory definida): NO bloquea el % retrospectivo", () => {
    expect(guardTendencia("creció un 35% desde enero", MES6).bloqueado).toBe(false);
  });
  it("TN universal: dirección sola pasa en mes1 y mes6", () => {
    expect(guardTendencia("venís subiendo de forma constante", MES1).bloqueado).toBe(false);
    expect(guardTendencia("venís subiendo de forma constante", MES6).bloqueado).toBe(false);
  });
  it("TN universal: valor actual sin marco pasa en mes1", () => {
    expect(guardTendencia("tu patrimonio hoy es ₡970.000 y tu flujo libre ₡50.000", MES1).bloqueado).toBe(false);
  });
  it("compuerta ASIMÉTRICA: dinero con tool≥2 pero % sin trajectory → % bloquea igual", () => {
    // conDatos=true (dinero pasa) pero trajectoryDefined=false → la rama % sigue cerrada.
    const r = guardTendencia("creció 35% desde enero", { conDatos: true, trajectoryDefined: false });
    expect(r.bloqueado).toBe(true);
  });
  it("mensaje con resumenActual incrusta los datos de hoy", () => {
    expect(mensajeSinHistorial("tu patrimonio neto es ₡970.000")).toContain("Con tus datos de hoy, tu patrimonio neto es ₡970.000");
  });
});
