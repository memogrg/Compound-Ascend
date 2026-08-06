import { describe, it, expect } from "vitest";

import { escalarAMax, MAX_LADO, CALIDAD_JPEG } from "@/lib/image/prepare-image";
import {
  mensajeFalloEscaneo,
  metaFalloEscaneo,
  falloDeRespuesta,
  falloDeExcepcion,
  extraccionVacia,
} from "@/lib/ai/scan-errors";

/**
 * Regresión del escáner que fallaba intermitente con fotos claras: la foto llegaba en megabytes
 * (sin comprimir) y el error siempre decía lo mismo ("No pude procesar la imagen"), tapara lo que
 * tapara.
 */
describe("escalarAMax (redimensionado de la foto antes de subirla)", () => {
  it("una foto de teléfono de 12 MP baja a 1600px de lado mayor, conservando la proporción", () => {
    // 4032×3024 (4:3) es lo que saca cualquier cámara de celular.
    expect(escalarAMax(4032, 3024)).toEqual({ ancho: 1600, alto: 1200 });
    // Vertical: manda el ALTO, no el ancho.
    expect(escalarAMax(3024, 4032)).toEqual({ ancho: 1200, alto: 1600 });
  });

  it("NUNCA agranda: una foto ya chica se sube tal cual", () => {
    expect(escalarAMax(800, 600)).toEqual({ ancho: 800, alto: 600 });
    // Justo en el límite tampoco toca nada.
    expect(escalarAMax(MAX_LADO, 900)).toEqual({ ancho: MAX_LADO, alto: 900 });
  });

  it("una imagen muy alargada no deja ninguna dimensión en 0 (el canvas fallaría)", () => {
    const r = escalarAMax(1, 5000);
    expect(r.alto).toBe(1600);
    expect(r.ancho).toBeGreaterThanOrEqual(1);
  });

  it("dimensiones imposibles no revientan: devuelven 0 y el llamador sube el original", () => {
    expect(escalarAMax(0, 100)).toEqual({ ancho: 0, alto: 0 });
    expect(escalarAMax(Number.NaN, 100)).toEqual({ ancho: 0, alto: 0 });
    expect(escalarAMax(-10, 100)).toEqual({ ancho: 0, alto: 0 });
  });

  it("los parámetros son los calibrados: 1600px y calidad 0.8", () => {
    expect(MAX_LADO).toBe(1600);
    expect(CALIDAD_JPEG).toBe(0.8);
  });
});

describe("mensajeFalloEscaneo: cada causa dice algo distinto y accionable", () => {
  it("REGRESIÓN: las cinco causas ya NO comparten el mismo texto genérico", () => {
    const textos = [
      mensajeFalloEscaneo({ tipo: "imagen-grande", bytes: 8_200_000 }),
      mensajeFalloEscaneo({ tipo: "timeout" }),
      mensajeFalloEscaneo({ tipo: "red" }),
      mensajeFalloEscaneo({ tipo: "servidor", status: 500 }),
      mensajeFalloEscaneo({ tipo: "vacio" }),
    ];
    expect(new Set(textos).size).toBe(5);
    expect(textos.some((t) => t.includes("No pude procesar la imagen"))).toBe(false);
  });

  it("la imagen muy grande dice CUÁNTO pesa", () => {
    expect(mensajeFalloEscaneo({ tipo: "imagen-grande", bytes: 8_200_000 })).toContain("8,2 MB");
  });

  it("el mensaje del SERVIDOR manda: ya trae el motivo específico", () => {
    // Lo que devuelve el proveedor ante un 429 (con su código legible en una captura).
    const conMensaje = mensajeFalloEscaneo({
      tipo: "servidor",
      status: 502,
      mensaje: "Alcanzaste el límite de uso de la IA por ahora. Intenta más tarde. (IA-429)",
    });
    expect(conMensaje).toContain("(IA-429)");
    // Y el del presupuesto de tokens del plan, que es otro motivo distinto con el mismo status.
    expect(
      mensajeFalloEscaneo({
        tipo: "servidor",
        status: 429,
        mensaje: "Alcanzaste el límite de IA de tu plan gratuito este mes.",
      }),
    ).toContain("plan gratuito");
  });

  it("sin mensaje del servidor cae a un texto por status, nunca a uno genérico mudo", () => {
    expect(mensajeFalloEscaneo({ tipo: "servidor", status: 401 })).toContain("iniciar sesión");
    expect(mensajeFalloEscaneo({ tipo: "servidor", status: 413 })).toContain("pesada");
    expect(mensajeFalloEscaneo({ tipo: "servidor", status: 429 })).toContain("límite");
    expect(mensajeFalloEscaneo({ tipo: "servidor", status: 502 })).toContain("IA");
    // Un status desconocido al menos deja el número para poder rastrearlo.
    expect(mensajeFalloEscaneo({ tipo: "servidor", status: 418 })).toContain("418");
  });

  it("un mensaje de servidor vacío o en blanco no gana: cae al de status", () => {
    expect(mensajeFalloEscaneo({ tipo: "servidor", status: 401, mensaje: "   " })).toContain(
      "iniciar sesión",
    );
  });
});

