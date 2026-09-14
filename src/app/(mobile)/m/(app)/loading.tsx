import { MobileHeader } from "../components/mobile-header";

/**
 * Esqueleto de las pantallas autenticadas del móvil. Next lo muestra mientras el
 * servidor resuelve la página; sin él, el WebView se queda con la pantalla anterior
 * y en una conexión lenta parece que el toque no registró.
 *
 * Va en (app) y no en m/: /m/login y /m/signup no piden datos, así que un esqueleto
 * ahí sería un parpadeo sin motivo.
 *
 * Header sin título a propósito: el título real llega con la página y escribir uno
 * aquí obligaría a adivinarlo, con el costo de mostrar el equivocado por un instante.
 * Los tres bloques son los altos que más se repiten (resumen, cuerpo, secundario) —
 * no calcan ninguna pantalla, solo evitan que el contenido salte al llegar.
 */
export default function MobileAppLoading() {
  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" />
        <div aria-busy="true" style={{ display: "grid", gap: 12 }}>
          <span className="sr-only">Cargando</span>
          <div className="m-skel" style={{ height: 88 }} aria-hidden />
          <div className="m-skel" style={{ height: 140 }} aria-hidden />
          <div className="m-skel" style={{ height: 88 }} aria-hidden />
        </div>
      </div>
    </div>
  );
}
