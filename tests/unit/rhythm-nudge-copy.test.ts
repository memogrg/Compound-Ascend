/**
 * COPY del pop-up de ritmo (lib/rhythm/nudge-copy.ts).
 *
 * Dos cosas se vigilan acá y las dos ya se rompieron antes en este repo:
 *  1. La VOZ. Web es voseo, móvil es es-MX de "tú". Al portar copy de una superficie a
 *     la otra es lo primero que se olvida.
 *  2. El TONO. "Acompañar, no regañar" es fácil de escribir en un comentario y fácil de
 *     perder en el siguiente retoque. Se afirma como propiedad, no como buena intención.
 */
import { describe, it, expect } from "vitest";

import {
  copyVentana,
  copyCierre,
  copyRegistroDiario,
  elegirNudge,
  type NudgeCopy,
} from "@/lib/rhythm/nudge-copy";

const ventana = (voz: "vos" | "tu", over: Partial<Parameters<typeof copyVentana>[0]> = {}) =>
  copyVentana({ voz, mes: "agosto", diasRestantes: 3, sobresConPresupuesto: 0, ...over });

describe("voz · voseo en web, tuteo en móvil", () => {
  it("la ventana conjuga distinto según la superficie", () => {
    expect(ventana("vos").titulo).toBe("Ajustá tus sobres de agosto");
    expect(ventana("tu").titulo).toBe("Ajusta tus sobres de agosto");
    expect(ventana("vos").cuerpo).toContain("repartiste");
    expect(ventana("tu").cuerpo).toContain("repartes");
  });

  it("el cierre también", () => {
    const args = { mes: "agosto", pendientes: ["2 metas sin su aporte"] };
    expect(copyCierre({ voz: "vos", ...args }).titulo).toContain("Cerrá");
    expect(copyCierre({ voz: "tu", ...args }).titulo).toContain("Cierra");
    expect(copyCierre({ voz: "vos", ...args }).cuerpo).toContain("pegá");
    expect(copyCierre({ voz: "tu", ...args }).cuerpo).toContain("pega");
  });

  it("el recordatorio diario también", () => {
    expect(copyRegistroDiario("vos").cuerpo).toContain("Podés");
    expect(copyRegistroDiario("tu").cuerpo).toContain("Puedes");
  });

  it("las frases que NO cambian de conjugación son idénticas en ambas voces", () => {
    // Si alguien duplica una frase que no lo necesita, las dos copias se desincronizan
    // al primer retoque. Esta es la prueba de que solo se bifurca lo que debe.
    expect(copyRegistroDiario("vos").titulo).toBe(copyRegistroDiario("tu").titulo);
    expect(copyRegistroDiario("vos").cta).toBe(copyRegistroDiario("tu").cta);
    expect(ventana("vos", { sobresConPresupuesto: 5 }).cuerpo).toBe(
      ventana("tu", { sobresConPresupuesto: 5 }).cuerpo,
    );
  });
});

describe("tono · acompañar, no regañar", () => {
  const todos = (): NudgeCopy[] => [
    ventana("vos"),
    ventana("tu", { diasRestantes: 1 }),
    copyCierre({ voz: "vos", mes: "agosto", pendientes: ["1 cuota de deuda sin registrar"] }),
    copyRegistroDiario("vos"),
    copyRegistroDiario("tu"),
  ];

  it("sin signos de admiración en ningún aviso", () => {
    for (const c of todos()) {
      expect(`${c.titulo} ${c.cuerpo}`, c.kind).not.toContain("!");
      expect(`${c.titulo} ${c.cuerpo}`, c.kind).not.toContain("¡");
    }
  });

  it("sin vocabulario de reproche", () => {
    const reproches = /\b(deberías|debiste|error|fallaste|olvidaste|incumpl|mal hecho)\b/i;
    for (const c of todos()) {
      expect(reproches.test(`${c.titulo} ${c.cuerpo}`), `${c.kind}: ${c.cuerpo}`).toBe(false);
    }
  });

  it("todos ofrecen una salida concreta, no solo un señalamiento", () => {
    for (const c of todos()) {
      expect(c.cta.length, c.kind).toBeGreaterThan(0);
      expect(c.descartar.length, c.kind).toBeGreaterThan(0);
    }
  });

  it("el descarte del recordatorio es una respuesta legítima, no un 'después'", () => {
    // Quien no gastó hoy no está posponiendo nada. El botón tiene que dejarlo decirlo
    // sin que se sienta en falta.
    expect(copyRegistroDiario("vos").descartar).toBe("Hoy no gasté");
  });

  it("el último día de ventana se enuncia sin cuenta regresiva", () => {
    const c = ventana("vos", { diasRestantes: 1 });
    expect(c.cuerpo).toContain("último día");
    expect(c.cuerpo).not.toMatch(/queda 1 día/);
  });
});

describe("copyCierre · la lista de pendientes", () => {
  it("con uno solo dice 'Te falta', en singular", () => {
    const c = copyCierre({ voz: "vos", mes: "agosto", pendientes: ["1 meta sin su aporte"] });
    expect(c.cuerpo).toContain("Te falta 1 meta");
    expect(c.cuerpo).not.toContain("Te faltan");
  });

  it("con varios usa coma española y 'y' final", () => {
    const c = copyCierre({ voz: "vos", mes: "agosto", pendientes: ["A", "B", "C"] });
    expect(c.cuerpo).toContain("Te faltan A, B y C.");
  });
});

describe("elegirNudge · un aviso a la vez", () => {
  const v = ventana("vos");
  const c = copyCierre({ voz: "vos", mes: "agosto", pendientes: ["A"] });
  const d = copyRegistroDiario("vos");

  it("prioriza por ventana de oportunidad: la que expira antes va primero", () => {
    // La ventana de configuración vence el día 5 y no vuelve; el cierre tiene varios
    // días; el recordatorio diario vuelve mañana.
    expect(elegirNudge({ ventana: v, cierre: c, diario: d })).toBe(v);
    expect(elegirNudge({ cierre: c, diario: d })).toBe(c);
    expect(elegirNudge({ diario: d })).toBe(d);
  });

  it("sin nada que decir devuelve null (el pop-up no se monta)", () => {
    expect(elegirNudge({})).toBeNull();
    expect(elegirNudge({ ventana: null, cierre: null, diario: null })).toBeNull();
  });
});
