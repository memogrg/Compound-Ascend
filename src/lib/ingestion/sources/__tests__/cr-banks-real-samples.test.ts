import { describe, it, expect } from "vitest";
import { parseNotification } from "@/lib/ingestion/sources";
import { bcrNotificationSource } from "@/lib/ingestion/sources/bcr-notification";
import { bnNotificationSource } from "@/lib/ingestion/sources/bn-notification";
import { daviviendaNotificationSource } from "@/lib/ingestion/sources/davivienda-notification";
import { promericaNotificationSource } from "@/lib/ingestion/sources/promerica-notification";
import { bacNotificationSource } from "@/lib/ingestion/sources/bac-notification";

// ---------------------------------------------------------------------------
// Muestras REALES (transcritas de correos de sep 2026) tal como quedan tras
// mailparser/stripHtml: una línea por fila de tabla, celdas separadas por
// espacios. Cada bloque fija el contrato exacto de ese banco.
// ---------------------------------------------------------------------------

const BAC_COMPRA = `Hola ANDREA QUESADA PANIAGUA
A continuación le detallamos la transacción realizada:
Comercio: MINISUPER MONTES DE OC
Ciudad y país: SAN JOSE, Costa Rica
Fecha: Sep 4, 2026 , 12:20
VISA: ************2810
Autorización: 155016
Referencia: 624718155016
Tipo de Transacción: COMPRA
Monto: CRC 4,350.00
DECÍ QUE SÍ A ELEGIR TU BIENESTAR`;

const BAC_SINPE_ACREDITANDO = `Notificación de Transferencia SINPE
Hola ANDREA QUESADA PANIAGUA :
BAC le comunica que recibió una transferencia SINPE con el número de referencia 2026090215131020010003020, el día 02/09/2026 a las 06:54:00 p.m. horas, acreditando la cuenta IBAN CR8601XXXXXXXXXXXX5917 un monto de 60,000.00 Colones, por concepto de Pago Factura 282875.
Muchas gracias.
Notas Importantes:
La información mostrada en este comprobante no constituye un documento con validez legal.`;

const BCR_CARD = `Transacciones en su tarjeta BCR: ****-****-****-5269
Estimado (a) cliente:
Le informamos la siguiente transacción realizada con su tarjeta BCR :
Información Adicional
Si aún no es usuario de la página web transaccional le invitamos a hacerlo a través de formulario digital ubicado en nuestro sitio web y el App BCR Móvil.
Detalle de Transacciones
Fecha Autorización No.Referencia Monto Moneda Comercio Estado
03/09/2026 07:34:40 00704612 624613517122 19,800.00 COLON COSTA RICA HOSPITAL CLINICA BIBLICA SAN JOSE CR Aprobada
En caso de dudas respecto a las transacciones notificadas, escribir al WhatsApp 2211-1135 y utilice las opciones disponibles.`;

const BCR_CARD_2 = `Transacciones en su tarjeta BCR: ****-****-****-2585
Estimado (a) cliente:
Le informamos la siguiente transacción realizada con su tarjeta BCR :
Detalle de Transacciones
Fecha Autorización No.Referencia Monto Moneda Comercio Estado
18/06/2026 17:32:43 00495357 616923791787 32,279.95 COLON COSTA RICA ONVO Pizza Hut CR 0000 CR Aprobada`;

const BCR_CARD_RECHAZADA = BCR_CARD_2.replace("Aprobada", "Rechazada");

const BCR_TRANSFER = `Informe de transferencia entre cuentas BCR
Hola, QUESADA PANIAGUA ANDREA. El BCR le informa que ha realizado la siguiente transacción en la aplicación BCR Móvil:
Transferencia entre cuentas BCR
Fecha 02/09/2026 03:37 p. m.
Documento 15370938
Cuenta origen CR33015202001411688521 QUESADA PANIAGUA ANDREA
Cuenta destino CR49015202001073796687 CASCANTE GOMEZ HELLEN MELISA
Monto debitado ₡137.400,00
Monto transferido $300,00
Motivo Abono Guate Nov 4A 1N 1Bb
Para más información o en caso de no haber realizado esta gestión, comuníquese con nuestro Centro de Asistencia al Cliente.`;

const BCR_TRANSFER_PROPIA = BCR_TRANSFER.replace(
  "CR49015202001073796687 CASCANTE GOMEZ HELLEN MELISA",
  "CR49015202001073796687 QUESADA PANIAGUA ANDREA",
)
  .replace("Monto debitado ₡137.400,00\n", "")
  .replace("Monto transferido $300,00", "Monto debitado ₡50.000,00\nMonto transferido ₡50.000,00");

