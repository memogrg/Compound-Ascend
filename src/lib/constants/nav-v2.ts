/**
 * Modelo ÚNICO de navegación v2: web y móvil en la misma tabla.
 *
 * La v1 (`nav.ts`) tiene dos fuentes que se copian a mano —`NAV`/`BOTTOM_NAV` para el
 * sidebar y un `MENU` privado dentro de `mobile-menu.tsx`—, así que una ruta nueva hay que
 * escribirla en dos sitios y nada avisa cuando se olvida uno. Acá el par web/móvil es un
 * dato: cada pestaña lleva su `href` y su `hrefM`, y `tests/unit/nav-v2.test.ts` comprueba
 * que las dos existan como `page.tsx` y que ninguna entrada de la v1 quede huérfana.
 *
 * Este fichero NO se consume todavía: la fase 1 lo crea y lo prueba; `sidebar.tsx`,
 * `bottom-nav.tsx` y `mobile-menu.tsx` siguen leyendo la v1 hasta el delta sidebar-v2,
 * detrás de `navV2Enabled()` (`@/lib/flags`).
 *
 * Puro y client-safe: solo tipos, datos y funciones sin IO. Sin React, sin `server-only`.
 */
import type { IconName } from "@/components/ui/icon";

/**
 * - `existente`: la pantalla ya está en producción y la ruta responde hoy.
 * - `nueva`: entra en una fase posterior; `href` va en `null` hasta que exista.
 * - `futura`: el contenido YA existe pero todavía no tiene ruta propia (vive dentro de
 *   otra pantalla); `href` en `null` hasta que se extraiga.
 */
export type EstadoPestana = "existente" | "nueva" | "futura";

/** Contador que el núcleo muestra en su chip. Lo resuelve quien pinta, no este modelo. */
export type BadgeKey = "acciones" | "porRevisar" | "metasRiesgo";

export type Pestana = {
  id: string;
  name: string;
  /** Ruta web. `null` mientras la pantalla no exista (status `nueva` o `futura`). */
  href: string | null;
  /** Ruta móvil equivalente. `null` cuando no hay par. */
  hrefM?: string | null;
  status: EstadoPestana;
  nota?: string;
};

export type Nucleo = {
  id: string;
  name: string;
  icon: IconName;
  href: string;
  hrefM: string;
  badgeKey?: BadgeKey;
  tabs: readonly Pestana[];
};

/**
 * Los cinco núcleos, en el orden en que se pintan.
 *
 * Iconos: se usan los `IconName` que YA existen. Ninguno de los cinco tiene todavía su
 * dibujo propio, así que se toma el más cercano y queda anotado para el delta sidebar-v2:
 *   · hoy        → falta una CASA; se usa `dashboard`.
 *   · flujo      → faltan las FLECHAS de entrada/salida; se usa `txn`.
 *   · planes     → falta una BANDERA; se usa `savings`.
 *   · patrimonio → falta la COLUMNA/edificio; se usa `networth`.
 *   · asesor     → falta el ISOTIPO C+; se usa `spark`.
 */