describe("falloDeRespuesta / falloDeExcepcion: normalizar lo que llega", () => {
  it("lee code y message del cuerpo de toSafeResponse", () => {
    expect(
      falloDeRespuesta(429, { error: { code: "RATE_LIMITED", message: "Muy rápido." } }),
    ).toEqual({ tipo: "servidor", status: 429, code: "RATE_LIMITED", mensaje: "Muy rápido." });
  });

  it("un cuerpo que no es JSON (HTML de un proxy) no rompe nada", () => {
    expect(falloDeRespuesta(502, null)).toEqual({ tipo: "servidor", status: 502 });
    expect(falloDeRespuesta(504, undefined)).toEqual({ tipo: "servidor", status: 504 });
    expect(falloDeRespuesta(500, { error: { code: 7, message: 7 } })).toEqual({
      tipo: "servidor",
      status: 500,
    });
  });

  it("distingue el timeout del cliente de la red caída", () => {
    const abort = new Error("abortado");
    abort.name = "AbortError";
    expect(falloDeExcepcion(abort)).toEqual({ tipo: "timeout" });
    expect(falloDeExcepcion(new TypeError("Failed to fetch"))).toEqual({ tipo: "red" });
  });
});

describe("metaFalloEscaneo: rastro para el log, sin la imagen", () => {
  it("lleva el contexto útil y NADA de la foto", () => {
    expect(metaFalloEscaneo({ tipo: "imagen-grande", bytes: 8_200_000 })).toEqual({
      tipo: "imagen-grande",
      bytes: 8_200_000,
    });
    expect(metaFalloEscaneo({ tipo: "servidor", status: 502, code: "PROVIDER_ERROR" })).toEqual({
      tipo: "servidor",
      status: 502,
      code: "PROVIDER_ERROR",
    });
    const meta = metaFalloEscaneo({ tipo: "timeout" });
    expect(meta).toEqual({ tipo: "timeout" });
    // Ninguna clave puede parecerse a la imagen.
    for (const f of [
      metaFalloEscaneo({ tipo: "imagen-grande", bytes: 1 }),
      metaFalloEscaneo({ tipo: "servidor", status: 500 }),
    ]) {
      expect(Object.keys(f)).not.toContain("base64");
      expect(Object.keys(f)).not.toContain("imageBase64");
    }
  });
});

describe("extraccionVacia", () => {
  it("vacía = sin monto NI comercio NI fecha", () => {
    expect(extraccionVacia({ amount: null, merchant: null, date: null })).toBe(true);
    expect(extraccionVacia({})).toBe(true);
  });

  it("con cualquiera de los tres NO está vacía", () => {
    expect(extraccionVacia({ amount: 4100, merchant: null, date: null })).toBe(false);
    expect(extraccionVacia({ amount: null, merchant: "MaxiPali", date: null })).toBe(false);
    expect(extraccionVacia({ amount: null, merchant: null, date: "2026-08-06" })).toBe(false);
  });

  it("la MONEDA no cuenta: casi ningún tiquete la declara y su ausencia es lo normal", () => {
    expect(extraccionVacia({ amount: null, merchant: null, date: null, currency: "CRC" })).toBe(
      true,
    );
  });
});
