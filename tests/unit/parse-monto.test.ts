/**
 * Lectura de montos escritos a mano.
 *
 * El bug: el campo borraba la coma antes de leer el número, así que «1500,50» —la forma
 * normal de escribirlo en Costa Rica, y lo que ofrece el teclado del teléfono— se
 * guardaba como 150050. Cien veces de más, sin aviso, y visible recién en el saldo.
 *
 * La regla que estos casos fijan: el ÚLTIMO separador es el decimal.
 */
import { describe, it, expect } from "vitest";
import { parseMonto, normalizarMontoTexto } from "@/lib/parse-monto";

describe("parseMonto", () => {
  it("coma decimal (lo que se escribe acá)", () => {
    expect(parseMonto("1500,50")).toBe(1500.5);
    expect(parseMonto("0,5")).toBe(0.5);
  });

  it("punto de miles + coma decimal", () => {
    expect(parseMonto("1.500,50")).toBe(1500.5);
  });

  it("coma de miles + punto decimal (formato en inglés)", () => {
    expect(parseMonto("1,500.50")).toBe(1500.5);
  });

  it("sin separadores", () => {
    expect(parseMonto("12")).toBe(12);
  });

  it("separadores repetidos: el último manda, el resto es ruido", () => {
    expect(parseMonto("1..2")).toBe(1.2);
    expect(parseMonto("1,,2")).toBe(1.2);
  });

  it("vacío o sin números → undefined, NUNCA 0", () => {
    // 0 significaría "cero colones" y haría ver completo un formulario a medio llenar.
    expect(parseMonto("")).toBeUndefined();
    expect(parseMonto("abc")).toBeUndefined();
    expect(parseMonto("   ")).toBeUndefined();
    expect(parseMonto(",")).toBeUndefined();
  });

  it("descarta símbolos y espacios sin perder el número", () => {
    expect(parseMonto("₡1.500,50")).toBe(1500.5);
    expect(parseMonto("$ 1,500.50")).toBe(1500.5);
    expect(parseMonto("1 500,50")).toBe(1500.5);
  });

  it("tolera el separador a medio escribir: el campo no pelea con el dedo", () => {
    expect(parseMonto("1500,")).toBe(1500);
    expect(parseMonto("1500.")).toBe(1500);
  });

  it("montos grandes con miles, que es donde el error dolía", () => {
    expect(parseMonto("1.250.000,75")).toBe(1250000.75);
    expect(parseMonto("1,250,000.75")).toBe(1250000.75);
  });

  /**
   * El caso que obliga a mirar la longitud de la cola. «1.500» tecleado casi siempre es
   * mil quinientos, no uno con medio — y con la regla anterior («el último separador es
   * el decimal», sin mirar cuántos dígitos deja) se guardaba 1.5.
   */
  it("un separador ÚNICO con exactamente 3 dígitos detrás es de MILES", () => {
    expect(parseMonto("1.500")).toBe(1500);
    expect(parseMonto("1,500")).toBe(1500);
    expect(parseMonto("12.345")).toBe(12345);
  });

  it("…pero con 1, 2 o 4+ dígitos detrás es decimal", () => {
    expect(parseMonto("2,5")).toBe(2.5);
    expect(parseMonto("1500,50")).toBe(1500.5);
    expect(parseMonto("12.3456")).toBe(12.3456);
  });

  it("parte entera en cero → siempre decimal: «0,125» es una fracción, no 125", () => {
    expect(parseMonto("0,125")).toBe(0.125);
    expect(parseMonto("0.125")).toBe(0.125);
  });

  it("separador repetido con agrupación de a 3 → miles", () => {
    expect(parseMonto("1.500.000")).toBe(1500000);
    expect(parseMonto("1,500,000")).toBe(1500000);
  });

  it("signo y paréntesis contables", () => {
    expect(parseMonto("-1500,50")).toBe(-1500.5);
    expect(parseMonto("(1.234,56)")).toBe(-1234.56);
  });

  it("símbolos de moneda y espacio de miles", () => {
    expect(parseMonto("US$ 1,500.50")).toBe(1500.5);
    expect(parseMonto("CRC 1.500,50")).toBe(1500.5);
    expect(parseMonto("1 500 000,25")).toBe(1500000.25);
  });

  it("el bug viejo, explícito: borrar la coma multiplicaba por 100", () => {
    const viejo = (s: string) => Number(s.replace(/[^0-9.]/g, ""));
    expect(viejo("1500,50")).toBe(150050);
    expect(parseMonto("1500,50")).toBe(1500.5);
  });
});