export const NUCLEOS: readonly Nucleo[] = [
  {
    id: "hoy",
    name: "Hoy",
    icon: "dashboard",
    href: "/dashboard",
    hrefM: "/m",
    badgeKey: "acciones",
    tabs: [
      { id: "panel", name: "Panel", href: "/dashboard", hrefM: "/m", status: "existente" },
      {
        id: "acciones",
        name: "Acciones",
        href: "/mis-acciones",
        hrefM: "/m/mis-acciones",
        status: "existente",
      },
      {
        id: "progreso",
        name: "Progreso",
        href: "/mis-acciones?tab=progreso",
        hrefM: "/m/mis-acciones?tab=progreso",
        status: "existente",
      },
    ],
  },
  {
    id: "flujo",
    name: "Flujo",
    icon: "txn",
    href: "/mi-base-financiera",
    hrefM: "/m/mi-base-financiera",
    badgeKey: "porRevisar",
    tabs: [
      {
        id: "resumen",
        name: "Resumen",
        href: "/mi-base-financiera",
        hrefM: "/m/mi-base-financiera",
        status: "existente",
      },
      {
        id: "ingresos",
        name: "Ingresos",
        href: "/ingresos",
        hrefM: "/m/ingresos",
        status: "existente",
      },
      {
        id: "gastos",
        name: "Gastos y sobres",
        href: "/gastos",
        hrefM: "/m/gastos",
        status: "existente",
      },
      {
        id: "transacciones",
        name: "Transacciones",
        href: "/transacciones",
        hrefM: "/m/transacciones",
        status: "existente",
      },
      {
        id: "recurrentes",
        name: "Recurrentes",
        href: null,
        hrefM: null,
        status: "nueva",
        nota: "cobros y pagos recurrentes",
      },
    ],
  },
  {
    id: "planes",
    name: "Planes",
    icon: "savings",
    href: "/control-financiero",
    hrefM: "/m/metas",
    badgeKey: "metasRiesgo",
    tabs: [
      {
        id: "metas",
        name: "Metas",
        href: "/control-financiero",
        hrefM: "/m/metas",
        status: "existente",
      },
      { id: "deudas", name: "Deudas", href: "/deudas", hrefM: "/m/deudas", status: "existente" },
      {
        id: "fondos",
        name: "Fondos",
        // Ancla dentro de Protección, no pantalla propia: `pestanaDeRuta` nunca la devuelve
        // (el pathname no lleva hash). Es un DESTINO del menú, no un estado de ruta.
        href: "/patrimonio/proteccion#fondos",
        hrefM: "/m/proteccion#fondos",
        status: "existente",
        nota: "fondo de emergencia y de paz",
      },
    ],
  },
  {
    id: "patrimonio",
    name: "Patrimonio",
    icon: "networth",
    href: "/mi-rich-life",
    hrefM: "/m/patrimonio",
    tabs: [
      {
        id: "resumen",
        name: "Resumen",
        href: "/mi-rich-life",
        hrefM: "/m/patrimonio",
        status: "existente",
      },
      {
        id: "inversiones",
        name: "Inversiones",
        href: "/patrimonio",
        hrefM: "/m/inversiones",
        status: "existente",
        nota: "ruta futura /patrimonio/inversiones",
      },
      {
        id: "proteccion",
        name: "Protección",
        href: "/patrimonio/proteccion",
        hrefM: "/m/proteccion",
        status: "existente",
      },
      {
        id: "libertad",
        name: "Libertad",
        href: null,
        hrefM: "/m/libertad",
        status: "futura",
        nota: "en web vive dentro de /mi-rich-life; en móvil ya tiene pantalla propia",
      },
      {
        id: "indicadores",
        name: "Indicadores",
        href: "/patrimonio/indicadores",
        hrefM: "/m/indicadores",
        status: "existente",
      },
    ],
  },
  {
    id: "asesor",
    name: "Asesor",
    icon: "spark",
    href: "/asistente",
    hrefM: "/m/asistente",
    tabs: [
      { id: "chat", name: "Chat", href: "/asistente", hrefM: "/m/asistente", status: "existente" },
    ],
  },
] as const;

/** Pie de la navegación: no son núcleos y no aparecen en la barra inferior. */
export const CONFIGURACION: readonly Pestana[] = [
  {
    id: "perfil-financiero",
    name: "Perfil financiero",
    href: "/mi-perfil-financiero",
    hrefM: "/m/mi-perfil-financiero",
    status: "existente",
  },
  {
    id: "cuenta",
    name: "Cuenta y plan",
    href: "/configuracion",
    hrefM: "/m/perfil",
    status: "existente",
  },
  {
    id: "asistentes",
    name: "Asistentes de configuración",
    href: "/configurar",
    hrefM: "/m/configurar",
    status: "existente",
  },
  {
    id: "suscripcion",
    name: "Suscripción",
    href: "/suscripcion",
    hrefM: null,
    status: "existente",
  },
] as const;

/** Barra inferior del móvil: los cinco núcleos. Derivada, nunca una copia a mano. */
export const BOTTOM_NAV_V2: readonly Nucleo[] = NUCLEOS;

// ── Helpers puros ────────────────────────────────────────────────────────────────────────

/** Parte "/gastos?x=1#y" en su pathname. Acepta que ya venga limpio. */
function soloRuta(href: string): string {
  const sinHash = href.split("#")[0] ?? "";
  return sinHash.split("?")[0] ?? "";
}