const BN_COMPRA = `Estimado señor(a): GUZMAN CUBERO LUCRECIA
Reciba un cordial saludo de parte del Banco Nacional.
Por este medio le hacemos llegar el comprobante de Compra realizada en FERRETERIA EPA SA SAN JOSE CRI el 23 de Junio de 2026 a las 8:08 p.m.
FERRETERIA EPA SA SAN JOSE CRI
Jun 23, 2026 - 8:08 p.m.
MASTERCARD ************2308
NRO. AUT: 235452
REF: 43695055
TOTAL: CRC 27939,00
Estimado cliente, esta notificación es generada de forma automática de acuerdo con lo establecido por el Banco Central de Costa Rica, en su Reglamento del Sistema de Tarjetas de Pago, por lo que agradecemos no responder este correo.`;

const BN_UBER = `Estimado señor(a): GUZMAN CUBERO LUCRECIA
Reciba un cordial saludo de parte del Banco Nacional.
Por este medio le hacemos llegar el comprobante de Compra realizada en UBER *TRIP HELP.UBER.COM el 24 de Junio de 2026 a las 6:36 p.m.
Nota Importante: La siguiente transacción no es en tiempo real, en caso de requerir más información por favor comunicarse con nuestro CENTRO ESPECIALIZADO DE TARJETAS, al teléfono 2207-8600 opción 1-1.
UBER *TRIP HELP.UBER.COM
Jun 24, 2026 - 6:36 p.m.
MASTERCARD ************2308
NRO. AUT: 250104
REF: MDWK596UF
TOTAL: CRC 441,60`;

const DAVI_UBER_EATS = `Estimado cliente,
DAVIbank le notifica que la transacción realizada en DLC*UBER EATS San Jose Costa Rica, el día 27/03/2026 a las 12:39 PM con su tarjeta de crédito titular MC terminada en 0849 con número de autorización 914190 y referencia 24716523 por CRC 12,444.00, fue aprobada. La compra se facturará en dólares estadounidenses(USD) si la transacción se realiza en el extranjero o el comercio tiene su domicilio fuera del país, incluso si el cobro se efectuó en la moneda local del país de origen.
Si tiene alguna duda, consulta o detecta movimientos sospechosos por favor llamar de inmediato a nuestro Contact Center al 8001-726842
Gracias por preferirnos.
DAVIbank (Costa Rica) S.A.`;

const DAVI_CLUB = `Estimado cliente,
DAVIbank le notifica que la transacción realizada en CASTILLO COUNTRY CLUB HEREDIA Costa Rica, el día 25/06/2026 a las 10:49 PM con su tarjeta de crédito titular MC terminada en 9938 con número de autorización 496613 y referencia 617622814875 por CRC 20,550.00, fue aprobada.`;

const PROMERICA_COMPRA = `Hola Guillermo Rivera Arce
¡Tu transacción fue realizada con éxito!
Te compartimos el detalle:
Comercio JERUSALEM COSTA RICA HEREDIA CR
Tipo de Comercio DEPARTMENT STORES
Ciudad/País COSTA RICA
Fecha/hora 22 jun 2026 / 16:15
Número de tarjeta ****-****-****-6728
Número de autorización 825861
Número de referencia 4244012689
Monto CRC: 16,915.00
Viví experiencias y promociones exclusivas con tus tarjetas de débito y crédito`;

const PROMERICA_PAGO = `¡Hola, GUILLERMO RIVERA ARCE!
El pago de la tarjeta de crédito propia por un monto de 97,809.27 CRC se realizó con éxito.
Detalles del pago
Referencia: 3812553637
Titular de la tarjeta: GUILLERMO RIVERA ARCE
Número de tarjeta: 4815 **** **** 6728
Cuenta origen: CR90011610100082366272
Fecha/Hora: 24/06/2026 10:42:44 AM
Canal: Promerica Móvil
Este correo se genera automáticamente, por favor no contestarlo.`;

