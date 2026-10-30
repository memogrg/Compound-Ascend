/**
 * Puente mínimo hacia Capacitor para el sitio remoto (no bundleado con Capacitor).
 *
 * El runtime nativo de Capacitor INYECTA `window.Capacitor` en la WebView incluso
 * cuando esta carga una URL remota (server.url = carteraplus.aitechumbrella.com). Por eso el
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

/** `canGoBack` lo calcula Capacitor con el historial de la WebView, no el de Next. */
type BackButtonEvent = { canGoBack: boolean };

type CapacitorAppPlugin = {
  addListener(
    eventName: "appUrlOpen",
    listener: (event: AppUrlOpenEvent) => void,
  ): Promise<PluginListenerHandle>;
  /** Botón Atrás de Android. Registrar un listener DESACTIVA el comportamiento por
   *  defecto de Capacitor (history.back() o cerrar la app): a partir de ahí lo decide
   *  el listener. Solo existe en Android. */
  addListener(
    eventName: "backButton",
    listener: (event: BackButtonEvent) => void,
  ): Promise<PluginListenerHandle>;
  /** Cierra la app. Solo Android: en iOS, salir por código es causal de rechazo. */
  exitApp(): Promise<void>;
};

type CapacitorBrowserPlugin = {
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
};

/** Subconjunto de @capgo/capacitor-social-login que consumimos (login Google y Apple nativos
 *  por idToken). El plugin vive en el shell nativo (mobile-shell); aquí solo tipamos el puente. */
type SocialLoginPlugin = {
  initialize(options: {
    google?: { iOSClientId?: string; webClientId?: string; mode?: "online" | "offline" };
    /** En iOS `redirectUrl: ""` evita el redirect y `clientId` no hace falta: usa el bundle id.
     *  `useProperTokenExchange` no se toca —el idToken viene igual en los dos modos y es lo
     *  único que canjeamos con Supabase—. */
    apple?: { clientId?: string; redirectUrl?: string; useProperTokenExchange?: boolean };
  }): Promise<void>;
  login(options: {
    provider: "google" | "apple";
    options?: { nonce?: string; scopes?: string[] };
  }): Promise<{
    provider: string;
    result: {
      idToken?: string | null;
      /** Apple manda el nombre SOLO en el primer login de cada Apple ID. Google no lo manda
       *  por esta vía. Opcional en el tipo porque depende del proveedor. */
      profile?: {
        email?: string | null;
        givenName?: string | null;
        familyName?: string | null;
      };
    };
  }>;
  logout(options: { provider: "google" | "apple" }): Promise<void>;
};

/** Subconjunto de @capacitor/splash-screen: solo hide() (la intro web toma el relevo). */
type SplashScreenPlugin = {
  hide(options?: { fadeOutDuration?: number }): Promise<void>;
};

/**
 * Subconjunto de @revenuecat/purchases-capacitor 11.3.2 (compras dentro de la app). Las firmas
 * salen de su `definitions.d.ts`; solo están los campos que leemos. El plugin no trae
 * `showManageSubscriptions`: para gestionar se usa `customerInfo.managementURL`.
 */
export type PurchasesStoreProduct = {
  readonly identifier: string;
  readonly title: string;
  /** El precio formateado por la tienda, con su moneda. Es el ÚNICO precio que se muestra. */
  readonly priceString: string;
  /**
   * El mismo precio como número, en la moneda de la tienda. No se muestra: solo sirve para
   * calcular cuánto se ahorra con el anual frente al mensual (misma tienda, misma moneda).
   */
  readonly price: number;
  /**
   * Precio introductorio (también la prueba gratis, con `price` 0). En iOS es lo que configura
   * App Store Connect; si la persona puede usarlo lo dice la consulta de elegibilidad del plugin.
   */
  readonly introPrice: PurchasesIntroPrice | null;
  /** Opción de suscripción por defecto. Solo Google Play; null en iOS. */
  readonly defaultOption: SubscriptionOption | null;
};

/** `PurchasesIntroPrice` de purchases-typescript-internal-esm 17.25.0 (offerings.d.ts). */
export type PurchasesIntroPrice = {
  /** Precio en la moneda local. */
  readonly price: number;
  /** El precio formateado, con su moneda. */
  readonly priceString: string;
  /** Cuántos períodos de facturación dura el descuento, p. ej. 3. */
  readonly cycles: number;
  /** El período de facturación del descuento, en ISO 8601. */
  readonly period: string;
  /** Unidad del período: DAY, WEEK, MONTH o YEAR. */
  readonly periodUnit: string;
  /** Cuántas unidades tiene el período. */
  readonly periodNumberOfUnits: number;
};

/** `Period` de purchases-typescript-internal-esm 17.25.0. */
export type PurchasesPeriod = {
  readonly unit: "DAY" | "WEEK" | "MONTH" | "YEAR" | "UNKNOWN";
  readonly value: number;
  /** El período en ISO 8601, p. ej. «P2W». */
  readonly iso8601: string;
};

