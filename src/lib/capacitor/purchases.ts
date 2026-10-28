/**
 * Compras dentro de la app (App Store / Google Play) vía RevenueCat. Solo cliente.
 *
 * El cliente NUNCA cambia el plan: compra en la tienda y espera. `profiles.plan` lo cambia
 * únicamente el webhook de RevenueCat (/api/webhooks/revenuecat), que identifica la cuenta
 * porque acá se configura RevenueCat con el UUID de la cuenta como `appUserID`.
 *
 * Fuera de la app nativa, o sin la key pública de la plataforma, todo es no-op.
 */
import {
  capacitorPlatform,
  capacitorPurchases,
  isCapacitor,
  type PurchasesCustomerInfo,
  type PurchasesPackage,
  type PurchasesPlugin,
} from "@/lib/capacitor/native";
import {
  agruparPorPlan,
  esCompraCancelada,
  type PlanConPeriodos,
} from "@/lib/billing/store-offerings";

export type ResultadoCompra =
  { ok: true } | { ok: false; cancelled: true } | { ok: false; error: string };

/** Las NEXT_PUBLIC_* se inlinean en build: hay que nombrarlas literalmente. */
function apiKey(): string | null {
  const p = capacitorPlatform();
  const key =
    p === "ios"
      ? process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY
      : p === "android"
        ? process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY
        : undefined;
  return key && key.trim() ? key.trim() : null;
}

/** Una sola configuración en vuelo: el layout puede montarse dos veces seguidas. */
let enCurso: Promise<PurchasesPlugin | null> | null = null;

async function asegurar(userId: string): Promise<PurchasesPlugin | null> {
  const plugin = capacitorPurchases();
  if (!isCapacitor() || !plugin) {
    console.warn("[compras] fuera de la app nativa: sin compras");
    return null;
  }
  const key = apiKey();
  if (!key) {
    console.warn("[compras] falta la key pública de RevenueCat de esta plataforma");
    return null;
  }
  // El SDK nativo sobrevive a las recargas de la WebView: se le pregunta a él, no a una
  // variable de este módulo, si ya está configurado y con quién.
  const { isConfigured } = await plugin.isConfigured();
  if (!isConfigured) {
    await plugin.configure({ apiKey: key, appUserID: userId });
    return plugin;
  }
  const { appUserID } = await plugin.getAppUserID();
  if (appUserID !== userId) await plugin.logIn({ appUserID: userId });
  return plugin;
}

/** Idempotente. Se llama al montar el layout autenticado del móvil. */
export function configurarCompras(userId: string): Promise<PurchasesPlugin | null> {
  if (!enCurso) {
    enCurso = asegurar(userId).catch((err: unknown) => {
      console.warn("[compras] no se pudo configurar RevenueCat", err);
      return null;
    });
    // Que la próxima llamada vuelva a preguntar (otro usuario, o un reintento tras un fallo).
    void enCurso.finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function pluginListo(): Promise<PurchasesPlugin | null> {
  const plugin = capacitorPurchases();
  if (!isCapacitor() || !plugin) return null;
  // Si la configuración del layout sigue en vuelo, se la espera: sin ella el SDK rechaza.
  if (enCurso) await enCurso;
  try {
    const { isConfigured } = await plugin.isConfigured();
    return isConfigured ? plugin : null;
  } catch {
    return null;
  }
}

/** Antes de cerrar sesión: que la próxima cuenta no herede las compras de ésta. Best-effort. */
export async function cerrarSesionCompras(): Promise<void> {
  try {
    const plugin = await pluginListo();
    if (plugin) await plugin.logOut();
  } catch (err) {
    // logOut rechaza si el usuario actual ya es anónimo: no impide cerrar sesión.
    console.warn("[compras] logOut de RevenueCat", err);
  }
}

/**
 * Los planes de la oferta actual con su paquete mensual y anual, ordenados Esencial+ → Pro+ →
 * Max+. [] si no hay.
 */
export async function obtenerOfertas(): Promise<PlanConPeriodos<PurchasesPackage>[]> {
  const plugin = await pluginListo();
  if (!plugin) return [];
  const { current } = await plugin.getOfferings();
  return agruparPorPlan(current?.availablePackages ?? []);
}

export async function comprar(paquete: PurchasesPackage): Promise<ResultadoCompra> {
  const plugin = await pluginListo();
  if (!plugin) return { ok: false, error: "Las compras no están disponibles en este momento." };
  try {
    await plugin.purchasePackage({ aPackage: paquete });
    return { ok: true };
  } catch (err) {
    if (esCompraCancelada(err)) return { ok: false, cancelled: true };
    console.warn("[compras] purchasePackage", err);
    return { ok: false, error: "No se pudo completar la compra. Intentá de nuevo." };
  }
}

/** Restaura las compras de la cuenta de la tienda. `activa`: si quedó algún entitlement vivo. */
export async function restaurar(): Promise<
  { ok: true; activa: boolean } | { ok: false; error: string }
> {
  const plugin = await pluginListo();
  if (!plugin) return { ok: false, error: "Las compras no están disponibles en este momento." };
  try {
    const { customerInfo } = await plugin.restorePurchases();
    return { ok: true, activa: tieneAcceso(customerInfo) };
  } catch (err) {
    console.warn("[compras] restorePurchases", err);
    return { ok: false, error: "No se pudieron restaurar las compras. Intentá de nuevo." };
  }
}

/** La página de gestión de la suscripción que da la tienda, si RevenueCat la conoce. */
export async function urlDeGestion(): Promise<string | null> {
  const plugin = await pluginListo();
  if (!plugin) return null;
  try {
    const { customerInfo } = await plugin.getCustomerInfo();
    return customerInfo.managementURL;
  } catch {
    return null;
  }
}

function tieneAcceso(info: PurchasesCustomerInfo): boolean {
  return Object.keys(info.entitlements.active).length > 0;
}
