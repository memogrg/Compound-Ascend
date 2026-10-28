import { capacitorBrowser, capacitorPlatform } from "@/lib/capacitor/native";
import { onAppResume } from "../../lib/app-lock";

/**
 * Abre la página de suscripciones de la tienda.
 *
 * En Android NO va por el Custom Tab: `play.google.com` lo reclama la app Play Store, así que
 * Chrome le pasa la URL y el tab queda vacío detrás. Al cerrar Play Store se volvía a ese tab
 * en blanco varios segundos antes de ver la app. Navegando el WebView a la URL, Capacitor ve un
 * host ajeno y lanza un intent ACTION_VIEW (`Bridge.launchIntent`): Play Store abre directo y
 * el WebView no se mueve de la pantalla.
 *
 * En iOS sigue el navegador in-app (SFSafariViewController), que no tiene ese problema.
 */
export async function abrirGestionTienda(url: string): Promise<void> {
  if (capacitorPlatform() === "android") {
    window.location.href = url;
    return;
  }
  const browser = capacitorBrowser();
  if (browser) await browser.open({ url }).catch(() => window.open(url, "_blank"));
  else window.open(url, "_blank");
}

let esperandoVuelta = false;

/**
 * Al volver de la tienda, relee la pantalla UNA vez (el plan puede haber cambiado). Se usa
 * `resume` y no `browserFinished` porque en Android ya no hay Custom Tab que lo dispare. Tocar
 * «Gestionar» dos veces antes de volver no arma dos escuchas.
 */
export function refrescarAlVolver(refrescar: () => void): void {
  if (esperandoVuelta) return;
  esperandoVuelta = true;
  let handle: { remove: () => Promise<void> } | null = null;
  let disparado = false;
  onAppResume(() => {
    if (disparado) return;
    disparado = true;
    esperandoVuelta = false;
    void handle?.remove();
    refrescar();
  })
    .then((h) => {
      handle = h;
      if (disparado) void h.remove();
    })
    .catch(() => {
      esperandoVuelta = false;
    });
}