describe("BAC · muestras reales sep 2026", () => {
  it("compra con etiquetas inline (VISA ************2810)", () => {
    const [m] = bacNotificationSource.parse(BAC_COMPRA, {
      from: "notificacionbac@baccredomatic.cr",
    });
    expect(m!.kind).toBe("gasto");
    expect(m!.amount).toBe(4350);
    expect(m!.currency).toBe("CRC");
    expect(m!.merchant).toBe("MINISUPER MONTES DE OC");
    expect(m!.occurredOn).toBe("2026-09-04");
    expect(m!.externalRef).toBe("624718155016");
    expect(m!.cardLast4).toBe("2810");
    expect(m!.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it("SINPE recibido, redacción «acreditando la cuenta … un monto de … por concepto de X.»", () => {
    const [m] = bacNotificationSource.parse(BAC_SINPE_ACREDITANDO);
    expect(m).toBeDefined();
    expect(m!.kind).toBe("ingreso");
    expect(m!.amount).toBe(60000);
    expect(m!.currency).toBe("CRC");
    expect(m!.merchant).toBe("Pago Factura 282875");
    expect(m!.occurredOn).toBe("2026-09-02");
    expect(m!.externalRef).toBe("2026090215131020010003020");
    expect(m!.confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe("BCR · muestras reales", () => {
  it("compra con tarjeta (fila de tabla): gasto, colones, comercio, referencia, fecha, último-4", () => {
    const [m] = bcrNotificationSource.parse(BCR_CARD);
    expect(m!.bankCode).toBe("BCR");
    expect(m!.kind).toBe("gasto");
    expect(m!.amount).toBe(19800);
    expect(m!.currency).toBe("CRC");
    expect(m!.merchant).toBe("HOSPITAL CLINICA BIBLICA SAN JOSE CR");
    expect(m!.occurredOn).toBe("2026-09-03");
    expect(m!.externalRef).toBe("624613517122");
    expect(m!.cardLast4).toBe("5269");
    expect(m!.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it("comercio con minúsculas y ceros (ONVO Pizza Hut CR 0000 CR), decimales .95", () => {
    const [m] = bcrNotificationSource.parse(BCR_CARD_2);
    expect(m!.amount).toBe(32279.95);
    expect(m!.merchant).toBe("ONVO Pizza Hut CR 0000 CR");
    expect(m!.occurredOn).toBe("2026-06-18");
    expect(m!.cardLast4).toBe("2585");
  });
  it("estado Rechazada → nada", () => {
    expect(bcrNotificationSource.parse(BCR_CARD_RECHAZADA)).toEqual([]);
  });
  it("transferencia a un tercero: gasto por el monto DEBITADO, contraparte, motivo, documento", () => {
    const [m] = bcrNotificationSource.parse(BCR_TRANSFER);
    expect(m!.kind).toBe("gasto");
    expect(m!.amount).toBe(137400);
    expect(m!.currency).toBe("CRC");
    expect(m!.merchant).toBe("CASCANTE GOMEZ HELLEN MELISA");
    expect(m!.description).toContain("Abono Guate Nov 4A 1N 1Bb");
    expect(m!.description).toContain("300 USD transferidos");
    expect(m!.description.startsWith("[Entre cuentas propias]")).toBe(false);
    expect(m!.occurredOn).toBe("2026-09-02");
    expect(m!.externalRef).toBe("15370938");
    expect(m!.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it("transferencia con el mismo titular en origen y destino → [Entre cuentas propias], confianza baja", () => {
    const [m] = bcrNotificationSource.parse(BCR_TRANSFER_PROPIA);
    expect(m!.amount).toBe(50000);
    expect(m!.description.startsWith("[Entre cuentas propias]")).toBe(true);
    expect(m!.confidence).toBeLessThanOrEqual(0.5);
  });
  it("por el router, un correo BCR reenviado a mano desde Gmail (From = la persona) sale por la plantilla BCR", () => {
    const [m] = parseNotification(BCR_CARD, {
      from: "andrequep@gmail.com",
      subject: "Fwd: Transacción",
    });
    expect(m!.bankCode).toBe("BCR");
    expect(m!.confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe("BN · muestras reales", () => {
  it("compra: comercio sin sufijo de plaza, monto con coma decimal, fecha en letras, último-4, ref", () => {
    const [m] = bnNotificationSource.parse(BN_COMPRA);
    expect(m!.bankCode).toBe("BNCR");
    expect(m!.kind).toBe("gasto");
    expect(m!.amount).toBe(27939);
    expect(m!.currency).toBe("CRC");
    expect(m!.merchant).toBe("FERRETERIA EPA SA");
    expect(m!.occurredOn).toBe("2026-06-23");
    expect(m!.externalRef).toBe("43695055");
    expect(m!.cardLast4).toBe("2308");
    expect(m!.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it("Uber: comercio con enlace, monto 441,60 y referencia alfanumérica", () => {
    const [m] = bnNotificationSource.parse(BN_UBER);
    expect(m!.amount).toBe(441.6);
    expect(m!.merchant).toBe("UBER *TRIP HELP.UBER.COM");
    expect(m!.externalRef).toBe("MDWK596UF");
    expect(m!.occurredOn).toBe("2026-06-24");
  });
});

describe("Davivienda (DAVIbank) · muestras reales", () => {
  it("prosa: comercio sin «San Jose Costa Rica», fecha, último-4, autorización/referencia, aprobada", () => {
    const [m] = daviviendaNotificationSource.parse(DAVI_UBER_EATS, { from: "Alertas@davibank.cr" });
    expect(m!.bankCode).toBe("DAVIVIENDA");
    expect(m!.kind).toBe("gasto");
    expect(m!.amount).toBe(12444);
    expect(m!.merchant).toBe("DLC*UBER EATS");
    expect(m!.occurredOn).toBe("2026-03-27");
    expect(m!.cardLast4).toBe("0849");
    expect(m!.externalRef).toBe("24716523");
    expect(m!.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it("segunda muestra y estado no aprobado", () => {
    const [m] = daviviendaNotificationSource.parse(DAVI_CLUB);
    expect(m!.merchant).toBe("CASTILLO COUNTRY CLUB HEREDIA");
    expect(m!.amount).toBe(20550);
    expect(
      daviviendaNotificationSource.parse(DAVI_CLUB.replace("fue aprobada", "fue rechazada")),
    ).toEqual([]);
  });
  it("reenviado desde Hotmail (From = la persona) igual sale por Davivienda", () => {
    const [m] = parseNotification(DAVI_UBER_EATS, {
      from: "andre.qp@hotmail.com",
      subject: "FW: Alerta",
    });
    expect(m!.bankCode).toBe("DAVIVIENDA");
  });
});

describe("Promerica · muestras reales", () => {
  it("compra con etiquetas sin dos puntos y «CRC: 16,915.00»", () => {
    const [m] = promericaNotificationSource.parse(PROMERICA_COMPRA);
    expect(m!.bankCode).toBe("PROMERICA");
    expect(m!.kind).toBe("gasto");
    expect(m!.amount).toBe(16915);
    expect(m!.currency).toBe("CRC");
    expect(m!.merchant).toBe("JERUSALEM COSTA RICA HEREDIA");
    expect(m!.occurredOn).toBe("2026-06-22");
    expect(m!.externalRef).toBe("4244012689");
    expect(m!.cardLast4).toBe("6728");
    expect(m!.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it("pago de tarjeta propia: marcado, confianza baja, monto «97,809.27 CRC», último-4 6728", () => {
    const [m] = promericaNotificationSource.parse(PROMERICA_PAGO);
    expect(m!.kind).toBe("gasto");
    expect(m!.amount).toBe(97809.27);
    expect(m!.description.startsWith("[Pago de tarjeta]")).toBe(true);
    expect(m!.confidence).toBeLessThanOrEqual(0.5);
    expect(m!.externalRef).toBe("3812553637");
    expect(m!.cardLast4).toBe("6728");
    expect(m!.occurredOn).toBe("2026-06-24");
  });
});

describe("Router · con texto aplanado (HTML sin saltos) también funciona", () => {
  const flat = (s: string) => s.replace(/\s*\n\s*/g, " ");
  it("BCR, BN, Davivienda y Promerica aplanados", () => {
    expect(parseNotification(flat(BCR_CARD))[0]!.amount).toBe(19800);
    expect(parseNotification(flat(BN_COMPRA))[0]!.merchant).toBe("FERRETERIA EPA SA");
    expect(parseNotification(flat(DAVI_CLUB))[0]!.amount).toBe(20550);
    expect(parseNotification(flat(PROMERICA_COMPRA))[0]!.merchant).toBe(
      "JERUSALEM COSTA RICA HEREDIA",
    );
    expect(parseNotification(flat(BAC_SINPE_ACREDITANDO))[0]!.kind).toBe("ingreso");
  });
  it("cada banco queda con su bankCode", () => {
    expect(parseNotification(BAC_COMPRA)[0]!.bankCode).toBe("BAC");
    expect(parseNotification(BCR_TRANSFER)[0]!.bankCode).toBe("BCR");
    expect(parseNotification(BN_UBER)[0]!.bankCode).toBe("BNCR");
    expect(parseNotification(PROMERICA_PAGO)[0]!.bankCode).toBe("PROMERICA");
  });
});
