/**
 * "Te quedan {X} de {Y} en {sobre} este mes" — el copy compartido del restante.
 *
 * Este módulo existe porque el mismo texto estaba escrito dos veces en
 * assistant-conversation.tsx y en ningún lado más: el chat lo decía y el tab de Gastos,
 * Transacciones y el móvil no. Los tests fijan las tres formas (frase suelta, mensaje de
 * éxito, línea de detalle) para que sigan contando la misma historia.
 */
import { describe, it, expect } from "vitest";

import {
  sobreRemainingText,
  sobreSuccessText,
  sobreDetailText,
  type SobreRemaining,
} from "@/modules/financial-base/engine/sobre-remaining-copy";

/** Formateador trivial: se afirma sobre las CIFRAS, no sobre la coma de miles. */
const fmt = (n: number, c: string) => `${c}${Math.round(n)}`;

const sobre = (over: Partial<SobreRemaining> = {}): SobreRemaining => ({
  path: "Vivir › Comida",
  currency: "CRC",
  budget: 400_000,
  spent: 150_000,
  remaining: 250_000,
  hasBudget: true,
  ...over,
});

describe("sobreRemainingText · la frase suelta", () => {
  it("da restante y presupuesto: sin el total, el número no se puede interpretar", () => {
    const t = sobreRemainingText(sobre(), fmt);
    expect(t).toContain("Vivir › Comida");
    expect(t).toContain("CRC250000");
    expect(t).toContain("CRC400000");
  });

  it("con el sobre excedido dice cuánto, en positivo y sin alarma", () => {
    const t = sobreRemainingText(sobre({ remaining: -30_000, spent: 430_000 }), fmt);
    expect(t).toContain("te pasaste por CRC30000");
    expect(t).not.toContain("-");
    expect(t).not.toContain("!");
  });

  it("sin presupuesto lo dice en vez de mostrar un restante de 0 que mentiría", () => {
    const t = sobreRemainingText(sobre({ hasBudget: false, budget: 0, remaining: 0 }), fmt);
    expect(t).toContain("sin presupuesto asignado");
    expect(t).not.toContain("CRC0");
  });

  it("sin sobre devuelve null: la superficie degrada, no inventa cifras", () => {
    expect(sobreRemainingText(null, fmt)).toBeNull();
    expect(sobreRemainingText(undefined, fmt)).toBeNull();
  });
});

describe("sobreSuccessText · el mensaje tras registrar", () => {
  it("confirma el hecho Y da el restante", () => {
    const t = sobreSuccessText(sobre(), fmt);
    expect(t).toContain("✓ Registrado en Vivir › Comida");
    expect(t).toContain("Te quedan CRC250000 de CRC400000");
  });

  it("sin sobre confirma igual, con el genérico", () => {
    expect(sobreSuccessText(null, fmt)).toBe("✓ Transacción registrada.");
  });

  it("excedido: confirma primero, informa después", () => {
    const t = sobreSuccessText(sobre({ remaining: -30_000 }), fmt);
    expect(t.indexOf("✓ Registrado")).toBeLessThan(t.indexOf("Te pasaste"));
  });
});

describe("sobreDetailText · la línea del resumen del recibo", () => {
  it("NO repite la confirmación (la tarjeta ya la dijo)", () => {
    const t = sobreDetailText(sobre(), fmt);
    expect(t).not.toContain("✓");
    expect(t).toContain("Sobre: Vivir › Comida");
    expect(t).toContain("Te quedan CRC250000");
  });

  it("null sin sobre", () => {
    expect(sobreDetailText(null, fmt)).toBeNull();
  });
});

describe("las tres formas cuentan la misma historia", () => {
  it("todas mencionan el sobre y la misma cifra de restante", () => {
    const s = sobre();
    const textos = [
      sobreRemainingText(s, fmt)!,
      sobreSuccessText(s, fmt),
      sobreDetailText(s, fmt)!,
    ];
    for (const t of textos) {
      expect(t).toContain("Vivir › Comida");
      expect(t).toContain("CRC250000");
    }
  });

  it("todas coinciden en el caso excedido", () => {
    const s = sobre({ remaining: -30_000 });
    for (const t of [
      sobreRemainingText(s, fmt)!,
      sobreSuccessText(s, fmt),
      sobreDetailText(s, fmt)!,
    ]) {
      expect(t.toLowerCase()).toContain("te pasaste por crc30000");
    }
  });

  it("todas comunican el mismo hecho sin presupuesto, cada una en su marco", () => {
    // No se exige texto idéntico: los tres marcos son gramaticalmente distintos —fragmento
    // ("· sin presupuesto asignado"), paréntesis tras la confirmación ("(Este sobre no
    // tiene…)") y oración suelta—. Lo que sí tiene que coincidir es el HECHO, y sobre todo
    // que ninguna muestre un restante de 0, que se leería como "no te queda nada".
    const s = sobre({ hasBudget: false, budget: 0, remaining: 0 });
    for (const t of [
      sobreRemainingText(s, fmt)!,
      sobreSuccessText(s, fmt),
      sobreDetailText(s, fmt)!,
    ]) {
      expect(t.toLowerCase()).toContain("presupuesto asignado");
      expect(t).not.toContain("CRC0");
      expect(t.toLowerCase()).not.toContain("te quedan");
    }
  });
});
