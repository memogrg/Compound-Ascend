import { describe, it, expect } from "vitest";

import {
  aPayloadRecibo,
  avisoFecha,
  currencyForTimezone,
  draftFromExtract,
  etiquetaConfirmarMoneda,
  evaluarFecha,
  fechaLegible,
  mesLegible,
  mismoMes,
  necesitaConfirmarMoneda,
  resolveReceiptCurrency,
  resumenRegistro,
  validarRecibo,
} from "@/lib/ai/receipt-draft";

const HOY = "2026-08-05";

describe("moneda del recibo: nunca se adopta una en silencio", () => {
  it("la declarada en el recibo manda sobre el país y sobre la principal", () => {
    const r = resolveReceiptCurrency({
      detected: "CRC",
      timezone: "America/Mexico_City",
      primaryCurrency: "USD",
    });
    expect(r).toEqual({ currency: "CRC", origin: "recibo" });
  });

  it("REGRESIÓN: sin moneda declarada NO cae a la principal — usa la del país y pide confirmar", () => {
    // El bug: tiquete de ₡4.100 en Costa Rica, usuario con la principal en USD → "$4.100".
    const r = resolveReceiptCurrency({
      detected: null,
      timezone: "America/Costa_Rica",
      primaryCurrency: "USD",
    });
    expect(r).toEqual({ currency: "CRC", origin: "pais" });
  });

  it("sin zona conocida cae a la principal, pero marcada para confirmar", () => {
    const r = resolveReceiptCurrency({ detected: null, timezone: null, primaryCurrency: "USD" });
    expect(r).toEqual({ currency: "USD", origin: "principal" });
  });

  it("una zona de un país sin moneda soportada cae a la principal", () => {
    expect(currencyForTimezone("Asia/Tokyo")).toBeNull();
    expect(
      resolveReceiptCurrency({ detected: null, timezone: "Asia/Tokyo", primaryCurrency: "EUR" }),
    ).toEqual({ currency: "EUR", origin: "principal" });
  });

  it("mapea las zonas de los países soportados", () => {
    expect(currencyForTimezone("America/Costa_Rica")).toBe("CRC");
    expect(currencyForTimezone("America/Mexico_City")).toBe("MXN");
    expect(currencyForTimezone("America/Bogota")).toBe("COP");
    expect(currencyForTimezone("Europe/Madrid")).toBe("EUR");
    expect(currencyForTimezone("Europe/London")).toBe("GBP");
    expect(currencyForTimezone("America/New_York")).toBe("USD");
    // Panamá y El Salvador usan el dólar aunque no sean Estados Unidos.
    expect(currencyForTimezone("America/Panama")).toBe("USD");
    expect(currencyForTimezone(null)).toBeNull();
  });

  it("solo hay que confirmar la moneda cuando NO la declaró el recibo", () => {
    const conMoneda = draftFromExtract(
      { amount: 4100, date: HOY, merchant: "MaxiPali", currency: "CRC" },
      { hoy: HOY, primaryCurrency: "USD", timezone: "America/Costa_Rica" },
    );
    const sinMoneda = draftFromExtract(
      { amount: 4100, date: HOY, merchant: "MaxiPali", currency: null },
      { hoy: HOY, primaryCurrency: "USD", timezone: "America/Costa_Rica" },
    );
    expect(necesitaConfirmarMoneda(conMoneda)).toBe(false);
    expect(necesitaConfirmarMoneda(sinMoneda)).toBe(true);
  });

  it("el chip de confirmar nombra símbolo y código, y degrada a solo código si no hay símbolo", () => {
    expect(etiquetaConfirmarMoneda("CRC")).toBe("Sí, es ₡ (CRC)");
    expect(etiquetaConfirmarMoneda("XYZ")).toBe("Sí, es XYZ");
  });
});

