/**
 * «Último dato» — qué dice una pantalla que ya NO escribe su propio punto.
 *
 * Mientras `/m/patrimonio` escribía el snapshot de hoy al cargar, el último punto de la serie
 * era siempre hoy y no hacía falta fecharlo. Al sacar esa escritura al cron, la serie puede
 * terminar ayer —o la semana pasada, si nadie barrió— y una curva sin fecha se lee como si
 * llegara hasta hoy.
 *
 * Es el mismo criterio que la regla de la casa para toda cifra visible: período y naturaleza.
 * Acá el período es «hasta cuándo llega esto».
 */
import { describe, it, expect } from "vitest";

import { etiquetaUltimoDato } from "@/modules/wealth/engine/ultimo-dato";

describe("etiquetaUltimoDato", () => {
  it("sin puntos no promete nada", () => {
    expect(etiquetaUltimoDato([], "2026-09-18")).toBeNull();
  });

  it("con el punto de HOY no hace falta fecharlo", () => {
    expect(etiquetaUltimoDato([{ date: "2026-09-17" }, { date: "2026-09-18" }], "2026-09-18")).toBe(
      null,
    );
  });

  it("si el último punto es de ayer, lo dice", () => {
    expect(etiquetaUltimoDato([{ date: "2026-09-17" }], "2026-09-18")).toBe("Último dato: ayer");
  });

  it("de hace unos días, con la fecha", () => {
    expect(etiquetaUltimoDato([{ date: "2026-09-10" }], "2026-09-18")).toBe(
      "Último dato: 10 de septiembre",
    );
  });

  it("de otro año, con el año", () => {
    expect(etiquetaUltimoDato([{ date: "2025-12-31" }], "2026-09-18")).toBe(
      "Último dato: 31 de diciembre de 2025",
    );
  });

  it("no ordena por el orden recibido: toma la fecha MÁS ALTA", () => {
    // La serie llega ascendente, pero el rótulo no puede depender de eso: si un día llega
    // al revés, decir «último dato: <el primero>» sería mentir con precisión.
    expect(etiquetaUltimoDato([{ date: "2026-09-18" }, { date: "2026-09-10" }], "2026-09-18")).toBe(
      null,
    );
  });

  it("un punto FUTURO no se anuncia como atrasado", () => {
    // No debería pasar, pero si pasa (reloj de un dispositivo, dato importado) el rótulo
    // calla en vez de decir «último dato: mañana».
    expect(etiquetaUltimoDato([{ date: "2026-09-20" }], "2026-09-18")).toBeNull();
  });
});
