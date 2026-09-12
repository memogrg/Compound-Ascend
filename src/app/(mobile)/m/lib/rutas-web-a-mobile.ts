/**
 * De una ruta de ESCRITORIO a su pantalla equivalente en la app móvil.
 *
 * La app nativa nunca debe navegar a una ruta de escritorio: el middleware puede
 * redirigir a `/empezar` (checkout de Stripe), y cobrar fuera de la App Store viola
 * la guía 3.1.1 de Apple.
 *
 * Por qué existe: el motor de acciones (`@/modules/actions`) es COMPARTIDO con la web
 * y devuelve rutas web —`/deudas`, `/patrimonio`…— que allí son correctas. En móvil
 * esas rutas o no existen o salen del shell. Traducirlas acá, en el borde, deja el
 * motor intacto: no hay una segunda tabla de rutas que mantener sincronizada.
 */
import { logger } from "@/lib/logger";

/**
 * Cuidado con los dos «patrimonio», que no son el mismo lugar:
 *  · web `/patrimonio` = portafolio de inversiones → `/m/inversiones`.
 *  · web `/mi-rich-life` = patrimonio neto        → `/m/patrimonio`.
 * Todas las acciones que hoy apuntan a `/patrimonio` hablan de la cartera
 * (distribución, precio de un aporte, dividendo, alerta de precio), no del patrimonio neto.
 */
export const RUTA_WEB_A_MOBILE: Record<string, string> = {
  "/deudas": "/m/deudas",
  "/patrimonio": "/m/inversiones",
  "/patrimonio/proteccion": "/m/proteccion",
  "/patrimonio/indicadores": "/m/indicadores",
  // Los dos usos de `/control-financiero` en el motor son sobre METAS (pausar o bajar
  // el aporte de un objetivo), igual que el insight `meta_estancada`. El «fondo de paz»
  // no cae acá: sale por `/patrimonio/proteccion`.
  "/control-financiero": "/m/metas",
  "/gastos": "/m/gastos",
  "/ingresos": "/m/ingresos",
  "/transacciones": "/m/transacciones",
  "/mi-base-financiera": "/m/mi-base-financiera",
  "/mi-rich-life": "/m/patrimonio",
  "/mi-perfil-financiero": "/m/mi-perfil-financiero",
  "/dashboard": "/m",
  "/configuracion": "/m/perfil",
};

/** Una ruta desconocida se avisa UNA vez: en una lista de acciones se repetiría por fila. */
const yaAvisadas = new Set<string>();

/**
 * Traduce una ruta del motor a su pantalla móvil.
 *
 * Conserva query y hash (`?new=holding` abre el formulario de alta al llegar), devuelve
 * intacta una ruta que ya es de móvil, y ante una ruta sin mapeo cae a `/m` — nunca a la
 * ruta web, que es justamente lo que hay que evitar.
 */
export function aRutaMobile(rutaWeb: string): string {
  const corte = rutaWeb.search(/[?#]/);
  const cola = corte === -1 ? "" : rutaWeb.slice(corte);
  let camino = corte === -1 ? rutaWeb : rutaWeb.slice(0, corte);

  // `/deudas/` y `/deudas` son la misma pantalla; sin esto la barra final caería a `/m`.
  if (camino.length > 1 && camino.endsWith("/")) camino = camino.slice(0, -1);

  if (camino === "/m" || camino.startsWith("/m/")) return rutaWeb;

  const destino = RUTA_WEB_A_MOBILE[camino];
  if (destino) return destino + cola;

  // En producción no se avisa: quien usa la app no gana nada y el fallback ya es seguro.
  if (process.env.NODE_ENV !== "production" && !yaAvisadas.has(camino)) {
    yaAvisadas.add(camino);
    logger.warn("ruta web sin equivalente móvil; se cae a /m", { ruta: camino });
  }
  return "/m";
}