describe("fecha del recibo: lo sospechoso se marca, no se registra en silencio", () => {
  it("una fecha del mes en curso pasa sin ruido", () => {
    expect(evaluarFecha("2026-08-01", HOY)).toEqual({ date: "2026-08-01", flag: "ok" });
  });

  it("REGRESIÓN: una fecha de hace dos años se CONSERVA pero queda marcada", () => {
    // El OCR del recibo de MaxiPali leyó 2024-08-26. Se registraba sin decir una palabra.
    expect(evaluarFecha("2024-08-26", HOY)).toEqual({ date: "2024-08-26", flag: "otro-mes" });
  });

  it("una fecha futura no puede ser de un recibo: cae a hoy", () => {
    expect(evaluarFecha("2026-09-01", HOY)).toEqual({ date: HOY, flag: "futura" });
  });

  it("falta o es inválida → hoy, marcada", () => {
    expect(evaluarFecha(null, HOY)).toEqual({ date: HOY, flag: "faltante" });
    expect(evaluarFecha("", HOY)).toEqual({ date: HOY, flag: "faltante" });
    // 2026-02-31 no existe; `new Date` la aceptaría corriéndola al 3 de marzo.
    expect(evaluarFecha("2026-02-31", HOY)).toEqual({ date: HOY, flag: "invalida" });
    expect(evaluarFecha("26/08/2024", HOY)).toEqual({ date: HOY, flag: "invalida" });
  });

  it("más de cinco años atrás es basura de OCR, no un recibo viejo: cae a hoy", () => {
    expect(evaluarFecha("2019-01-01", HOY)).toEqual({ date: HOY, flag: "absurda" });
    // Justo por dentro del corte se conserva (puede ser un gasto que se carga tarde).
    expect(evaluarFecha("2022-08-05", HOY).date).toBe("2022-08-05");
  });

  it("el aviso de otro mes nombra el mes y se apaga al corregir la fecha", () => {
    const origen = { flag: "otro-mes" as const, leida: "2024-08-26" };
    expect(avisoFecha("2024-08-26", HOY, origen)).toEqual({
      texto: "Esta fecha es de agosto 2024 — ¿es correcta?",
      tono: "aviso",
    });
    expect(avisoFecha("2026-08-04", HOY, origen)).toBeNull();
  });

  it("cuenta que la fecha del recibo se descartó, y deja de contarlo al editarla", () => {
    expect(avisoFecha(HOY, HOY, { flag: "faltante", leida: null })?.texto).toBe(
      "No detecté la fecha en el recibo; se usó la de hoy.",
    );
    expect(avisoFecha(HOY, HOY, { flag: "futura", leida: "2026-09-01" })?.texto).toContain(
      "es futura",
    );
    expect(avisoFecha(HOY, HOY, { flag: "invalida", leida: "2026-02-31" })?.texto).toContain(
      "no parece válida",
    );
    // Ya editada a otro día del mes en curso: no queda nada que avisar.
    expect(avisoFecha("2026-08-02", HOY, { flag: "faltante", leida: null })).toBeNull();
  });

  it("una fecha futura tecleada a mano bloquea (rojo), no solo advierte", () => {
    const a = avisoFecha("2026-12-01", HOY, { flag: "ok", leida: HOY });
    expect(a?.tono).toBe("error");
    expect(validarRecibo({ ...base(), occurredOn: "2026-12-01" }, HOY).fecha).toBe(
      "La fecha no puede ser futura",
    );
  });

  it("mismoMes y los formatos legibles", () => {
    expect(mismoMes("2026-08-01", "2026-08-31")).toBe(true);
    expect(mismoMes("2026-07-31", "2026-08-01")).toBe(false);
    expect(mesLegible("2024-08-26")).toBe("agosto 2024");
    expect(fechaLegible("2024-08-26")).toBe("26 de agosto de 2024");
  });
});

function base() {
  return draftFromExtract(
    { amount: 4100, date: "2024-08-26", merchant: "MaxiPali", currency: null },
    { hoy: HOY, primaryCurrency: "USD", timezone: "America/Costa_Rica" },
  );
}

