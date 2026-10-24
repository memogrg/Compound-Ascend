/**
 * El eyebrow del header de `/m`, RENDERIZADO. El resto del modelo se prueba en
 * `nav-v2-movil.test.ts` con funciones puras; acá se fija lo único que esas funciones no
 * pueden decir: qué marcado sale, y sobre todo cuándo NO sale ninguno.
 *
 * El caso que manda es el del esqueleto. `loading.tsx` monta el mismo `MobileHeader` sin
 * título —el título real llega con la página—, y mientras el eyebrow se pintaba igual, en
 * `/m/patrimonio` el esqueleto escribía «Patrimonio» y la página lo borraba al llegar
 * (núcleo y pantalla se llaman igual): el texto aparecía y desaparecía a los ~200 ms.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// `usePathname`/`useSearchParams` necesitan el router de Next, que en un test no existe.
// La ruta es el ÚNICO dato de entorno que el componente lee, así que se inyecta acá y el
// resto del camino —modelo, comparación, marcado— corre de verdad.
let rutaActual = "/m";
vi.mock("next/navigation", () => ({
  usePathname: () => rutaActual,
  useSearchParams: () => new URLSearchParams(),
}));

const { EyebrowNucleo } = await import("@/app/(mobile)/m/components/nucleo-tabs-movil");

function pintar(ruta: string, props: { fallback?: string; title?: string }) {
  rutaActual = ruta;
  return renderToStaticMarkup(<EyebrowNucleo {...props} />);
}

describe("EyebrowNucleo", () => {
  /** El hueco que monta el esqueleto: la caja del eyebrow, vacía. */
  const RESERVA = '<div class="ov ov-reserva" aria-hidden="true"></div>';

  it("sin título no escribe NINGÚN texto, aunque la ruta tenga núcleo", () => {
    // Esto es el esqueleto: `<MobileHeader variant="inner" />`, sin título. Reserva el
    // renglón —medido: sin él el encabezado crecía hasta 30 px al llegar la página— pero no
    // adivina qué dice.
    expect(pintar("/m/patrimonio", {})).toBe(RESERVA);
    expect(pintar("/m/deudas", {})).toBe(RESERVA);
    expect(pintar("/m/gastos", {})).toBe(RESERVA);
  });

  it("sin título tampoco pinta el `fallback` de la página", () => {
    expect(pintar("/m/perfil", { fallback: "Cuenta" })).toBe(RESERVA);
  });

  it("la reserva no lleva texto: es un hueco, no un eyebrow", () => {
    expect(pintar("/m/deudas", {})).not.toMatch(/>[^<]/);
  });

  it("con título pinta el núcleo del modelo, no la cadena de la página", () => {
    expect(pintar("/m/deudas", { fallback: "Control", title: "Deudas y Préstamos" })).toBe(
      '<div class="ov">Planes</div>',
    );
  });

  it("no pinta el núcleo cuando repetiría el título", () => {
    expect(pintar("/m/patrimonio", { fallback: "Crecimiento", title: "Patrimonio" })).toBe("");
  });

  it("cae al `fallback` donde la ruta no cuelga de un núcleo", () => {
    expect(pintar("/m/perfil", { fallback: "Cuenta", title: "Configuración" })).toBe(
      '<div class="ov">Cuenta</div>',
    );
  });

  it("el esqueleto nunca escribe un texto que la página vaya a cambiar", () => {
    // La regla quita el TEXTO del esqueleto en todas las rutas, así que nunca cambia bajo el
    // dedo: o el renglón está vacío, o ya trae el definitivo.
    for (const [ruta, title] of [
      ["/m/deudas", "Deudas y Préstamos"],
      ["/m/gastos", "Gastos"],
      ["/m/patrimonio", "Patrimonio"],
    ] as const) {
      expect(pintar(ruta, {}), ruta).toBe(RESERVA);
      const pagina = pintar(ruta, { title });
      expect(pagina === "" || pagina !== RESERVA, ruta).toBe(true);
    }
  });
});
