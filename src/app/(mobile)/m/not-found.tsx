import { MobileHeader } from "./components/mobile-header";
import { MEmptyState } from "./components/content-kit";

/**
 * 404 de /m. Sin esto, una URL desconocida caía en app/not-found.tsx, que ofrece volver
 * a /dashboard: dentro del WebView eso abre el escritorio, y si la cuenta no tiene plan
 * el middleware la manda a /empezar, que lleva a pagar fuera de la tienda. Rechazo 2.1
 * y, además, Apple 3.1.1.
 *
 * Atiende dos casos: un `notFound()` lanzado desde cualquier pantalla del subárbol, y
 * —vía el catch-all de [...rest]— una URL que no existe bajo /m.
 */
export default function MobileNotFound() {
  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" title="No encontrada" />
        <MEmptyState
          icon="search"
          title="Esta pantalla no existe"
          description="Puede que el enlace esté viejo o incompleto."
          actionLabel="Ir al inicio"
          actionHref="/m"
        />
      </div>
    </div>
  );
}