/** `?tab=progreso` → "progreso". Acepta la query con o sin "?". */
function tabDe(search?: string | null): string | null {
  if (!search) return null;
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab");
}

type Par = { nucleo: Nucleo; pestana: Pestana };

/** Todas las pestañas con su núcleo, en orden de declaración. */
function paresDeclarados(): Par[] {
  return NUCLEOS.flatMap((nucleo) => nucleo.tabs.map((pestana) => ({ nucleo, pestana })));
}

/**
 * Qué pestaña corresponde a una ruta.
 *
 * Dos reglas que no son obvias:
 *  1. **Match más largo primero.** `/patrimonio/proteccion` tiene que resolver a Protección
 *     y NO a Inversiones (`/patrimonio`), que es prefijo suyo.
 *  2. **La query desempata.** `/mis-acciones` y `/mis-acciones?tab=progreso` comparten
 *     pathname; gana la pestaña cuyo `?tab=` coincide, y si no hay `?tab=` en la URL, la
 *     que tampoco lo declara.
 */
export function pestanaDeRuta(pathname: string, search?: string | null): Par | null {
  const ruta = soloRuta(pathname);
  const tab = tabDe(search);

  const candidatos = paresDeclarados()
    // Las pestañas-ancla (`#fondos`) quedan fuera: comparten pantalla con otra pestaña y el
    // pathname no lleva hash, así que competirían por una ruta que no es suya.
    .filter((p) => p.pestana.href !== null && !p.pestana.href.includes("#"))
    .filter((p) => soloRuta(p.pestana.href ?? "") === ruta)
    // Más específico primero: el que declara `?tab=` antes que el que no.
    .sort((a, b) => (b.pestana.href ?? "").length - (a.pestana.href ?? "").length);

  if (candidatos.length === 0) return null;

  const conTab = candidatos.find((p) => {
    const suyo = tabDe((p.pestana.href ?? "").split("?")[1] ?? null);
    return suyo !== null && suyo === tab;
  });
  if (conTab) return conTab;

  // Sin `?tab=` que case: la pestaña "desnuda" de esa ruta.
  const sinTab = candidatos.find((p) => !(p.pestana.href ?? "").includes("?"));
  return sinTab ?? candidatos[0] ?? null;
}

/** El núcleo al que pertenece una ruta, o `null` si la ruta no está en el modelo. */
export function nucleoDeRuta(pathname: string, search?: string | null): Nucleo | null {
  return pestanaDeRuta(pathname, search)?.nucleo ?? null;
}

/** `["Flujo", "Gastos y sobres"]`. Vacío si la ruta no está en el modelo. */
export function breadcrumb(pathname: string, search?: string | null): string[] {
  const par = pestanaDeRuta(pathname, search);
  return par ? [par.nucleo.name, par.pestana.name] : [];
}

/**
 * Tabla plana web↔móvil. Se construye de los núcleos Y de configuración, porque el par
 * también hace falta fuera de la navegación principal (p. ej. `/configuracion` ↔ `/m/perfil`).
 */
function paresWebMovil(): Array<{ href: string; hrefM: string }> {
  const todas: Pestana[] = [...NUCLEOS.flatMap((n) => [...n.tabs]), ...CONFIGURACION];
  return todas.flatMap((p) => (p.href && p.hrefM ? [{ href: p.href, hrefM: p.hrefM }] : []));
}

/** Ruta móvil equivalente, o `null` si esa pantalla no tiene par. */
export function aMovil(href: string): string | null {
  return paresWebMovil().find((p) => p.href === href)?.hrefM ?? null;
}

/** Ruta web equivalente, o `null` si esa pantalla no tiene par. */
export function aWeb(hrefM: string): string | null {
  return paresWebMovil().find((p) => p.hrefM === hrefM)?.href ?? null;
}

/** Todos los destinos del modelo (web y móvil), sin nulos y sin repetidos. */
export function rutasDelModelo(): string[] {
  const todas: Pestana[] = [...NUCLEOS.flatMap((n) => [...n.tabs]), ...CONFIGURACION];
  const salida = new Set<string>();
  for (const n of NUCLEOS) {
    salida.add(n.href);
    salida.add(n.hrefM);
  }
  for (const p of todas) {
    if (p.href) salida.add(p.href);
    if (p.hrefM) salida.add(p.hrefM);
  }
  return [...salida];
}
