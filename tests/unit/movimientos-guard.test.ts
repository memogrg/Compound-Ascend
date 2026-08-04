/**
 * La red que impide que el LLM enumere movimientos o afirme totales sin haber consultado la
 * herramienta.
 *
 * El system-prompt ya se lo prohíbe, pero una instrucción no es una garantía: la misma clase de
 * bug entró tres veces por puertas distintas del ruteo, y en las tres el modelo terminó
 * inventando comercios y montos. Esto lo corta después de generar, sin depender de que se porte
 * bien.
 */
import { describe, it, expect } from "vitest";
import {
  pareceEnumeracionDeMovimientos,
  guardMovimientos,
  PEDIDO_DE_DATOS,
  TOOLS_DE_MOVIMIENTOS,
} from "@/lib/ai/movimientos-guard";

const TABLA = `Tus gastos en Supermercado de julio 2026:

| Fecha | Comercio | Monto |
| --- | --- | --- |
| 5 de julio | WALMART | −₡45.300 |
| 12 de julio | MAXIPALI | −₡18.750 |
| **Total** |  | **₡64.050** |`;

const VINETAS = `Estos son tus movimientos:
• 5 de julio · WALMART: −₡45.300
• 12 de julio · MAXIPALI: −₡18.750`;

describe("pareceEnumeracionDeMovimientos", () => {
  it("detecta una tabla de movimientos", () => {
    expect(pareceEnumeracionDeMovimientos(TABLA)).toBe(true);
  });

  it("detecta viñetas de movimientos", () => {
    expect(pareceEnumeracionDeMovimientos(VINETAS)).toBe(true);
  });

  it("detecta la afirmación de un TOTAL aunque no liste nada", () => {
    expect(pareceEnumeracionDeMovimientos("Tus gastos de julio suman ₡554.553.")).toBe(true);
    expect(pareceEnumeracionDeMovimientos("En total gastaste $1.200 el mes pasado.")).toBe(true);
  });

  it("NO marca una respuesta conversacional normal", () => {
    for (const r of [
      "Tu fondo de emergencia está incompleto: te faltan unos meses para cerrarlo.",
      "Podés ajustar el presupuesto de Restaurantes desde el tab de Gastos.",
      "No llevo la hora; preguntame sobre tu dinero.",
      "Te recomiendo priorizar la tarjeta, que está al 45% anual.",
    ]) {
      expect(pareceEnumeracionDeMovimientos(r), r.slice(0, 30)).toBe(false);
    }
  });

  it("NO marca UNA sola mención de fecha y monto (es una frase, no una lista)", () => {
    expect(
      pareceEnumeracionDeMovimientos("El 3 de julio pagaste ₡3.900 de más en ese sobre."),
    ).toBe(false);
  });
});

describe("guardMovimientos", () => {
  it("BLOQUEA la tabla si no corrió ninguna tool de movimientos", () => {
    const g = guardMovimientos(TABLA, false);
    expect(g.bloqueado).toBe(true);
    expect(g.reply).toBe(PEDIDO_DE_DATOS);
    // Y lo que sale no trae ni un comercio de los inventados.
    expect(g.reply).not.toContain("WALMART");
    expect(g.reply).not.toContain("₡");
  });

  it("DEJA PASAR la misma tabla si la tool sí corrió", () => {
    const g = guardMovimientos(TABLA, true);
    expect(g.bloqueado).toBe(false);
    expect(g.reply).toBe(TABLA);
  });

  it("no toca una respuesta normal, con o sin tool", () => {
    const normal = "Tu fondo de emergencia está incompleto.";
    expect(guardMovimientos(normal, false)).toEqual({ reply: normal, bloqueado: false });
    expect(guardMovimientos(normal, true)).toEqual({ reply: normal, bloqueado: false });
  });

  it("el mensaje de bloqueo es accionable: pide sobre y periodo", () => {
    expect(PEDIDO_DE_DATOS).toMatch(/sobre y el periodo/i);
    expect(PEDIDO_DE_DATOS).toMatch(/supermercado del mes pasado/i);
    // Y explica POR QUÉ, para que no parezca una negativa arbitraria.
    expect(PEDIDO_DE_DATOS).toMatch(/no quiero darte cifras de memoria/i);
  });
});

describe("qué herramientas habilitan enumerar", () => {
  it("las tres que devuelven movimientos reales", () => {
    expect(TOOLS_DE_MOVIMIENTOS).toContain("consultar_transacciones");
    expect(TOOLS_DE_MOVIMIENTOS).toContain("consultar_historial");
    expect(TOOLS_DE_MOVIMIENTOS).toContain("consultar_detalle");
  });

  it("una tool de CÁLCULO no habilita enumerar movimientos", () => {
    // Simular una deuda no da acceso al libro diario: si el modelo llamó solo eso y aun así
    // enumeró movimientos, los inventó.
    expect(TOOLS_DE_MOVIMIENTOS).not.toContain("simular_pago_deuda");
    expect(TOOLS_DE_MOVIMIENTOS).not.toContain("proyectar_inversion");
  });
});