describe("borrador editable: se registra lo EDITADO, no lo del OCR", () => {
  it("el recibo del bug llega al borrador con la moneda del país y la fecha marcada", () => {
    const d = base();
    expect(d).toMatchObject({
      description: "MaxiPali",
      amountText: "4100",
      currency: "CRC",
      currencyOrigin: "pais",
      occurredOn: "2024-08-26",
      dateFlag: "otro-mes",
      dateRead: "2024-08-26",
      categoryId: null,
    });
  });

  it("el payload toma los valores corregidos por el usuario", () => {
    const d = base();
    const editado = {
      ...d,
      description: "  MaxiPali Heredia  ",
      amountText: "4.100,50",
      currency: "CRC",
      occurredOn: "2026-08-03",
      categoryId: "11111111-1111-1111-1111-111111111111",
    };
    expect(aPayloadRecibo(editado)).toEqual({
      kind: "gasto",
      description: "MaxiPali Heredia",
      amount: 4100.5,
      currency: "CRC",
      occurredOn: "2026-08-03",
      categoryId: "11111111-1111-1111-1111-111111111111",
      source: "receipt",
    });
  });

  it("valida lo mismo que va a exigir el servidor; el sobre sigue siendo opcional", () => {
    expect(validarRecibo(base(), HOY)).toEqual({});
    expect(validarRecibo({ ...base(), description: "  " }, HOY).comercio).toBe("Falta el comercio");
    expect(validarRecibo({ ...base(), amountText: "" }, HOY).monto).toBe("Falta el monto");
    expect(validarRecibo({ ...base(), amountText: "-5" }, HOY).monto).toBe(
      "El monto tiene que ser mayor que cero",
    );
    expect(validarRecibo({ ...base(), occurredOn: "2026-02-31" }, HOY).fecha).toBe(
      "Fecha inválida",
    );
    // Sin sobre se registra igual: el pipeline central auto-categoriza o cae a "Por clasificar".
    expect(validarRecibo({ ...base(), categoryId: null }, HOY)).toEqual({});
  });

  it("un recibo sin nada útil llega vacío y marcado, no descartado", () => {
    const d = draftFromExtract(
      { amount: null, date: null, merchant: null, currency: null },
      { hoy: HOY, primaryCurrency: "USD", timezone: null },
    );
    expect(d.amountText).toBe("");
    expect(d.description).toBe("");
    expect(d.occurredOn).toBe(HOY);
    expect(d.dateFlag).toBe("faltante");
    expect(d.currencyOrigin).toBe("principal");
    expect(Object.keys(validarRecibo(d, HOY)).sort()).toEqual(["comercio", "monto"]);
  });
});

describe("después de registrar: se dice qué quedó y dónde", () => {
  it("el resumen lleva monto con SU símbolo, comercio y fecha", () => {
    const { titulo } = resumenRegistro(
      { amount: 4100, currency: "CRC", occurredOn: "2026-08-03", description: "MaxiPali" },
      HOY,
    );
    expect(titulo).toBe("✓ Registrado: ₡4.100 · MaxiPali · 3 de agosto de 2026");
  });

  it("REGRESIÓN: si cae fuera del mes en curso lo dice explícito", () => {
    const { periodo } = resumenRegistro(
      { amount: 4100, currency: "CRC", occurredOn: "2024-08-26", description: "MaxiPali" },
      HOY,
    );
    expect(periodo).toBe(
      "Quedó en agosto 2024, no en tu mes actual: no vas a verlo en los movimientos de este mes.",
    );
  });

  it("dentro del mes en curso no hay nada que aclarar", () => {
    expect(
      resumenRegistro(
        { amount: 4100, currency: "CRC", occurredOn: HOY, description: "MaxiPali" },
        HOY,
      ).periodo,
    ).toBeNull();
  });
});
