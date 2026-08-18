/**
 * UNA SOLA TARJETA EDITABLE para el chat y para el recibo.
 *
 * La del chat era de solo-lectura: mostraba el sobre y nada más. Monto, fecha y comercio se
 * registraban tal como los hubiera entendido el parseo, y una fecha mal leída mandaba el gasto a
 * otro mes sin forma de corregirlo antes de escribir.
 *
 * Se prueba el BORRADOR (`draftFromAction`), que es lo que la tarjeta pinta y lo que
 * `aPayloadRecibo` registra: si el borrador trae los cuatro campos y el payload sale de él, la
 * tarjeta editable del recibo sirve igual para el chat.
 */
import { describe, it, expect } from "vitest";
import {
  draftFromAction,
  draftFromExtract,
  aPayloadRecibo,
  necesitaConfirmarMoneda,
  avisoFecha,
} from "@/lib/ai/receipt-draft";
import type { AIActionProposal } from "@/lib/ai/types";

const HOY = "2026-08-18";
const SOBRE = "11111111-1111-1111-1111-111111111111";

const propuesta: AIActionProposal = {
  type: "create_transaction",
  payload: {
    kind: "gasto",
    description: "transporte de vehículo",
    amount: 37747,
    currency: "USD",
    occurredOn: "2026-08-02",
    categoryId: SOBRE,
    categoryPath: "Transporte › Transporte de vehículo",
  },
  summary: "Gasto transporte de vehículo",
};

describe("draftFromAction · la propuesta del chat entra a la tarjeta editable", () => {
  const d = draftFromAction(propuesta, { hoy: HOY, captureCurrency: "USD" });

  it("los cuatro campos editables llegan cargados", () => {
    expect(d.description).toBe("transporte de vehículo");
    expect(d.amountText).toBe("37747");
    expect(d.occurredOn).toBe("2026-08-02");
    expect(d.currency).toBe("USD");
  });

  it("el sobre sugerido viaja para preseleccionarlo", () => {
    expect(d.categoryId).toBe(SOBRE);
    expect(d.categoryPath).toBe("Transporte › Transporte de vehículo");
  });

  it("la moneda del chat es la de captura: no hay nada que confirmar", () => {
    expect(d.currencyOrigin).toBe("usuario");
    expect(necesitaConfirmarMoneda(d)).toBe(false);
  });

  it("se registra EXACTAMENTE lo que quedó en la tarjeta", () => {
    const editado = { ...d, amountText: "40000", occurredOn: "2026-08-05", description: "Uber" };
    expect(aPayloadRecibo(editado)).toMatchObject({
      kind: "gasto",
      amount: 40000,
      occurredOn: "2026-08-05",
      description: "Uber",
      currency: "USD",
      categoryId: SOBRE,
      source: "chat",
    });
  });

  it("el vínculo propuesto viaja completo, o no viaja", () => {
    const conVinculo = draftFromAction(
      {
        ...propuesta,
        payload: { ...propuesta.payload, linkedKind: "debt", linkedId: SOBRE, linkedName: "BAC" },
      },
      { hoy: HOY, captureCurrency: "USD" },
    );
    expect(aPayloadRecibo(conVinculo)).toMatchObject({ linkedKind: "debt", linkedId: SOBRE });
    // Sin linkedId el vínculo no sale: `transactionInputSchema` lo rechazaría.
    expect(aPayloadRecibo(draftFromAction(propuesta, { hoy: HOY, captureCurrency: "USD" }))).not.toHaveProperty(
      "linkedKind",
    );
  });
});

describe("draftFromAction · la fecha que el usuario dijo y no se entendió", () => {
  const d = draftFromAction(
    {
      type: "create_transaction",
      payload: {
        kind: "gasto",
        description: "súper",
        amount: 5000,
        currency: "USD",
        occurredOn: HOY,
        dateText: "el 31 de febrero",
      },
    },
    { hoy: HOY, captureCurrency: "USD" },
  );

  it("la tarjeta lo avisa con la frase del usuario, no con un ISO que él nunca escribió", () => {
    expect(d.dateFlag).toBe("no-entendida");
    expect(d.dateRead).toBe("el 31 de febrero");
    const aviso = avisoFecha(d.occurredOn, HOY, { flag: d.dateFlag, leida: d.dateRead });
    expect(aviso?.texto).toContain("el 31 de febrero");
    expect(aviso?.texto).toMatch(/no entend[ií]/i);
  });
});

describe("el recibo escaneado sigue funcionando igual", () => {
  it("nace como gasto de origen recibo, con la moneda a confirmar", () => {
    const d = draftFromExtract(
      { amount: 4100, date: "2026-08-10", merchant: "Auto Mercado", currency: null },
      { hoy: HOY, primaryCurrency: "USD", timezone: "America/Costa_Rica" },
    );
    expect(d.kind).toBe("gasto");
    expect(d.source).toBe("receipt");
    expect(d.currency).toBe("CRC");
    expect(necesitaConfirmarMoneda(d)).toBe(true);
    expect(aPayloadRecibo(d)).toMatchObject({ source: "receipt", kind: "gasto" });
  });
});
