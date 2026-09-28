/**
 * Los dos estados sin dato de una cifra, y la regla que los gobierna: **el marco no se mueve.**
 *
 * No es estético. Un esqueleto de otro alto que el contenido empuja la página cuando llega el
 * dato, y hace que dos capturas de la MISMA compilación no se puedan comparar: nos costó una
 * medición de determinismo entera, con `/mi-rich-life` saliendo en 2196 px y 2102 px porque en
 * una corrida las donas habían montado y en la otra seguían siendo su esqueleto, que es más alto.
 *
 * Se renderiza con `react-dom/server` y se afirma sobre el HTML: sin jsdom no hay layout que
 * medir, así que lo que se fija es lo que PRODUCE el layout — que el esqueleto viva dentro del
 * mismo párrafo de la cifra y herede su tamaño (`height: 1em`), en vez de traer un alto propio.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

import { KpiCard } from "@/components/kpi";

const render = (props: Parameters<typeof KpiCard>[0]) =>
  renderToStaticMarkup(<KpiCard {...props} />);

const BASE = {
  etiqueta: "Flujo libre",
  valor: 1_234_567,
  delta: { valor: 120_000, sentidoBueno: "arriba" as const },
  puntos: [1, 2, 3, 4] as const,
  nota: "del mes",
};

describe("KpiCard · estados sin dato", () => {
  it("con datos pinta la cifra, el delta y la tendencia", () => {
    const html = render(BASE);
    expect(html).toContain("kpi-card-cifra");
    expect(html).toContain("kpi-delta");
    expect(html).toContain("<svg");
  });

  it("cargando: el velo va DENTRO del párrafo de la cifra, no en una caja aparte", () => {
    const html = render({ ...BASE, cargando: true });
    expect(html).toMatch(/<p class="kpi-card-cifra[^"]*"[^>]*>(?:(?!<\/p>).)*kpi-contexto-velo/s);
    expect(html).toContain("Cargando…");
  });

  it("cargando: el contenido real SIGUE en el DOM, para que el alto no cambie", () => {
    // Contraintuitivo y a propósito. Quitarlo dejaba la tarjeta más baja y la página daba el
    // salto que este estado venía a evitar: 45 px en el hero. Tres intentos de imitar esas
    // medidas a mano se quedaron en 22 y en 13 px. Se pinta lo de siempre y se tapa.
    const html = render({ ...BASE, cargando: true });
    expect(html).toContain("kpi-delta");
    expect(html).toContain("<svg");
  });

  it("…pero oculto a los lectores: nadie puede oír un delta que todavía no existe", () => {
    // La otra mitad de la decisión. Si el contenido reservado no fuera `aria-hidden`, quien
    // escucha la pantalla oiría la cifra vieja como si fuera el dato que está cargando.
    const html = render({ ...BASE, cargando: true });
    expect(html).toMatch(/<span class="kpi-velado" aria-hidden="true">/);
  });

  it("error: el mensaje ocupa el lugar de la cifra", () => {
    const html = render({ ...BASE, error: "No se pudo calcular" });
    expect(html).toContain("No se pudo calcular");
    expect(html).toMatch(/<p class="kpi-card-cifra[^"]*"[^>]*>(?:(?!<\/p>).)*kpi-error/s);
  });

  it("error usa role=status, no alert", () => {
    // Un `alert` por cada tarjeta de un tablero secuestraría el foco del lector tantas veces
    // como tarjetas haya. Que un número no se pueda calcular no interrumpe nada.
    const html = render({ ...BASE, error: "No se pudo calcular" });
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });

  it("si llegan los dos, manda «cargando»: el reintento ya está en curso", () => {
    const html = render({ ...BASE, cargando: true, error: "viejo" });
    expect(html).toContain("kpi-contexto-velo");
    expect(html).not.toContain("viejo");
  });

  it("la ETIQUETA sigue ahí en los tres estados: dice qué se está midiendo", () => {
    for (const extra of [{}, { cargando: true }, { error: "x" }]) {
      expect(render({ ...BASE, ...extra })).toContain("Flujo libre");
    }
  });
});