/**
 * Las dos opciones existen para EMISORES CONOCIDOS, no para gustos. Sin opciones, nada
 * cambia: los casos de arriba son la prueba.
 */
describe("opciones · formato en-US (lo justifica BAC)", () => {
  it("coma siempre de miles, punto siempre decimal", () => {
    expect(parseMonto("5,000.00", { formato: "en-US" })).toBe(5000);
    expect(parseMonto("12,345.00", { formato: "en-US" })).toBe(12345);
    expect(parseMonto("97,809.27", { formato: "en-US" })).toBe(97809.27);
  });

  it("«1,5» es quince, no uno y medio: sin esto un aviso de BAC se leería mal", () => {
    expect(parseMonto("1,5", { formato: "en-US" })).toBe(15);
    expect(parseMonto("1,5")).toBe(1.5); // la regla automática, sin cambios
  });

  it("sin separadores o con solo punto se comporta igual que siempre", () => {
    expect(parseMonto("19.99", { formato: "en-US" })).toBe(19.99);
    expect(parseMonto("500", { formato: "en-US" })).toBe(500);
  });
});

describe("opciones · decimalesMaximos (lo justifican BCR, BN, Davivienda, Promerica y los estados de cuenta)", () => {
  it("más decimales que el tope → ese separador era de miles", () => {
    expect(parseMonto("12.3456", { decimalesMaximos: 2 })).toBe(123456);
    expect(parseMonto("12.3456")).toBe(12.3456); // en un formulario, 12.3456
  });

  it("con tope, la parte entera en cero ya no salva", () => {
    expect(parseMonto("0,125", { decimalesMaximos: 2 })).toBe(125);
    expect(parseMonto("0,125")).toBe(0.125); // en un formulario, una fracción
  });

  it("dentro del tope, el separador sigue siendo decimal", () => {
    expect(parseMonto("441,60", { decimalesMaximos: 2 })).toBe(441.6);
    expect(parseMonto("1500,50", { decimalesMaximos: 2 })).toBe(1500.5);
  });

  it("el tope también manda con dos separadores distintos", () => {
    // La cola supera el tope: la coma tampoco era decimal, los dos son de miles.
    expect(parseMonto("1.500,500", { decimalesMaximos: 2 })).toBe(1500500);
    // La cola cabe: el último separador es el decimal, en cualquiera de los dos órdenes.
    expect(parseMonto("1,500.50", { decimalesMaximos: 2 })).toBe(1500.5);
    expect(parseMonto("1.500,50", { decimalesMaximos: 2 })).toBe(1500.5);
  });

  it("sin la opción, el caso de dos separadores no cambia", () => {
    expect(parseMonto("1.500,500")).toBe(1500.5);
  });
});

describe("separador colgante al final · es puntuación de la frase, no un decimal", () => {
  it("la coma de prosa que el emisor mete en la captura se descarta", () => {
    // «…por CRC 12,444.00, fue aprobada» → el regex del banco captura «12,444.00,».
    expect(parseMonto("12,444.00,")).toBe(12444);
    expect(parseMonto("12,444.00,", { decimalesMaximos: 2 })).toBe(12444);
    expect(parseMonto("3.900,00,", { decimalesMaximos: 2 })).toBe(3900);
    expect(parseMonto("441,60,", { decimalesMaximos: 2 })).toBe(441.6);
  });

  it("también con formato fijo", () => {
    expect(parseMonto("12,444.00.", { formato: "en-US" })).toBe(12444);
  });

  it("un separador solo al final ya se ignoraba; queda fijado", () => {
    expect(parseMonto("1.500,")).toBe(1500);
  });

  it("al INICIO no se recorta: «.5» sigue siendo medio", () => {
    expect(parseMonto(".5")).toBe(0.5);
    expect(parseMonto(".5", { decimalesMaximos: 2 })).toBe(0.5);
  });
});

describe("normalizarMontoTexto", () => {
  it("devuelve algo que Number entiende", () => {
    expect(normalizarMontoTexto("1.500,50")).toBe("1500.50");
    expect(normalizarMontoTexto("12")).toBe("12");
  });

  it("sin nada aprovechable devuelve cadena vacía", () => {
    expect(normalizarMontoTexto("abc")).toBe("");
    expect(normalizarMontoTexto("")).toBe("");
  });
});
