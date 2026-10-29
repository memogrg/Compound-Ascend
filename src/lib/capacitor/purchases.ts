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
  esCambioRechazado,
  esCompraCancelada,
  type PlanConPeriodos,
} from "@/lib/billing/store-offerings";
import { PLAN_RANK, type PaidPlan, type Periodo } from "@/lib/plan";

export type ResultadoCompra =
  { ok: true } | { ok: false; cancelled: true } | { ok: false; error: string };

export const CAMBIO_RECHAZADO =
  "Google Play no aceptó el cambio. Si ya tenés un cambio programado o tu plan acaba de cambiar, probá después de la próxima renovación.";

/**
 * Modos de reemplazo de Google Play para un cambio de plan. Copiados del enum `PRORATION_MODE`
 * de mobile-shell/node_modules/@revenuecat/purchases-typescript-internal-esm/dist/offerings.js
 * (17.25.0, la que fija purchases-capacitor 11.3.2). No se importa el paquete interno: es una
 * dependencia de mobile-shell, no de la web.
 *  · IMMEDIATE_WITH_TIME_PRORATION (1): entra ya y lo que quedaba del período se acredita.
 *  · DEFERRED (6): entra cuando vence lo pagado, y recién ahí se cobra el plan nuevo.
 */
export const PRORATION_MODE = {
  IMMEDIATE_WITH_TIME_PRORATION: 1,
  DEFERRED: 6,
} as const;

export type ModoDeCambio = (typeof PRORATION_MODE)[keyof typeof PRORATION_MODE];

/**
 * Cómo se cambia de un plan+período a otro. Puro. Subir de plan entra ya (paga la diferencia y
 * quiere lo que compró); bajar, o cambiar solo el período, entra al vencer lo pagado — la misma
 * regla que Stripe y que la que aplica Apple dentro del grupo de suscripciones.
 */
export function modoDeCambio(
  actual: { plan: PaidPlan; periodo: Periodo },
  destino: { plan: PaidPlan; periodo: Periodo },
): ModoDeCambio {
  return PLAN_RANK[destino.plan] > PLAN_RANK[actual.plan]
    ? PRORATION_MODE.IMMEDIATE_WITH_TIME_PRORATION
    : PRORATION_MODE.DEFERRED;
}

/** Un cambio de plan en curso: el producto que se deja y cómo se reemplaza. */
export type CambioDePlan = { productoActual: string; prorationMode: ModoDeCambio };

/**
 * `store_product_id` llega del webhook con el base plan pegado («cartera_proplus_mensual:anual»).
 * Google Play identifica la suscripción por el producto: el SDK de Android (purchases 9.18.0) le
 * quita el «:basePlan» por su cuenta pero lo avisa como no recomendado en un DEFERRED, así que
 * se manda ya sin él.
 */
export function productoSinBasePlan(productId: string): string {
  return productId.split(":")[0] ?? productId;
}

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

/**
 * Compra un paquete. Con `cambio`, en Android reemplaza la suscripción actual con el modo dado;
 * en iOS no se manda nada: Apple resuelve el cambio dentro del grupo de suscripciones.
 */
export async function comprar(
  paquete: PurchasesPackage,
  cambio?: CambioDePlan,
): Promise<ResultadoCompra> {
  const plugin = await pluginListo();
  if (!plugin) return { ok: false, error: "Las compras no están disponibles en este momento." };
  const reemplazoEnPlay = cambio !== undefined && capacitorPlatform() === "android";
  try {
    await plugin.purchasePackage({
      aPackage: paquete,
      ...(cambio && reemplazoEnPlay
        ? {
            googleProductChangeInfo: {
              oldProductIdentifier: productoSinBasePlan(cambio.productoActual),
              prorationMode: cambio.prorationMode,
            },
          }
        : {}),
    });
    return { ok: true };
  } catch (err) {
    if (esCompraCancelada(err)) return { ok: false, cancelled: true };
    console.warn("[compras] purchasePackage", err);
    if (reemplazoEnPlay && esCambioRechazado(err)) return { ok: false, error: CAMBIO_RECHAZADO };
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
