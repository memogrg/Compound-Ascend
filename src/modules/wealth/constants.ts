/**
 * Metadatos puros de la taxonomía de inversiones (PLAN §2.1–2.3). Por cada uno
 * de los 20 slugs: naturaleza, etiqueta, icono, `assetType` por defecto y si es
 * cotizable. El `defaultAssetType` SIEMPRE es un AssetType existente: los
 * cotizables caen en etf/accion/cripto (QUOTED_TYPES → precio en vivo) y el
 * resto en tipos no cotizados (→ valor manual), sin tocar los buckets del engine.
 *
 * Cotizables (quoted): accion_crecimiento, accion_dividendo, etf_crecimiento,
 * indexado_global, cripto. El resto es siempre valor manual.
 */
import type { AssetType, InvestmentCategory, InvestmentNature } from "@/modules/wealth/types";

export type CategoryMeta = {
  nature: InvestmentNature;
  label: string;
  icon: string;
  defaultAssetType: AssetType;
  quoted: boolean;
};

export const CATEGORY_META: Record<InvestmentCategory, CategoryMeta> = {
  // ── Flujo de caja (cashflow) ──
  cuenta_remunerada: {
    nature: "cashflow",
    label: "Plata guardada que gana intereses",
    icon: "piggy-bank",
    defaultAssetType: "certificado",
    quoted: false,
  },
  deposito_plazo: {
    nature: "cashflow",
    label: "Depósitos a plazo / CDP",
    icon: "landmark",
    defaultAssetType: "certificado",
    quoted: false,
  },
  bono_gobierno: {
    nature: "cashflow",
    label: "Bonos del gobierno",
    icon: "landmark",
    defaultAssetType: "bono",
    quoted: false,
  },
  bono_empresa: {
    nature: "cashflow",
    label: "Bonos de empresas",
    icon: "building-2",
    defaultAssetType: "bono",
    quoted: false,
  },
  fondo_conservador: {
    nature: "cashflow",
    label: "Fondos conservadores",
    icon: "shield",
    defaultAssetType: "fondo",
    quoted: false,
  },
  prestamo_interes: {
    nature: "cashflow",
    label: "Préstamos que generan intereses",
    icon: "handshake",
    defaultAssetType: "otro",
    quoted: false,
  },
  propiedad_alquiler: {
    nature: "cashflow",
    label: "Propiedades alquiladas",
    icon: "home",
    defaultAssetType: "inmueble",
    quoted: false,
  },
  reit: {
    nature: "cashflow",
    label: "Fondos inmobiliarios / REITs",
    icon: "building",
    defaultAssetType: "fondo",
    quoted: false,
  },
  accion_dividendo: {
    nature: "cashflow",
    label: "Acciones/ETFs que pagan dividendos",
    icon: "banknote",
    defaultAssetType: "accion",
    quoted: true,
  },
  negocio_ingreso: {
    nature: "cashflow",
    label: "Negocios que dejan ganancia",
    icon: "store",
    defaultAssetType: "negocio",
    quoted: false,
  },
  // ── Crecimiento patrimonial (growth) ──
  accion_crecimiento: {
    nature: "growth",
    label: "Acciones con potencial de crecer",
    icon: "trending-up",
    defaultAssetType: "accion",
    quoted: true,
  },
  etf_crecimiento: {
    nature: "growth",
    label: "ETFs o fondos de crecimiento",
    icon: "chart-line",
    defaultAssetType: "etf",
    quoted: true,
  },
  indexado_global: {
    nature: "growth",
    label: "Fondos indexados globales",
    icon: "globe",
    defaultAssetType: "etf",
    quoted: true,
  },
  roboadvisor: {
    nature: "growth",
    label: "Portafolios automáticos / retiro",
    icon: "bot",
    defaultAssetType: "pension",
    quoted: false,
  },
  propiedad_plusvalia: {
    nature: "growth",
    label: "Propiedades por plusvalía",
    icon: "map",
    defaultAssetType: "inmueble",
    quoted: false,
  },
  proyecto_inmobiliario: {
    nature: "growth",
    label: "Proyectos inmobiliarios",
    icon: "hard-hat",
    defaultAssetType: "inmueble",
    quoted: false,
  },
  startup: {
    nature: "growth",
    label: "Startups o empresas nuevas",
    icon: "rocket",
    defaultAssetType: "negocio",
    quoted: false,
  },
  compra_negocio: {
    nature: "growth",
    label: "Compra de negocios para escalar",
    icon: "briefcase",
    defaultAssetType: "negocio",
    quoted: false,
  },
  cripto: {
    nature: "growth",
    label: "Cripto y activos digitales",
    icon: "bitcoin",
    defaultAssetType: "cripto",
    quoted: true,
  },
  alternativo: {
    nature: "growth",
    label: "Activos alternativos",
    icon: "gem",
    defaultAssetType: "commodity",
    quoted: false,
  },
};

/** Naturaleza ('cashflow' | 'growth') de una categoría. */
export function natureOfCategory(category: InvestmentCategory): InvestmentNature {
  return CATEGORY_META[category].nature;
}
