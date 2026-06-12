/**
 * Metadatos de cabecera por ruta (crumb + título). El topbar los resuelve
 * desde el pathname. `titleHTML` permite resaltar en cursiva con <span class="it">.
 */
export type PageMeta = { crumb: string; title: string; titleHTML?: string };

export const PAGE_META: Record<string, PageMeta> = {
  "/dashboard": { crumb: "Resumen", title: "Panel", titleHTML: 'Tu <span class="it">panel</span>' },
  "/mi-perfil-financiero": {
    crumb: "Perfil",
    title: "Mi Perfil Financiero",
    titleHTML: 'Mi perfil <span class="it">financiero</span>',
  },
  "/mi-base-financiera": {
    crumb: "Presupuesto",
    title: "Mi Base Financiera",
    titleHTML: 'Mi base <span class="it">financiera</span>',
  },
  "/ingresos": {
    crumb: "Presupuesto",
    title: "Ingresos",
    titleHTML: 'Tus <span class="it">ingresos</span>',
  },
  "/gastos": {
    crumb: "Presupuesto",
    title: "Gastos",
    titleHTML: 'Tus <span class="it">gastos</span>',
  },
  "/transacciones": {
    crumb: "Presupuesto",
    title: "Transacciones",
    titleHTML: 'Tus <span class="it">transacciones</span>',
  },
  "/control-financiero": {
    crumb: "Control",
    title: "Ahorro",
    titleHTML: 'Tu <span class="it">ahorro</span>',
  },
  "/patrimonio": {
    crumb: "Crecimiento",
    title: "Portafolio de inversiones",
    titleHTML: 'Portafolio de <span class="it">inversiones</span>',
  },
  "/patrimonio/proteccion": {
    crumb: "Crecimiento",
    title: "Defensa Patrimonial",
    titleHTML: 'Defensa <span class="it">patrimonial</span>',
  },
  "/mi-rich-life": {
    crumb: "Crecimiento",
    title: "Patrimonio",
    titleHTML: 'Mi <span class="it">patrimonio</span>',
  },
  "/configuracion": { crumb: "Cuenta", title: "Configuración" },
};

const DEFAULT_META: PageMeta = { crumb: "Resumen", title: "Compound Ascend" };

/** Devuelve los metadatos de la ruta más específica que coincida. */
export function resolvePageMeta(pathname: string): PageMeta {
  if (PAGE_META[pathname]) return PAGE_META[pathname]!;
  // coincidencia por prefijo (rutas anidadas)
  const match = Object.keys(PAGE_META)
    .filter((p) => pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_META[match]! : DEFAULT_META;
}
