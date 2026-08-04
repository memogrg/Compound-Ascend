/**
 * parseAction con VARIOS bloques.
 *
 * El bug real: `ACTION_RE` no era global, así que de cuatro ```action``` se tomaba uno y los otros
 * tres se RENDERIZABAN CRUDOS en el chat — JSON a la vista del usuario — y sus acciones se perdían.
 */
import { describe, it, expect } from "vitest";
import { parseAction } from "@/lib/ai/types";

const bloque = (json: string) => `\`\`\`action\n${json}\n\`\`\``;
const txn = (desc: string, amount: number, currency = "CRC") =>
  bloque(
    `{"type":"create_transaction","payload":{"kind":"gasto","description":"${desc}","amount":${amount},"currency":"${currency}","occurredOn":"2026-07-17"}}`,
  );

describe("ningún bloque llega crudo a la pantalla", () => {
  it("cuatro bloques: el texto queda limpio de los CUATRO", () => {
    const out = parseAction(
      `Registro estas:\n${txn("CAFE SIMONETA", 9200)}\n${txn("STARBUCKS", 12000)}\n${txn("POPS", 1500)}\n${txn("SUBWAY", 3900)}`,
    );
    expect(out.reply).not.toContain("```");
    expect(out.reply).not.toContain("create_transaction");
    expect(out.reply).toBe("Registro estas:");
  });

  it("un bloque con JSON ROTO también se strippea (no se muestra crudo)", () => {
    const out = parseAction(`Mirá:\n${bloque("{esto no es json")}`);
    expect(out.reply).toBe("Mirá:");
    expect(out.reply).not.toContain("```");
    expect(out.action).toBeNull();
  });

  it("uno válido y uno roto: se limpia todo y sobrevive el válido", () => {
    const out = parseAction(`Va:\n${bloque("{roto")}\n${txn("SUBWAY", 3900)}`);
    expect(out.reply).toBe("Va:");
    expect(out.action?.type).toBe("create_transaction");
  });
});

describe("varias transacciones se fusionan en UN lote", () => {
  it("cuatro create_transaction → create_transactions_batch con las cuatro", () => {
    const out = parseAction(
      `${txn("CAFE SIMONETA", 9200)}\n${txn("STARBUCKS", 12000)}\n${txn("POPS", 1500)}\n${txn("SUBWAY", 3900)}`,
    );
    expect(out.action?.type).toBe("create_transactions_batch");
    const rows = out.action?.payload.rows as { description: string; amount: number }[];
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.description)).toEqual([
      "CAFE SIMONETA",
      "STARBUCKS",
      "POPS",
      "SUBWAY",
    ]);
  });

  it("NINGUNA se dropea, y conservan su moneda y su monto", () => {
    const out = parseAction(`${txn("CAFE SIMONETA", 9200)}\n${txn("AMAZON", 25, "USD")}`);
    const rows = out.action?.payload.rows as { amount: number; currency: string }[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ amount: 9200, currency: "CRC" });
    expect(rows[1]).toMatchObject({ amount: 25, currency: "USD" });
  });

  it("una sola transacción NO se convierte en lote", () => {
    expect(parseAction(txn("SUBWAY", 3900)).action?.type).toBe("create_transaction");
  });
});

describe("compatibilidad con lo de antes", () => {
  it("sin bloques, el texto pasa igual", () => {
    expect(parseAction("Hola, ¿en qué te ayudo?")).toEqual({
      reply: "Hola, ¿en qué te ayudo?",
      action: null,
    });
  });

  it("un tipo inventado se descarta pero el texto sale limpio", () => {
    const out = parseAction(`Va:\n${bloque('{"type":"transferir","payload":{}}')}`);
    expect(out.reply).toBe("Va:");
    expect(out.action).toBeNull();
  });

  it("tipos MEZCLADOS: se queda uno, pero el texto igual sale limpio de todos", () => {
    const out = parseAction(
      `${txn("SUBWAY", 3900)}\n${bloque('{"type":"create_goal","payload":{"name":"Viaje"}}')}`,
    );
    expect(out.reply).not.toContain("```");
    expect(out.action?.type).toBe("create_transaction");
  });
});
