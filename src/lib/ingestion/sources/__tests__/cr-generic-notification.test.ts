import { describe, it, expect } from "vitest";
import {
  crGenericNotificationSource,
  partyFromSubject,
} from "@/lib/ingestion/sources/cr-generic-notification";
import {
  detectBank,
  findCardLast4,
  findDate,
  findMoney,
  findReference,
  parseAmountLoose,
} from "@/lib/ingestion/sources/common";
import { parseNotification } from "@/lib/ingestion/sources";

const parse = (t: string, meta?: { from?: string; subject?: string }) =>
  crGenericNotificationSource.parse(t, meta);

// ---------------------------------------------------------------------------
// Muestras SINTÉTICAS modeladas sobre la redacción habitual de cada banco. La
// plantilla exacta se afina con muestras reales (cola: ingest_notices). Lo que
// se fija aquí es el CONTRATO: banco, tipo, monto, moneda, dirección, comercio.
// ---------------------------------------------------------------------------

const BNCR_COMPRA = `Estimado(a) cliente:
Le informamos que se realizó una compra con su tarjeta BN Débito terminada en 4471.
Comercio: WALMART ESCAZU
Monto: ₡45,300.00
Fecha: 04/09/2026 14:22
Referencia: 002314887
Banco Nacional de Costa Rica`;

const BCR_COMPRA = `Banco de Costa Rica le informa:
Se realizó una transacción con su tarjeta ****8812
Establecimiento: FARMACIA FISCHEL CURRIDABAT
Monto: CRC 12,750.00
Fecha: 03-09-2026 09:15
Autorización: 556677`;

const POPULAR_SINPE_IN = `Banco Popular le comunica que ha recibido una transferencia SINPE Móvil de MARIA JOSE SOLANO por un monto de 25,000.00 colones. Detalle: PAGO CLASES. Referencia 2026090412345678. Fecha 04/09/2026 10:31.`;

const SCOTIA_SINPE_OUT = `Scotiabank Costa Rica: usted envió una transferencia SINPE Móvil a CARLOS MORA JIMENEZ por ₡8,000.00 el 02/09/2026. Concepto: ALMUERZO. Comprobante: 99881122.`;

const PROMERICA_RETIRO = `Promerica le informa que se realizó un retiro en cajero automático con su tarjeta terminada en 3305 por un monto de USD 100.00 el 01/09/2026 a las 18:40. Lugar: ATM MULTIPLAZA ESCAZU. Referencia: 77001122.`;

const DAVIVIENDA_REVERSO = `Davivienda: se aplicó un reverso a su tarjeta ****1290 por CRC 5,500.00 correspondiente a la compra en UBER CR del 28/08/2026. Referencia 44556677.`;

const BNCR_PAGO_TARJETA = `Banco Nacional: se registró el pago de su tarjeta de crédito BN terminada en 9901 por un monto de CRC 150,000.00 el 04/09/2026. Referencia: 88990011.`;

const BCR_PROPIAS = `BCR le informa que se realizó una transferencia entre sus cuentas propias por un monto de CRC 200,000.00 el 04/09/2026. Referencia 12121212.`;

const COOPENAE_DEPOSITO = `Coopenae le informa que se acreditó un depósito en su cuenta de ahorros por ₡320.000,00 el 4 de setiembre de 2026. Origen: PLANILLA EMPRESA XYZ. Documento 5566.`;

const BCR_RECHAZADA = `Banco de Costa Rica: su compra en TIENDA ONLINE por CRC 30,000.00 fue rechazada. Fecha 04/09/2026.`;

const NO_BANCO = `Hola, te comparto el recibo de la luz por CRC 30,000.00 de este mes. Saludos.`;

describe("Genérica CR · identificación del banco", () => {
  it("por dominio del remitente aunque el cuerpo no lo mencione", () => {
    expect(detectBank("Compra por CRC 100.00", { from: "alertas@bncr.fi.cr" })?.code).toBe("BNCR");
    expect(detectBank("", { from: "notificaciones@bancobcr.com" })?.code).toBe("BCR");
    expect(detectBank("", { from: "no-reply@bancopopular.fi.cr" })?.code).toBe("POPULAR");
  });
  it("por marca en el texto o el asunto", () => {
    expect(detectBank(BNCR_COMPRA)?.code).toBe("BNCR");
    expect(detectBank(BCR_COMPRA)?.code).toBe("BCR");
    expect(detectBank(SCOTIA_SINPE_OUT)?.code).toBe("SCOTIA");
    expect(detectBank("", { subject: "Alerta Promerica" })?.code).toBe("PROMERICA");
  });
  it("sin banco → null y el parser devuelve []", () => {
    expect(detectBank(NO_BANCO)).toBeNull();
    expect(parse(NO_BANCO)).toEqual([]);
  });
});