/** `PricingPhase` de purchases-typescript-internal-esm 17.25.0 (sin los campos que no leemos). */
export type PricingPhase = {
  readonly billingPeriod: PurchasesPeriod;
  /** Cuántas veces se repite la fase; null si es infinita. */
  readonly billingCycleCount: number | null;
};

/** `SubscriptionOption` de Google Play (purchases-typescript-internal-esm 17.25.0), lo que leemos. */
export type SubscriptionOption = {
  readonly id: string;
  /** La fase gratis de la opción, si la tiene. */
  readonly freePhase: PricingPhase | null;
};

/**
 * `INTRO_ELIGIBILITY_STATUS` de purchases-typescript-internal-esm 17.25.0. Android siempre
 * contesta 0 (desconocido).
 */
export const INTRO_ELIGIBILITY_STATUS = {
  UNKNOWN: 0,
  INELIGIBLE: 1,
  ELIGIBLE: 2,
  NO_INTRO_OFFER_EXISTS: 3,
} as const;

export type IntroEligibilityStatus =
  (typeof INTRO_ELIGIBILITY_STATUS)[keyof typeof INTRO_ELIGIBILITY_STATUS];

/** `IntroEligibility` de purchases-typescript-internal-esm 17.25.0. */
export type IntroEligibility = {
  readonly status: IntroEligibilityStatus;
  readonly description: string;
};

export type PurchasesPackage = {
  readonly identifier: string;
  readonly product: PurchasesStoreProduct;
};

export type PurchasesOffering = {
  readonly identifier: string;
  readonly availablePackages: PurchasesPackage[];
};

export type PurchasesCustomerInfo = {
  readonly entitlements: { readonly active: { readonly [id: string]: unknown } };
  readonly managementURL: string | null;
};

export type PurchasesPlugin = {
  configure(configuration: { apiKey: string; appUserID?: string | null }): Promise<void>;
  isConfigured(): Promise<{ isConfigured: boolean }>;
  getAppUserID(): Promise<{ appUserID: string }>;
  logIn(options: { appUserID: string }): Promise<{ customerInfo: PurchasesCustomerInfo }>;
  logOut(): Promise<{ customerInfo: PurchasesCustomerInfo }>;
  getOfferings(): Promise<{ readonly current: PurchasesOffering | null }>;
  purchasePackage(options: {
    aPackage: PurchasesPackage;
    /** Solo Google Play: de qué producto se cambia y cómo. */
    googleProductChangeInfo?: { oldProductIdentifier: string; prorationMode?: number } | null;
  }): Promise<{ productIdentifier: string; customerInfo: PurchasesCustomerInfo }>;
  restorePurchases(): Promise<{ customerInfo: PurchasesCustomerInfo }>;
  getCustomerInfo(): Promise<{ customerInfo: PurchasesCustomerInfo }>;
  /** Solo iOS da una respuesta útil. Rechaza si falla la consulta. */
  checkTrialOrIntroductoryPriceEligibility(options: {
    productIdentifiers: string[];
  }): Promise<{ [productId: string]: IntroEligibility }>;
};

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    App?: CapacitorAppPlugin;
    Browser?: CapacitorBrowserPlugin;
    SocialLogin?: SocialLoginPlugin;
    SplashScreen?: SplashScreenPlugin;
    Purchases?: PurchasesPlugin;
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

/**
 * Plataforma donde corre el código. `"web"` fuera de Capacitor (navegador normal y SSR).
 *
 * Hace falta porque hay comportamiento que es de UNA plataforma, no de "la app": el botón
 * Atrás existe solo en Android, y `isCapacitor()` no alcanza para distinguirlo de iOS.
 */
export function capacitorPlatform(): "ios" | "android" | "web" {
  const p = bridge()?.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
}

/** Plugin Browser (navegador del sistema: Custom Tabs / SFSafariViewController). null fuera de la app nativa. */
export function capacitorBrowser(): CapacitorBrowserPlugin | null {
  return bridge()?.Plugins?.Browser ?? null;
}

/** Plugin SocialLogin (@capgo) para el login Google nativo por idToken. null fuera de la app nativa. */
export function capacitorSocialLogin(): SocialLoginPlugin | null {
  return bridge()?.Plugins?.SocialLogin ?? null;
}

/** Oculta el splash nativo (mejor esfuerzo). No-op fuera de la app nativa. La intro web (MobileIntro)
 *  toma el relevo del splash sin gap: crema → crema. */
export function capacitorSplashHide(): void {
  bridge()
    ?.Plugins?.SplashScreen?.hide?.({ fadeOutDuration: 120 })
    ?.catch?.(() => {});
}

/** Plugin Purchases (RevenueCat) para las compras dentro de la app. null fuera de la app nativa. */
export function capacitorPurchases(): PurchasesPlugin | null {
  return bridge()?.Plugins?.Purchases ?? null;
}
