/**
 * Las tres notas al pie de la dona de `growth-view` van FUERA del lienzo (26.5).
 *
 * Esta prueba existe porque esa pantalla **no tiene captura que la cubra**, y conviene dejar
 * escrito por qué antes de leer una sola aserción.
 *
 * `GrowthView` se monta en un único sitio del repo, y es la rama `else` de una condición que en
 * QA y en producción siempre es verdadera — `src/app/(dashboard)/patrimonio/page.tsx`:
 *
 *     {configured ? <PortfolioSection … /> : <GrowthView summary={summary} />}
 *
 * `configured` es `isSupabaseConfigured()`: que existan `NEXT_PUBLIC_SUPABASE_URL` y su clave
 * anónima. Sin ellas no hay sesión, así que tampoco hay `/patrimonio` que fotografiar — el muro
 * de autenticación llega antes. Y no hay pestañas: la página no recibe `searchParams`. O sea que
 * el diff visual no puede ver este componente **por mucho que se le añadan rutas**, y lo que la
 * 26.5 le cambia hay que afirmarlo desde el marcado o no afirmarlo.
 *
 * Lo que la 26.5 le cambia es esto y solo esto: las tres notas —aporte mensual, diversificación y
 * concentración máxima— eran un hermano de la dona DENTRO de la tarjeta y ahora van por el slot
 * `pie` del marco. Importa porque el lienzo tiene alto fijo: lo que se pinte dentro por encima de
 * ese alto se sale de la tarjeta (decisión 48). Si alguien las devuelve al lienzo, el síntoma es
 * un recorte en una pantalla que nadie mira.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { WealthSummary } from "@/modules/wealth/services/wealth-service";

/**
 * `next/navigation` en el servidor de pruebas.
 *
 * `AddHoldingButton` llama a `useDeepLinkModal`, que usa `useRouter()`, y fuera de Next eso
 * revienta con «invariant expected app router to be mounted». No se mockea para esquivar nada:
 * el enrutador no participa de lo que se afirma —dónde se pinta un bloque de notas— y montar
 * medio Next para eso sería cambiar la pregunta. Mismo patrón que
 * `eyebrow-nucleo-render.test.tsx`.
 */
vi.mock("next/navigation", () => ({
  usePathname: () => "/patrimonio",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

const { GrowthView } = await import("@/modules/wealth/components/growth-view");

/** Las tres notas, por el texto que lee la persona. */
const NOTAS = ["Aporte mensual", "Diversificación", "Concentración máx."];

/**
 * Un resumen mínimo pero COMPLETO: sin `as WealthSummary`, para que un campo nuevo en el tipo
 * rompa acá y no en producción.
 *
 * Sin inversiones ni holdings a propósito: es el estado en que la dona tiene datos (la
 * distribución viene de `portfolio`) y la lista de activos está vacía, que es el camino más corto
 * al marco sin arrastrar filas que no se afirman.
 */
const RESUMEN: WealthSummary = {
  readiness: {
    score: 72,
    state: "empezar_pequeno",
    stateLabel: "Empezar pequeño",
    semaforo: "amarillo",
    message: "Tu base aguanta un aporte mensual pequeño y automático.",
    checklist: [],
  },
  protection: {
    score: 0,
    gaps: [],
    coverageByType: [],
    totalCoverage: 0,
    annualPremium: 0,
    activePolicies: 0,
  },
  balance: { offense: 60, defense: 40, message: "La ofensiva va por delante de la defensa." },
  portfolio: {
    totalInvested: 4_500_000,
    monthlyContribution: 150_000,
    distribution: [
      { label: "ETF", value: 3_000_000, color: "var(--c-invest)" },
      { label: "Cripto", value: 1_500_000, color: "var(--warn)" },
    ],
    diversification: "media",
    topConcentration: 0.67,
  },
  investments: [],
  holdings: [],
  policies: [],
  prices: {},
  currency: "CRC",
};

/**
 * El bloque de marcado que abre en `desde`, contando `<div>` para encontrar SU cierre.
 *
 * Hace falta porque acá no hay DOM: el entorno de estas pruebas es node y el repo no trae
 * `jsdom`. Contar divs es exacto sobre la salida de `renderToStaticMarkup` —que está bien
 * formada y no tiene divs autocerrados—, y es lo que permite decir «dentro del lienzo» en vez de
 * «en algún lugar entre el lienzo y el pie», que es una afirmación más floja.
 */
function bloque(html: string, clase: string): string {
  const abre = html.indexOf(`class="${clase}"`);
  if (abre < 0) return "";
  const i = html.lastIndexOf("<div", abre);
  let profundidad = 0;
  for (let cursor = i; cursor < html.length;) {
    const sig = html.indexOf("<div", cursor);
    const cierra = html.indexOf("</div>", cursor);
    if (cierra < 0) break;
    if (sig >= 0 && sig < cierra) {
      profundidad += 1;
      cursor = sig + 4;
      continue;
    }
    profundidad -= 1;
    cursor = cierra + 6;
    if (profundidad === 0) return html.slice(i, cursor);
  }
  return html.slice(i);
}

describe("la dona de growth-view: las notas al pie, fuera del lienzo", () => {
  const html = renderToStaticMarkup(<GrowthView summary={RESUMEN} />);

  it("el marco de la cartera está puesto, con lienzo y con pie", () => {
    // Si esto fallara, lo de abajo afirmaría sobre cadenas vacías y pasaría sin medir nada.
    expect(html, "no se pintó el marco de la distribución").toContain(
      "Distribución del portafolio",
    );
    expect(html, "no hay lienzo: el marco no llegó a montarse").toContain('class="cf-lienzo"');
    expect(html, "no hay pie: el slot `pie` quedó vacío").toContain('class="cf-pie"');
  });

  it("las tres notas se pintan, y las tres están en el pie", () => {
    const pie = bloque(html, "cf-pie");
    expect(pie.length, "el bloque del pie salió vacío").toBeGreaterThan(0);
    for (const nota of NOTAS) {
      expect(html, `la nota «${nota}» desapareció de la pantalla`).toContain(nota);
      expect(pie, `la nota «${nota}» no está en el pie del marco`).toContain(nota);
    }
  });

  it("ninguna nota está dentro del lienzo", () => {
    const lienzo = bloque(html, "cf-lienzo");
    expect(lienzo.length, "el bloque del lienzo salió vacío").toBeGreaterThan(0);
    // El lienzo tiene alto fijo: lo que se pinte dentro por encima de ese alto se sale de la
    // tarjeta. Es la invariante de la decisión 48, y es la que esta prueba custodia.
    for (const nota of NOTAS) {
      expect(lienzo, `la nota «${nota}» volvió al lienzo: se recortará`).not.toContain(nota);
    }
  });

  it("el lienzo conserva el alto del anillo, y el pie no se lo quita", () => {
    const lienzo = bloque(html, "cf-lienzo");
    // 132 es el anillo. `ajustadoAlContenido` deja que el lienzo valga lo que vale el anillo en
    // vez del piso de `ALTO_MINIMO`; que el pie viva fuera es lo que hace eso posible.
    expect(lienzo, "el lienzo dejó de declarar el alto del anillo").toContain("height:132px");
  });
});