describe("Genérica CR · compras con tarjeta", () => {
  it("BNCR: gasto, colones con ₡, comercio por etiqueta, fecha, referencia, último-4", () => {
    const [m] = parse(BNCR_COMPRA);
    expect(m).toBeDefined();
    expect(m!.bankCode).toBe("BNCR");
    expect(m!.kind).toBe("gasto");
    expect(m!.amount).toBe(45300);
    expect(m!.currency).toBe("CRC");
    expect(m!.merchant).toBe("WALMART ESCAZU");
    expect(m!.occurredOn).toBe("2026-09-04");
    expect(m!.externalRef).toBe("002314887");
    expect(m!.cardLast4).toBe("4471");
    expect(m!.confidence).toBeGreaterThanOrEqual(0.7);
    expect(m!.confidence).toBeLessThanOrEqual(0.85);
  });
  it("BCR: establecimiento, CRC explícito, fecha con guiones, autorización, ****8812", () => {
    const [m] = parse(BCR_COMPRA);
    expect(m!.bankCode).toBe("BCR");
    expect(m!.kind).toBe("gasto");
    expect(m!.amount).toBe(12750);
    expect(m!.merchant).toBe("FARMACIA FISCHEL CURRIDABAT");
    expect(m!.occurredOn).toBe("2026-09-03");
    expect(m!.externalRef).toBe("556677");
    expect(m!.cardLast4).toBe("8812");
  });
});

describe("Genérica CR · SINPE Móvil", () => {
  it("recibido (Popular): ingreso, contraparte, monto en colones en palabras", () => {
    const [m] = parse(POPULAR_SINPE_IN);
    expect(m!.bankCode).toBe("POPULAR");
    expect(m!.kind).toBe("ingreso");
    expect(m!.amount).toBe(25000);
    expect(m!.currency).toBe("CRC");
    expect(m!.merchant).toBe("PAGO CLASES");
    expect(m!.occurredOn).toBe("2026-09-04");
    expect(m!.externalRef).toBe("2026090412345678");
  });
  it("enviado (Scotiabank): gasto, concepto por etiqueta, ₡ con coma de miles", () => {
    const [m] = parse(SCOTIA_SINPE_OUT);
    expect(m!.bankCode).toBe("SCOTIA");
    expect(m!.kind).toBe("gasto");
    expect(m!.amount).toBe(8000);
    expect(m!.merchant).toBe("ALMUERZO");
    expect(m!.occurredOn).toBe("2026-09-02");
    expect(m!.externalRef).toBe("99881122");
  });
});

describe("Genérica CR · otros avisos", () => {
  it("retiro en cajero (Promerica): gasto en USD, lugar, último-4", () => {
    const [m] = parse(PROMERICA_RETIRO);
    expect(m!.bankCode).toBe("PROMERICA");
    expect(m!.kind).toBe("gasto");
    expect(m!.currency).toBe("USD");
    expect(m!.amount).toBe(100);
    expect(m!.merchant).toBe("ATM MULTIPLAZA ESCAZU");
    expect(m!.cardLast4).toBe("3305");
    expect(m!.occurredOn).toBe("2026-09-01");
  });
  it("reverso (Davivienda): ingreso marcado [Reverso], confianza baja", () => {
    const [m] = parse(DAVIVIENDA_REVERSO);
    expect(m!.bankCode).toBe("DAVIVIENDA");
    expect(m!.kind).toBe("ingreso");
    expect(m!.amount).toBe(5500);
    expect(m!.description.startsWith("[Reverso]")).toBe(true);
    expect(m!.confidence).toBeLessThan(0.8);
  });
  it("pago de tarjeta (BNCR): gasto marcado [Pago de tarjeta], confianza baja", () => {
    const [m] = parse(BNCR_PAGO_TARJETA);
    expect(m!.kind).toBe("gasto");
    expect(m!.amount).toBe(150000);
    expect(m!.description.startsWith("[Pago de tarjeta]")).toBe(true);
    expect(m!.confidence).toBeLessThanOrEqual(0.6);
  });
  it("entre cuentas propias (BCR): marcado, confianza baja", () => {
    const [m] = parse(BCR_PROPIAS);
    expect(m!.amount).toBe(200000);
    expect(m!.description.startsWith("[Entre cuentas propias]")).toBe(true);
    expect(m!.confidence).toBeLessThanOrEqual(0.6);
  });
  it("depósito (Coopenae): ingreso, formato europeo 320.000,00, fecha en letras, origen", () => {
    const [m] = parse(COOPENAE_DEPOSITO);
    expect(m!.bankCode).toBe("COOPENAE");
    expect(m!.kind).toBe("ingreso");
    expect(m!.amount).toBe(320000);
    expect(m!.currency).toBe("CRC");
    expect(m!.occurredOn).toBe("2026-09-04");
    expect(m!.merchant).toBe("PLANILLA EMPRESA XYZ");
  });
  it("rechazada: no propone nada", () => {
    expect(parse(BCR_RECHAZADA)).toEqual([]);
  });
});

