import { describe, it, expect } from "vitest";
import { bacNotificationSource } from "@/lib/ingestion/sources/bac-notification";
import { parseNotification } from "@/lib/ingestion/sources";

const parse = (t: string) => bacNotificationSource.parse(t);

const CARD_CRC = `Hola GUILLERMO, BAC Credomatic le informa.
A continuación le detallamos la transacción realizada:
Comercio: AUTO MERCADO SANTA ANA  Ciudad y país: SAN JOSE, Costa Rica
Fecha: Jun 11, 2026, 20:31  MASTER ***2062  Autorización: 425613
Referencia: 35689751  Tipo de Transacción: COMPRA  Monto: CRC 11,490.00`;

const CARD_USD = `Hola GUILLERMO, le detallamos la transacción realizada:
Comercio: Adobe  Ciudad y país: SAN JOSE, Costa Rica
Fecha: Jun 26, 2026, 08:59  VISA ***1234  Autorización: 998877
Referencia: 617771175951  Tipo de Transacción: COMPRA  Monto: USD 19.99`;

const SINPE_IN_DIVISA = `BAC Credomatic le comunica que recibió una transferencia SINPE con el número de referencia 20260602409220100228588 39 a su cuenta IBAN CR7701XXXX5963 por un monto de 5,000.00 Dólares por concepto ARI-PAGO-CAMBIO DE DIVISA, la cual se aplicó correctamente el día 2/6/2026 a las 8:42 AM.`;

const SINPE_IN_NORMAL = `BAC Credomatic le comunica que recibió una transferencia SINPE con el número de referencia 20260601123456789 a su cuenta IBAN CR7701XXXX5963 por un monto de 500.00 Dólares por concepto ABONO COCINA Y HORNO 17179402, la cual se aplicó correctamente el día 1/6/2026 a las 6:44 PM.`;

const SINPE_OUT = `BAC le comunica que la transferencia SINPE con el número de referencia 2026062210099887766 se aplicó con éxito en el ciclo del día 22/06/2026, debitando su cuenta IBAN CR7701XXXX5963 un monto de 97.00 Dolares, por concepto de Pago del Mentores Retreat. Día y hora 22/06/2026 09:54:46 p.m.`;

// Caso real de correo: etiqueta y valor en LÍNEAS SEPARADAS (no inline).
const CARD_EMAIL_MOYO = `Comercio:
HELADOS MOYO
Ciudad y país:
SAN JOSE, Costa Rica
Fecha:
Jun 27, 2026, 18:55
MASTER
************2062
Tipo de Transacción:
COMPRA
Referencia:
617800725966
Monto:
CRC 6,900.00`;

describe("BAC · compra por correo (layout en líneas separadas)", () => {
  it("HELADOS MOYO: gasto, monto, fecha, comercio, referencia, último-4", () => {
    const [m] = parse(CARD_EMAIL_MOYO);
    expect(m).toBeDefined();
    expect(m!.kind).toBe("gasto");
    expect(m!.currency).toBe("CRC");
    expect(m!.amount).toBe(6900);
    expect(m!.occurredOn).toBe("2026-06-27");
    expect(m!.merchant).toBe("HELADOS MOYO");
    expect(m!.externalRef).toBe("617800725966");
    expect(m!.cardLast4).toBe("2062");
    expect(m!.confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe("BAC · plantilla 1 (compra con tarjeta)", () => {
  it("CRC: gasto, monto, fecha, comercio, referencia", () => {
    const [m] = parse(CARD_CRC);
    expect(m).toBeDefined();
    expect(m!.kind).toBe("gasto");
    expect(m!.currency).toBe("CRC");
    expect(m!.amount).toBe(11490);
    expect(m!.occurredOn).toBe("2026-06-11");
    expect(m!.merchant).toBe("AUTO MERCADO SANTA ANA");
    expect(m!.externalRef).toBe("35689751");
    expect(m!.confidence).toBe(0.95);
    expect(m!.bankCode).toBe("BAC");
    expect(m!.sourceKind).toBe("whatsapp_notification");
  });

  it("USD: gasto, monto decimal, referencia larga", () => {
    const [m] = parse(CARD_USD);
    expect(m!.kind).toBe("gasto");
    expect(m!.currency).toBe("USD");
    expect(m!.amount).toBe(19.99);
    expect(m!.occurredOn).toBe("2026-06-26");
    expect(m!.merchant).toBe("Adobe");
    expect(m!.externalRef).toBe("617771175951");
  });
});

describe("BAC · plantilla 2 (SINPE recibido)", () => {
  it("USD con CAMBIO DE DIVISA → ingreso, confianza 0.6, prefijo en description", () => {
    const [m] = parse(SINPE_IN_DIVISA);
    expect(m!.kind).toBe("ingreso");
    expect(m!.currency).toBe("USD");
    expect(m!.amount).toBe(5000);
    expect(m!.occurredOn).toBe("2026-06-02");
    expect(m!.confidence).toBe(0.6);
    expect(m!.description.startsWith("[Cambio de divisa] ")).toBe(true);
    expect(m!.description).toContain("CAMBIO DE DIVISA");
  });

  it("USD concepto normal → ingreso, merchant = concepto, confianza 0.9", () => {
    const [m] = parse(SINPE_IN_NORMAL);
    expect(m!.kind).toBe("ingreso");
    expect(m!.currency).toBe("USD");
    expect(m!.amount).toBe(500);
    expect(m!.occurredOn).toBe("2026-06-01");
    expect(m!.merchant).toBe("ABONO COCINA Y HORNO 17179402");
    expect(m!.confidence).toBe(0.9);
  });
});

describe("BAC · plantilla 3 (SINPE debitado)", () => {
  it("USD → gasto, monto, fecha del ciclo", () => {
    const [m] = parse(SINPE_OUT);
    expect(m!.kind).toBe("gasto");
    expect(m!.currency).toBe("USD");
    expect(m!.amount).toBe(97);
    expect(m!.occurredOn).toBe("2026-06-22");
    expect(m!.confidence).toBe(0.9);
  });
});

describe("BAC · no-notificación y registro", () => {
  it("texto de consulta → [] (no interfiere con la IA de texto)", () => {
    expect(parse("¿cuánto gasté este mes?")).toEqual([]);
    expect(parseNotification("¿cuánto gasté este mes?")).toEqual([]);
  });

  it("parseNotification enruta a BAC y devuelve el movimiento", () => {
    const movs = parseNotification(CARD_CRC);
    expect(movs).toHaveLength(1);
    expect(movs[0]!.amount).toBe(11490);
  });
});
