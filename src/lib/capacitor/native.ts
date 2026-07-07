/**
 * Puente mínimo hacia Capacitor para el sitio remoto (no bundleado con Capacitor).
 *
 * El runtime nativo de Capacitor INYECTA `window.Capacitor` en la WebView incluso
 * cuando esta carga una URL remota (server.url = carteraplus.vercel.app). Por eso el
 * sitio puede llamar a los plugins vía `window.Capacitor.Plugins.*` SIN importar los
 * npm de `@capacitor/*` en el bundle de Next: los plugins viven en el shell nativo
 * (mobile-shell). Fuera de la app (web normal / SSR) todo degrada a no-op / null, así
 * que el build y el runtime web no se ven afectados.
 *
 * Se usa solo desde componentes cliente (/m/login). Los tipos son un subconjunto
 * mínimo de las superficies de @capacitor/app y @capacitor/browser que consumimos.
 */

export type PluginListenerHandle = { remove: () => Promise<void> };

type AppUrlOpenEvent = { url: string };

type CapacitorAppPlugin = {
  addListener(
    eventName: "appUrlOpen",
    listener: (event: AppUrlOpenEvent) => void,
  ): Promise<PluginListenerHandle>;
};

type CapacitorBrowserPlugin = {
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
};

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    App?: CapacitorAppPlugin;
    Browser?: CapacitorBrowserPlugin;
  };
};

declare global {
  interface Window {
    Capacitor?: CapacitorBridge;
  }
}

function bridge(): CapacitorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return window.Capacitor;
}

/** true solo cuando el código corre DENTRO de la app Capacitor (WebView nativo). */
export function isCapacitor(): boolean {
  return bridge()?.isNativePlatform?.() === true;
}

/** Plugin App (deep links / appUrlOpen). null fuera de la app nativa. */
export function capacitorApp(): CapacitorAppPlugin | null {
  return bridge()?.Plugins?.App ?? null;
}

/** Plugin Browser (navegador del sistema: Custom Tabs / SFSafariViewController). null fuera de la app nativa. */
export function capacitorBrowser(): CapacitorBrowserPlugin | null {
  return bridge()?.Plugins?.Browser ?? null;
}
