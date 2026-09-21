/**
 * El modelo de navegación v2 (`src/lib/constants/nav-v2.ts`).
 *
 * Lo que estos tests sostienen, y que ningún tipo puede sostener solo:
 *  1. **Las rutas existen.** Un `href` del modelo sin su `page.tsx` es un 404 que nadie ve
 *     hasta que alguien hace clic. Se comprueba contra el árbol de `src/app/`.
 *  2. **Nada queda huérfano.** Toda entrada de la v1 (`NAV`/`BOTTOM_NAV` y el `MENU` privado
 *     del móvil) está representada en la v2. Cuando el menú viejo se borre, este test es la
 *     prueba de que no se perdió un destino por el camino.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, vi, afterEach } from "vitest";

import { NAV, BOTTOM_NAV } from "@/lib/constants/nav";
import {
  NUCLEOS,
  CONFIGURACION,
  BOTTOM_NAV_V2,
  nucleoDeRuta,
  pestanaDeRuta,
  breadcrumb,
  aMovil,
  aWeb,
  rutasDelModelo,
  type Pestana,
} from "@/lib/constants/nav-v2";
import { navV2Enabled } from "@/lib/flags";

const RAIZ = process.cwd();
const TODAS_LAS_PESTANAS: Pestana[] = [...NUCLEOS.flatMap((n) => [...n.tabs]), ...CONFIGURACION];

/** "/gastos?x=1#y" → "/gastos". El disco no sabe de query ni de hash. */
const soloRuta = (href: string) => (href.split("#")[0] ?? "").split("?")[0] ?? "";

/**
 * ¿Existe un `page.tsx` para esta ruta? Los grupos de App Router —`(dashboard)`, `(mobile)`,
 * `(app)`— no aparecen en la URL, así que hay que probar cada combinación posible en vez de
 * traducir la ruta a una sola carpeta.
 */
