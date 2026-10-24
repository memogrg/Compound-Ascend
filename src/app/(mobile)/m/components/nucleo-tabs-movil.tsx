"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { eyebrowDeRuta, eyebrowRepiteTitulo, pestanasMovilDe } from "../lib/nav-v2-movil";

/**
 * Pestañas del núcleo en `/m`, bajo la barra superior. Detrás de `navV2Enabled()`: quien
 * las monta es `MobileHeader`, que decide por la bandera.
 *
 * NO es `role="tablist"`. Un tablist promete paneles que se intercambian en la misma
 * pantalla; esto son RUTAS, y anunciarlo así haría que un lector de pantalla esperara
 * flechas para moverse entre paneles que no existen. Son enlaces con `aria-current="page"`,
 * que es como se marca el destino actual — la misma decisión que se tomó en la web (#818).
 *
 * Son componentes de CLIENTE porque necesitan el pathname, y `MobileHeader` es de servidor
 * y lo usan 18 páginas que no se tocan. Resolverlo acá evita pasarle la ruta a cada una.
 */
export function NucleoTabsMovil() {
  const pathname = usePathname() ?? "/m";
  const searchParams = useSearchParams();
  const pestanas = pestanasMovilDe(pathname, searchParams?.toString() ?? null);

  // Menos de dos hermanas: `pestanasMovilDe` ya devuelve []. Una pestaña sola no es una
  // barra de pestañas, es el título repetido.
  if (pestanas.length === 0) return null;

  const nucleo = eyebrowDeRuta(pathname, searchParams?.toString() ?? null);

  return (
    <nav
      className="m-seg mn2-tabs"
      aria-label={nucleo ? `Secciones de ${nucleo}` : "Secciones"}
      style={{ marginBottom: 16 }}
    >
      {pestanas.map((p) => (
        <Link
          key={p.id}
          href={p.hrefM}
          className={`m-seg-item${p.activa ? " on" : ""}`}
          aria-current={p.activa ? "page" : undefined}
        >
          {p.name}
        </Link>
      ))}
    </nav>
  );
}

/**
 * El eyebrow del header, resuelto desde el modelo en vez de la cadena que pasa la página.
 *
 * Cae al `fallback` cuando la ruta no cuelga de un núcleo (Configuración, `/m/sin-plan`):
 * la prop `eyebrow` de las 18 páginas sigue existiendo y sigue siendo la que manda ahí.
 *
 * Y NO se pinta cuando diría lo mismo que el título que tiene debajo. Pasa en Patrimonio,
 * donde el núcleo y la pantalla se llaman igual: «PATRIMONIO» sobre «Patrimonio» no añade
 * jerarquía, solo repite. La comprobación se aplica al texto que se iba a mostrar —venga
 * del modelo o del `fallback`—, porque el problema es el mismo en los dos casos.
 *
 * SIN TÍTULO no se escribe TEXTO, y esa es la regla que evita el parpadeo. Un eyebrow
 * CUALIFICA a un título; sin título no cualifica nada, solo adivina. Quien monta este header
 * sin título es el esqueleto de `loading.tsx` —el título real llega con la página—, y en
 * `/m/patrimonio` el esqueleto pintaba «Patrimonio» (el núcleo) que la página borraba al
 * llegar ~200 ms después, porque ahí el núcleo y la pantalla se llaman igual: quien abría la
 * pantalla veía «Patrimonio / Patrimonio» un instante. Adivinar el eyebrow tiene el mismo
 * costo que adivinar el título, que es justo lo que `loading.tsx` no hace.
 *
 * Pero el RENGLÓN sí se reserva. Medido sobre las quince rutas de `/m` a 390 px, quitar el
 * eyebrow del esqueleto sin más dejaba el encabezado creciendo al llegar la página en seis de
 * ellas:
 *
 *   /m/mi-base-financiera  +13,16 px      /m/deudas       +15 px
 *   /m/inversiones         +13,16 px      /m/proteccion   +15 px
 *   /m/indicadores         +15 px         /m/mi-perfil-financiero  +30 px
 *
 * Un salto de 15 px en el encabezado empuja la pantalla entera justo cuando el dedo ya está
 * viajando hacia ella. El hueco va con un espacio de ancho cero: así lo alto de la caja lo
 * decide la MISMA tipografía que el eyebrow real, sin un `min-height` que haya que mantener
 * en sincronía con la fuente. `aria-hidden` porque no dice nada.
 */
export function EyebrowNucleo({ fallback, title }: { fallback?: string; title?: string }) {
  const pathname = usePathname() ?? "/m";
  const searchParams = useSearchParams();
  if (!title) return <div className="ov ov-reserva" aria-hidden="true" />;
  const texto = eyebrowDeRuta(pathname, searchParams?.toString() ?? null) ?? fallback;
  if (!texto || eyebrowRepiteTitulo(texto, title)) return null;
  return <div className="ov">{texto}</div>;
}
