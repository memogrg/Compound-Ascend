/**
 * El modelo de navegación v2, visto desde la app móvil. Puro: sin React, sin IO.
 *
 * No declara ningún destino: los deriva de `nav-v2.ts`, que ya es la fuente única. Si
 * mañana una pestaña cambia de ruta, `/m` la sigue sola — y el test lo obliga.
 *
 * Por qué vive acá y no en `src/lib/`: solo lo usa el shell móvil. La tabla web↔móvil que
 * consume (`aMovil`/`aWeb`) sí es compartida.
 *
 * OJO: no sustituye a `rutas-web-a-mobile.ts`, que traduce enlaces sueltos y sigue siendo
 * el que usa el resto de `/m`. Unificar los dos es un `refactor/` aparte, ya anotado.
 */
import type { IconName } from "@/components/ui/icon";
import {
  CONFIGURACION,
  NUCLEOS,
  aMovil,
  aWeb,
  nucleoDeRuta,
  pestanaDeRuta,
  type Pestana,
} from "@/lib/constants/nav-v2";

export type ItemDrawer = { id: string; name: string; hrefM: string };
export type GrupoDrawer = { id: string; label: string; icon: IconName; items: ItemDrawer[] };
export type PestanaMovil = { id: string; name: string; hrefM: string; activa: boolean };

/** Quita query y hash. El `pathname` de Next ya viene limpio; esto cubre a quien no. */
function soloRuta(ruta: string): string {
  return (ruta.split("#")[0] ?? "").split("?")[0] ?? "";
}

/**
 * Ruta móvil de una pestaña, o `null` si no tiene par.
 *
 * Se resuelve con `aMovil` sobre la ruta WEB y no leyendo `pestana.hrefM` directo, aunque
 * el resultado sea el mismo hoy: así el emparejamiento pasa siempre por la tabla del
 * modelo, y una pestaña que pierda su par lo pierde en los dos sitios a la vez.
 */
function rutaMovil(pestana: Pestana): string | null {
  // `futura` y `nueva` no son destinos: su pantalla todavía no existe. `libertad` tiene
  // `hrefM` pero es `futura`, así que se queda fuera por esto y no por falta de par.
  if (pestana.status !== "existente" || !pestana.href) return null;
  return aMovil(pestana.href);
}

function itemsDe(pestanas: readonly Pestana[]): ItemDrawer[] {
  return pestanas.flatMap((p) => {
    const hrefM = rutaMovil(p);
    return hrefM ? [{ id: p.id, name: p.name, hrefM }] : [];
  });
}

/**
 * Los grupos del drawer ☰ bajo el modelo v2: los cinco núcleos en su orden, más
 * Configuración.
 *
 * Quedan fuera, y no por olvido:
 *  - `suscripcion` — no tiene ruta móvil a propósito: su camino acaba en Stripe, prohibido
 *    dentro de la app (Apple 3.1.1). El móvil tiene `/m/sin-plan` en su lugar.
 *  - `recurrentes` — pantalla que todavía no existe (`nueva`).
 *  - `libertad` — `futura`.
 *
 * Un grupo sin items no se devuelve: un encabezado vacío no es información.
 */
export function gruposDrawerV2(): GrupoDrawer[] {
  const grupos: GrupoDrawer[] = NUCLEOS.map((n) => ({
    id: n.id,
    label: n.name,
    icon: n.icon,
    items: itemsDe(n.tabs),
  }));
  grupos.push({
    id: "configuracion",
    label: "Configuración",
    icon: "gear",
    items: itemsDe(CONFIGURACION),
  });
  return grupos.filter((g) => g.items.length > 0);
}

/**
 * La pestaña del modelo que corresponde a una ruta MÓVIL, con su núcleo.
 *
 * Traduce a web y delega en `pestanaDeRuta` en vez de repetir su desempate por `?tab=`:
 * el parámetro es el mismo en las dos columnas (`/mis-acciones?tab=progreso` ↔
 * `/m/mis-acciones?tab=progreso`), así que el `search` viaja tal cual.
 */
function parDeRutaMovil(pathname: string, search?: string | null) {
  const web = aWeb(soloRuta(pathname));
  return web ? pestanaDeRuta(web, search) : null;
}

/**
 * Nombre del núcleo de la ruta móvil actual, para el eyebrow del header.
 *
 * `null` cuando la ruta no está en el modelo o no pertenece a un núcleo — Configuración,
 * por ejemplo: `/m/perfil` existe en la tabla pero no cuelga de ningún núcleo, y ahí el
 * header conserva el eyebrow que le pase la página.
 */
export function eyebrowDeRuta(pathname: string, search?: string | null): string | null {
  const web = aWeb(soloRuta(pathname));
  return web ? (nucleoDeRuta(web, search)?.name ?? null) : null;
}

/**
 * Las hermanas de la ruta móvil actual dentro de su núcleo, con la activa marcada.
 *
 * Devuelve `[]` con menos de dos: una sola pestaña no es una barra de pestañas, es un
 * título repetido (le pasa a Asesor, que tiene una).
 */
export function pestanasMovilDe(pathname: string, search?: string | null): PestanaMovil[] {
  const par = parDeRutaMovil(pathname, search);
  if (!par) return [];

  const hermanas = itemsDe(par.nucleo.tabs);
  if (hermanas.length < 2) return [];

  return hermanas.map((h) => ({ ...h, activa: h.id === par.pestana.id }));
}
