import { describe, it, expect } from "vitest";
import { formatButtonsAsText } from "@/lib/whatsapp/provider";
import { verifyTwilioSignature } from "@/lib/whatsapp/twilio-signature";
import { formatMoney } from "@/lib/whatsapp/format";

// Vector de ejemplo de Twilio (URL + params ordenados). La firma esperada es la
// que produce el algoritmo oficial de twilio-node (HMAC-SHA1 base64), idéntico
// al nuestro: sirve como guardia de regresión del algoritmo.
const TW_URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const TW_PARAMS = {
  Digits: "1234",
  To: "+18005551212",
  From: "+14158675310",
  Caller: "+14158675310",
  CallSid: "CA1234567890ABCDE",
};
const TW_TOKEN = "12345";
const TW_SIG = "GvWf1cFY/Q7PnoempGyD5oXAezc=";

describe("verifyTwilioSignature", () => {
  it("acepta la firma generada por el algoritmo de Twilio", () => {
    expect(verifyTwilioSignature(TW_TOKEN, TW_SIG, TW_URL, TW_PARAMS)).toBe(true);
  });

  it("rechaza firma ausente, alterada o token incorrecto", () => {
    expect(verifyTwilioSignature(TW_TOKEN, null, TW_URL, TW_PARAMS)).toBe(false);
    expect(verifyTwilioSignature(TW_TOKEN, "abc", TW_URL, TW_PARAMS)).toBe(false);
    expect(verifyTwilioSignature("wrong", TW_SIG, TW_URL, TW_PARAMS)).toBe(false);
    expect(
      verifyTwilioSignature(TW_TOKEN, TW_SIG, TW_URL, { ...TW_PARAMS, Digits: "9999" }),
    ).toBe(false);
  });
});

describe("formatMoney", () => {
  it("antepone el símbolo y redondea (separador es-CR)", () => {
    const n12000 = (12000).toLocaleString("es-CR");
    const n1235 = (1235).toLocaleString("es-CR");
    expect(formatMoney(12000, "CRC")).toBe(`₡${n12000}`);
    expect(formatMoney(1234.6, "USD")).toBe(`$${n1235}`);
    expect(formatMoney(500, "XYZ")).toBe("500");
  });
});

describe("formatButtonsAsText", () => {
  it("devuelve el cuerpo tal cual cuando no hay opciones", () => {
    expect(formatButtonsAsText("Hola")).toBe("Hola");
    expect(formatButtonsAsText("Hola", [])).toBe("Hola");
  });

  it("numera las opciones como fallback de botones", () => {
    const out = formatButtonsAsText("¿Lo agrego?", [
      { id: "yes", title: "Sí" },
      { id: "edit", title: "Editar" },
    ]);
    expect(out).toBe("¿Lo agrego?\n\n1. Sí\n2. Editar");
  });
});