function tienePagina(ruta: string): boolean {
  const limpia = soloRuta(ruta).replace(/^\//, "");
  const bases = ["src/app/(dashboard)", "src/app/(mobile)", "src/app/(mobile)/m/(app)", "src/app"];
  return bases.some((base) => {
    // Para las móviles, "/m/gastos" vive en "(mobile)/m/(app)/gastos": el "m/" sobra cuando
    // la base ya lo incluye. Y "/m" a secas es la RAÍZ de ese grupo —"(mobile)/m/(app)/page.tsx"—,
    // así que la barra del prefijo tiene que ser opcional o "m" no se convierte en "".
    const candidatos = base.endsWith("/(app)") ? [limpia.replace(/^m\/?/, "")] : [limpia];
    return candidatos.some((c) =>
      existsSync(path.join(RAIZ, base, c, "page.tsx")),
    );
  });
}

describe("estructura", () => {
  it("son 5 núcleos, en el orden Hoy/Flujo/Planes/Patrimonio/Asesor", () => {
    expect(NUCLEOS.map((n) => n.name)).toEqual(["Hoy", "Flujo", "Planes", "Patrimonio", "Asesor"]);
    expect(NUCLEOS.map((n) => n.id)).toEqual(["hoy", "flujo", "planes", "patrimonio", "asesor"]);
  });

  it("los ids de los núcleos son únicos", () => {
    const ids = NUCLEOS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los ids de las pestañas son únicos DENTRO de cada núcleo", () => {
    // Entre núcleos sí se repiten a propósito ("resumen" está en Flujo y en Patrimonio):
    // la clave real es el par núcleo+pestaña.
    for (const n of NUCLEOS) {
      const ids = n.tabs.map((t) => t.id);
      expect(new Set(ids).size, `núcleo ${n.id}`).toBe(ids.length);
    }
  });

  it("los ids de configuración son únicos", () => {
    const ids = CONFIGURACION.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("BOTTOM_NAV_V2 son los mismos 5 núcleos, derivados y no copiados", () => {
    expect(BOTTOM_NAV_V2).toBe(NUCLEOS);
  });

  it("una pestaña sin href está marcada nueva o futura (y al revés)", () => {
    for (const p of TODAS_LAS_PESTANAS) {
      if (p.status === "existente") expect(p.href, `pestaña ${p.id}`).not.toBeNull();
      else expect(p.href, `pestaña ${p.id}`).toBeNull();
    }
  });
});

describe("las rutas del modelo existen en el disco", () => {
  it("cada href de una pestaña existente tiene su page.tsx", () => {
    const faltan = TODAS_LAS_PESTANAS.filter(
      (p) => p.status === "existente" && p.href && !tienePagina(p.href),
    ).map((p) => `${p.id} → ${p.href}`);
    expect(faltan).toEqual([]);
  });

  it("cada hrefM tiene su page.tsx bajo (mobile)", () => {
    const faltan = TODAS_LAS_PESTANAS.filter((p) => p.hrefM && !tienePagina(p.hrefM)).map(
      (p) => `${p.id} → ${p.hrefM}`,
    );
    expect(faltan).toEqual([]);
  });

  it("control negativo: tienePagina sabe decir que NO", () => {
    // Sin esto, un `tienePagina` que devolviera siempre true dejaría pasar los tres tests
    // de arriba sin comprobar nada.
    expect(tienePagina("/ruta/que/no/existe")).toBe(false);
    expect(tienePagina("/m/ruta-inventada")).toBe(false);
    expect(tienePagina("/dashboard")).toBe(true);
    expect(tienePagina("/m")).toBe(true);
  });

  it("los href/hrefM de los propios núcleos también existen", () => {
    const faltan = NUCLEOS.flatMap((n) =>
      [n.href, n.hrefM].filter((r) => !tienePagina(r)).map((r) => `${n.id} → ${r}`),
    );
    expect(faltan).toEqual([]);
  });
});

describe("cobertura de la v1: nada queda huérfano", () => {
  /** Los href del modelo v2, ya sin query ni hash, para comparar rutas con rutas. */
  const enV2 = new Set(rutasDelModelo().map(soloRuta));

  it("todo href de NAV y BOTTOM_NAV (web) está representado en la v2", () => {
    const v1 = [...NAV.flatMap((g) => g.items), ...BOTTOM_NAV].map((i) => i.href);
    expect([...new Set(v1)].filter((h) => !enV2.has(soloRuta(h)))).toEqual([]);
  });

  it("todo href del MENU del móvil está representado en la v2", () => {
    // MENU no se exporta (es un `const` privado de mobile-menu.tsx); se lee del fuente.
    // Si algún día se exporta, este test debería importarlo en vez de parsearlo.
    const fuente = readFileSync(
      path.join(RAIZ, "src/app/(mobile)/m/components/mobile-menu.tsx"),
      "utf8",
    );
    const bloque = fuente.slice(fuente.indexOf("const MENU"), fuente.indexOf("export function"));
    const hrefs = [...bloque.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs.length, "no se extrajo ningún href del MENU").toBeGreaterThan(10);

    // Exclusiones justificadas. Vacía hoy: toda entrada del menú móvil tiene sitio en la v2.
    const excluidas = new Set<string>([]);
    const huerfanas = [...new Set(hrefs)].filter((h) => !enV2.has(soloRuta(h)) && !excluidas.has(h));
    expect(huerfanas).toEqual([]);
  });
});

describe("pestanaDeRuta", () => {
  it("resuelve una ruta simple", () => {
    const par = pestanaDeRuta("/gastos");
    expect(par?.nucleo.id).toBe("flujo");
    expect(par?.pestana.id).toBe("gastos");
  });

  it("?tab=progreso resuelve a Progreso, no a Acciones", () => {
    expect(pestanaDeRuta("/mis-acciones", "?tab=progreso")?.pestana.id).toBe("progreso");
    expect(pestanaDeRuta("/mis-acciones", "tab=progreso")?.pestana.id).toBe("progreso");
  });

  it("la misma ruta SIN tab resuelve a la pestaña desnuda", () => {
    expect(pestanaDeRuta("/mis-acciones")?.pestana.id).toBe("acciones");
  });

  it("/patrimonio/proteccion NO resuelve a /patrimonio (match más largo primero)", () => {
    expect(pestanaDeRuta("/patrimonio/proteccion")?.pestana.id).toBe("proteccion");
    expect(pestanaDeRuta("/patrimonio")?.pestana.id).toBe("inversiones");
    expect(pestanaDeRuta("/patrimonio/indicadores")?.pestana.id).toBe("indicadores");
  });

  it("una ruta fuera del modelo devuelve null", () => {
    expect(pestanaDeRuta("/dev/ui")).toBeNull();
    expect(nucleoDeRuta("/dev/ui")).toBeNull();
  });

  it("nucleoDeRuta devuelve el núcleo de la pestaña", () => {
    expect(nucleoDeRuta("/deudas")?.id).toBe("planes");
    expect(nucleoDeRuta("/asistente")?.id).toBe("asesor");
  });
});

describe("breadcrumb", () => {
  it("da [núcleo, pestaña]", () => {
    expect(breadcrumb("/gastos")).toEqual(["Flujo", "Gastos y sobres"]);
    expect(breadcrumb("/mis-acciones", "?tab=progreso")).toEqual(["Hoy", "Progreso"]);
  });

  it("vacío cuando la ruta no está en el modelo", () => {
    expect(breadcrumb("/dev/ui")).toEqual([]);
  });
});

describe("aMovil / aWeb", () => {
  it("ida y vuelta para toda pestaña con par", () => {
    for (const p of TODAS_LAS_PESTANAS) {
      if (!p.href || !p.hrefM) continue;
      expect(aMovil(p.href), `aMovil(${p.href})`).toBe(p.hrefM);
      expect(aWeb(p.hrefM), `aWeb(${p.hrefM})`).toBe(p.href);
    }
  });

  it("null donde no hay par", () => {
    // Suscripción no tiene pantalla móvil; Recurrentes no existe todavía en ningún lado.
    expect(aMovil("/suscripcion")).toBeNull();
    expect(aMovil("/ruta/inventada")).toBeNull();
    expect(aWeb("/m/ruta/inventada")).toBeNull();
  });

  it("el hash distingue Fondos de Protección, que comparten pantalla", () => {
    expect(aMovil("/patrimonio/proteccion#fondos")).toBe("/m/proteccion#fondos");
    expect(aMovil("/patrimonio/proteccion")).toBe("/m/proteccion");
  });
});

describe("rutasDelModelo", () => {
  it("no trae nulos ni repetidos", () => {
    const rutas = rutasDelModelo();
    expect(rutas.every((r) => typeof r === "string" && r.startsWith("/"))).toBe(true);
    expect(new Set(rutas).size).toBe(rutas.length);
  });
});

describe("navV2Enabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("apagada por defecto", () => {
    vi.stubEnv("NEXT_PUBLIC_NAV_V2", "");
    expect(navV2Enabled()).toBe(false);
  });

  it('encendida solo con "1"', () => {
    vi.stubEnv("NEXT_PUBLIC_NAV_V2", "1");
    expect(navV2Enabled()).toBe(true);
  });

  it('"true" o "0" NO la encienden', () => {
    vi.stubEnv("NEXT_PUBLIC_NAV_V2", "true");
    expect(navV2Enabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_NAV_V2", "0");
    expect(navV2Enabled()).toBe(false);
  });
});