describe("Genérica CR · asunto como respaldo", () => {
  it("comercio desde el asunto 'Notificación de transacción X DD-MM-YYYY - HH:MM'", () => {
    expect(partyFromSubject("Notificación de transacción CINEPOLIS WEB 03-09-2026 - 08:04")).toBe(
      "CINEPOLIS WEB",
    );
    expect(
      partyFromSubject("Notificación de transacción LA CASONA DE LALY SANT 02-09-2026 - 12:58"),
    ).toBe("LA CASONA DE LALY SANT");
    expect(partyFromSubject("Bienvenido a BN Internet Banking")).toBeNull();
  });
  it("cuerpo pobre + asunto rico: usa asunto para comercio y fecha", () => {
    const [m] = parse("Banco Nacional le informa. Monto: CRC 6,900.00", {
      subject: "Notificación de transacción HELADOS MOYO 27-06-2026 - 18:55",
    });
    expect(m!.merchant).toBe("HELADOS MOYO");
    expect(m!.occurredOn).toBe("2026-06-27");
    expect(m!.amount).toBe(6900);
  });
});

describe("Router · BAC primero, genérica después", () => {
  it("un correo BAC sigue saliendo por la plantilla BAC (confianza alta)", () => {
    const bac = `Hola, BAC Credomatic le informa. A continuación le detallamos la transacción realizada:
Comercio: AUTO MERCADO  Fecha: Sep 4, 2026, 10:00  MASTER ***2062  Tipo de Transacción: COMPRA  Monto: CRC 11,490.00  Referencia: 123456`;
    const [m] = parseNotification(bac, { from: "notificacionbac@baccredomatic.cr" });
    expect(m!.bankCode).toBe("BAC");
    expect(m!.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it("BAC con cuerpo pobre: el fallback BAC usa el asunto para comercio y fecha", () => {
    const [m] = parseNotification("BAC le informa. Monto: CRC 3,200.00", {
      from: "notificacionbac@baccredomatic.cr",
      subject: "Notificación de transacción SEGURO PRF PLAN A 03-09-2026 - 00:00",
    });
    expect(m!.bankCode).toBe("BAC");
    expect(m!.merchant).toBe("SEGURO PRF PLAN A");
    expect(m!.occurredOn).toBe("2026-09-03");
    expect(m!.amount).toBe(3200);
  });
  it("un correo BNCR cae en la genérica", () => {
    const [m] = parseNotification(BNCR_COMPRA, { from: "alertas@bncr.fi.cr" });
    expect(m!.bankCode).toBe("BNCR");
  });
  it("un correo sin banco no produce movimiento (queda para ingest_notices)", () => {
    expect(parseNotification(NO_BANCO, { from: "amigo@gmail.com" })).toEqual([]);
  });
});

describe("common · helpers", () => {
  it("parseAmountLoose entiende ambos separadores", () => {
    expect(parseAmountLoose("5,000.00")).toBe(5000);
    expect(parseAmountLoose("5.000,00")).toBe(5000);
    expect(parseAmountLoose("1,500")).toBe(1500);
    expect(parseAmountLoose("19.99")).toBe(19.99);
    expect(parseAmountLoose("320.000,5")).toBe(320000.5);
    expect(parseAmountLoose("abc")).toBeNull();
  });
  it("findMoney: moneda antes o después, símbolo o palabra", () => {
    expect(findMoney("Monto: ₡45,300.00")).toEqual({ amount: 45300, currency: "CRC" });
    expect(findMoney("por 25,000.00 colones")).toEqual({ amount: 25000, currency: "CRC" });
    expect(findMoney("USD 19.99")).toEqual({ amount: 19.99, currency: "USD" });
    expect(findMoney("$ 12.50 dolares")).toEqual({ amount: 12.5, currency: "USD" });
    expect(findMoney("sin plata")).toBeNull();
  });
  it("findDate: tica, ISO, en letras, inglés", () => {
    expect(findDate("el 04/09/2026 a las 10:00")).toBe("2026-09-04");
    expect(findDate("2026-09-04T10:00")).toBe("2026-09-04");
    expect(findDate("4 de setiembre de 2026")).toBe("2026-09-04");
    expect(findDate("Sep 4, 2026, 10:00")).toBe("2026-09-04");
    expect(findDate("03-09-2026 - 08:04")).toBe("2026-09-03");
    expect(findDate("sin fecha")).toBeNull();
  });
  it("findReference y findCardLast4", () => {
    expect(findReference("Referencia: 35689751 Tipo")).toBe("35689751");
    expect(findReference("No. de comprobante 99881122")).toBe("99881122");
    expect(findReference("Tipo de Transacción: COMPRA")).toBeNull();
    expect(findCardLast4("MASTER ************2062")).toBe("2062");
    expect(findCardLast4("tarjeta terminada en 4471")).toBe("4471");
    expect(findCardLast4("XXXX-8812")).toBe("8812");
  });
});
