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
 */
export function EyebrowNucleo({ fallback, title }: { fallback?: string; title?: string }) {
  const pathname = usePathname() ?? "/m";
  const searchParams = useSearchParams();
  const texto = eyebrowDeRuta(pathname, searchParams?.toString() ?? null) ?? fallback;
  if (!texto || eyebrowRepiteTitulo(texto, title)) return null;
  return <div className="ov">{texto}</div>;
}
