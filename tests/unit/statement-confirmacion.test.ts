/**
 * "dale, registralas" después de la tabla de conciliación.
 *
 * El bug: ese turno no traía bloque, así que no matcheaba ningún carril determinista y lo atendía
 * el LLM — que escribía los create_transaction a mano, con montos convertidos (₡9.200 → $20) y
 * dumpeados como texto crudo. Acá se prueba que ahora lo atiende el carril determinista y que las
 * altas salen con el monto y la MONEDA ORIGINAL.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const BLOQUE = `246276  2026-07-17  CAFE SIMONETA  9,200.00  COL  D
246277  2026-07-18  STARBUCKS  12,000.00  COL  D
246281  2026-07-20  POPS  1,500.00  COL  D`;

// El hilo del chat: el usuario pegó el bloque, el asesor contestó la tabla, y ahora confirma.
const HILO = [
  { id: "m1", role: "user" as const, content: BLOQUE, createdAt: "2026-08-01T10:00:00Z", replyToId: null },
  { id: "m2", role: "assistant" as const, content: "De 3 movimientos, 0 ya están y 3 faltan.", createdAt: "2026-08-01T10:00:01Z", replyToId: null },
];

vi.mock("@/lib/ai/chat-store", () => ({ loadRetainedChat: async () => HILO }));
vi.mock("@/modules/financial-base", () => ({
  listTransactions: async () => [], // ninguna registrada: las tres faltan
  suggestSobreForChat: async () => ({ categoryId: null, categoryPath: "Vivir › Restaurantes" }),
}));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({ USD: 1, CRC: 500 }) }));

import { resolverConfirmacionDeAlta } from "@/lib/ai/statement-service";
import { pareceConfirmacionDeAlta } from "@/lib/ai/statement-parse";
import { matchIntent } from "@/lib/ai/router";

describe("pareceConfirmacionDeAlta · qué cuenta como confirmar", () => {
  it("las formas naturales de decir que sí", () => {
    for (const f of [
      "dale, registralas",
      "sí, agregá las que faltan",
      "registrá todas",
      "dale",
      "ok",
      "confirmá todas",
      "agregalas",
      "sí",
    ]) {
      expect(pareceConfirmacionDeAlta(f), f).toBe(true);
    }
  });

  it("REGRESIÓN: una orden con CIFRAS no es una confirmación", () => {
    // Estos cuatro los cazó la suite: el detector, más goloso, le robaba el turno al alta de
    // gastos y a los datos de mercado. Una confirmación no trae datos nuevos.
    for (const f of [
      "registrá un gasto de 5000 en super",
      "vender todos los altcoins a 90% de su ATH",
      "si vendo todas mis inversiones al ATH",
      "anotá 3900 en restaurantes",
    ]) {
      expect(pareceConfirmacionDeAlta(f), f).toBe(false);
    }
  });

  it("REGRESIÓN: «registrá un gasto…» sigue yendo a su carril, no acá", () => {
    expect(matchIntent("registrá un gasto de 5000 en super")?.intent).not.toBe(
      "confirmar_alta_estado",
    );
  });

  it("una pregunta o un párrafo NO son una confirmación", () => {
    for (const f of [
      "¿cuánto gasté el mes pasado en restaurantes?",
      "dame las transacciones de transporte de julio",
      "me parece bien la idea pero antes quiero entender cómo funciona el fondo de emergencia y qué pasa si lo uso",
    ]) {
      expect(pareceConfirmacionDeAlta(f), f).toBe(false);
    }
  });
});

describe("ruteo · la confirmación NO cae al LLM", () => {
  it("«dale, registralas» rutea al carril determinista", () => {
    expect(matchIntent("dale, registralas")?.intent).toBe("confirmar_alta_estado");
  });

  it("el bloque pegado sigue ruteando a conciliación", () => {
    expect(matchIntent(BLOQUE)?.intent).toBe("conciliar_estado");
  });
});

describe("resolverConfirmacionDeAlta · datos REALES del parseo", () => {
  it("arma el lote con las TRES faltantes, ninguna dropeada", async () => {
    const r = await resolverConfirmacionDeAlta("USD");
    const rows = r?.action?.payload.rows as { description: string }[];
    expect(r?.action?.type).toBe("create_transactions_batch");
    expect(rows).toHaveLength(3);
    expect(rows.map((x) => x.description)).toEqual(["CAFE SIMONETA", "STARBUCKS", "POPS"]);
  });

  it("MONEDA Y MONTO ORIGINALES, aunque el display sea USD (el bug: ₡9.200 → $20)", async () => {
    const r = await resolverConfirmacionDeAlta("USD");
    const rows = r?.action?.payload.rows as { amount: number; currency: string }[];
    expect(rows[0]).toMatchObject({ amount: 9200, currency: "CRC" });
    expect(rows[1]).toMatchObject({ amount: 12000, currency: "CRC" });
    expect(rows[2]).toMatchObject({ amount: 1500, currency: "CRC" });
    // Ni un solo monto convertido.
    expect(rows.every((x) => x.currency === "CRC")).toBe(true);
  });

  it("la fecha de cada alta es la del estado", async () => {
    const r = await resolverConfirmacionDeAlta("USD");
    const rows = r?.action?.payload.rows as { occurredOn: string }[];
    expect(rows.map((x) => x.occurredOn)).toEqual(["2026-07-17", "2026-07-18", "2026-07-20"]);
  });

  it("la respuesta es UNA línea limpia, sin bloques crudos", async () => {
    const r = await resolverConfirmacionDeAlta("USD");
    expect(r?.resumen_md).not.toContain("```");
    expect(r?.resumen_md).not.toContain("create_transaction");
    expect(r?.resumen_md).toMatch(/3 movimientos/);
  });
});
