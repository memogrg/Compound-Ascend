/**
 * La barra inferior de la web estrecha.
 *
 * Con la bandera apagada tiene que ser IDÉNTICA a la de siempre: seis destinos, las mismas
 * etiquetas cortas y el mismo criterio de activo. Ese es el contrato del delta — encender la
 * bandera es lo único que cambia algo.
 */
import { describe, it, expect } from "vitest";

import { itemsDeBarra } from "@/components/layout/bottom-nav-items";

const v1 = (p: string, s: string | null = null) => itemsDeBarra(false, p, s);
const v2 = (p: string, s: string | null = null) => itemsDeBarra(true, p, s);

describe("bandera apagada: la barra vieja, intacta", () => {
  it("seis destinos, en su orden", () => {
    expect(v1("/dashboard").map((i) => i.id)).toEqual([
      "dashboard",
      "assistant",
      "base",
      "control",
      "wealth",
      "rich-life",
    ]);
  });

  it("con las etiquetas cortas, no con los nombres completos del NAV", () => {
    // «Centro de mando» y «Portafolio de inversiones» no caben bajo un ícono de 20 px.
    expect(v1("/dashboard").map((i) => i.etiqueta)).toEqual([
      "Centro",
      "Agente",
      "Base",
      "Ahorro",
      "Portafolio",
      "Patrimonio",
    ]);
  });

  it("el activo se decide por prefijo de ruta, como antes", () => {
    expect(v1("/patrimonio").find((i) => i.activo)?.id).toBe("wealth");
    expect(v1("/patrimonio/proteccion").find((i) => i.activo)?.id).toBe("wealth");
  });

  it("una ruta fuera de la lista no marca nada", () => {
    expect(v1("/configuracion").filter((i) => i.activo)).toHaveLength(0);
  });

  it("los enlaces NO llevan periodo: la barra vieja no lo propagaba", () => {
    // Cambiar esto con la bandera apagada sería cambiar producción por la puerta de atrás.
    expect(v1("/dashboard", "period=2026-08").map((i) => i.href)).toEqual(
      v1("/dashboard", null).map((i) => i.href),
    );
  });
});

describe("bandera encendida: los cinco núcleos", () => {
  it("cinco destinos, los mismos del sidebar y de /m", () => {
    expect(v2("/dashboard").map((i) => i.etiqueta)).toEqual([
      "Hoy",
      "Flujo",
      "Planes",
      "Patrimonio",
      "Asesor",
    ]);
  });

  it("el activo lo decide `nucleoDeRuta`, el mismo juez que el sidebar", () => {
    // Una ruta profunda marca su núcleo: con tres reglas distintas para el mismo modelo,
    // tarde o temprano una se desincroniza.
    expect(v2("/gastos").find((i) => i.activo)?.id).toBe("flujo");
    expect(v2("/deudas").find((i) => i.activo)?.id).toBe("planes");
    expect(v2("/patrimonio").find((i) => i.activo)?.id).toBe("patrimonio");
    expect(v2("/asistente").find((i) => i.activo)?.id).toBe("asesor");
    expect(v2("/mis-acciones").find((i) => i.activo)?.id).toBe("hoy");
  });

  it("marca UN solo activo, nunca dos", () => {
    for (const ruta of ["/dashboard", "/gastos", "/deudas", "/patrimonio", "/asistente"]) {
      expect(
        v2(ruta).filter((i) => i.activo),
        ruta,
      ).toHaveLength(1);
    }
  });

  it("una ruta fuera del modelo no marca ninguno", () => {
    expect(v2("/configuracion").filter((i) => i.activo)).toHaveLength(0);
  });

  it("los enlaces preservan `?period=`, como las pestañas", () => {
    // Si alguien está mirando agosto y toca «Planes», sigue mirando agosto. Sería raro que
    // la barra fuera el único sitio de la app que lo pierde.
    const hrefs = v2("/dashboard", "period=2026-08").map((i) => i.href);
    for (const h of hrefs) expect(h, h).toContain("period=2026-08");
  });

  it("sin periodo en la URL, el enlace queda limpio", () => {
    expect(v2("/dashboard").map((i) => i.href)).toEqual([
      "/dashboard",
      "/mi-base-financiera",
      "/control-financiero",
      "/mi-rich-life",
      "/asistente",
    ]);
  });

  it("no arrastra otros parámetros: solo el periodo viaja", () => {
    // `?cat=` pertenece a la pantalla que lo puso; llevarlo a otra daría un filtro que nadie
    // pidió.
    const hrefs = v2("/gastos", "cat=supermercado&period=2026-08").map((i) => i.href);
    for (const h of hrefs) {
      expect(h).toContain("period=2026-08");
      expect(h).not.toContain("cat=");
    }
  });

  it("cada núcleo trae su ícono, no un genérico", () => {
    expect(v2("/dashboard").map((i) => i.icon)).toEqual(["home", "flow", "flag", "coins", "iso"]);
  });
});
