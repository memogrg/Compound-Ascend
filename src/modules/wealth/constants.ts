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
import type { IconName } from "@/components/ui/icon";

export type CategoryMeta = {
  nature: InvestmentNature;
  label: string;
  icon: IconName; // ícono del design system (no emoji)
  defaultAssetType: AssetType;
  quoted: boolean;
};

export const CATEGORY_META: Record<InvestmentCategory, CategoryMeta> = {
  // ── Flujo de caja (cashflow) ──
  cuenta_remunerada: {
    nature: "cashflow",
    label: "Plata guardada que gana intereses",
    icon: "savings",
    defaultAssetType: "certificado",
    quoted: false,
  },
  deposito_plazo: {
    nature: "cashflow",
    label: "Depósitos a plazo / CDP",
    icon: "networth",
    defaultAssetType: "certificado",
    quoted: false,
  },
  bono_gobierno: {
    nature: "cashflow",
    label: "Bonos del gobierno",
    icon: "networth",
    defaultAssetType: "bono",
    quoted: false,
  },
  bono_empresa: {
    nature: "cashflow",
    label: "Bonos de empresas",
    icon: "networth",
    defaultAssetType: "bono",
    quoted: false,
  },
  fondo_conservador: {
    nature: "cashflow",
    label: "Fondos conservadores",
    icon: "defense",
    defaultAssetType: "fondo",
    quoted: false,
  },
  prestamo_interes: {
    nature: "cashflow",
    label: "Préstamos que generan intereses",
    icon: "income",
    defaultAssetType: "otro",
    quoted: false,
  },
  propiedad_alquiler: {
    nature: "cashflow",
    label: "Propiedades alquiladas",
    icon: "budget",
    defaultAssetType: "inmueble",
    quoted: false,
  },
  reit: {
    nature: "cashflow",
    label: "Fondos inmobiliarios / REITs",
    icon: "portfolio",
    defaultAssetType: "fondo",
    quoted: false,
  },
  accion_dividendo: {
    nature: "cashflow",
    label: "Acciones/ETFs que pagan dividendos",
    icon: "income",
    defaultAssetType: "accion",
    quoted: true,
  },
  negocio_ingreso: {
    nature: "cashflow",
    label: "Negocios que dejan ganancia",
    icon: "income",
    defaultAssetType: "negocio",
    quoted: false,
  },
  // ── Crecimiento patrimonial (growth) ──
  accion_crecimiento: {
    nature: "growth",
    label: "Acciones con potencial de crecer",
    icon: "invest",
    defaultAssetType: "accion",
    quoted: true,
  },
  etf_crecimiento: {
    nature: "growth",
    label: "ETFs o fondos de crecimiento",
    icon: "invest",
    defaultAssetType: "etf",
    quoted: true,
  },
  indexado_global: {
    nature: "growth",
    label: "Fondos indexados globales",
    icon: "portfolio",
    defaultAssetType: "etf",
    quoted: true,
  },
  roboadvisor: {
    nature: "growth",
    label: "Portafolios automáticos / retiro",
    icon: "spark",
    defaultAssetType: "pension",
    quoted: false,
  },
  propiedad_plusvalia: {
    nature: "growth",
    label: "Propiedades por plusvalía",
    icon: "networth",
    defaultAssetType: "inmueble",
    quoted: false,
  },
  proyecto_inmobiliario: {
    nature: "growth",
    label: "Proyectos inmobiliarios",
    icon: "budget",
    defaultAssetType: "inmueble",
    quoted: false,
  },
  startup: {
    nature: "growth",
    label: "Startups o empresas nuevas",
    icon: "spark",
    defaultAssetType: "negocio",
    quoted: false,
  },
  compra_negocio: {
    nature: "growth",
    label: "Compra de negocios para escalar",
    icon: "portfolio",
    defaultAssetType: "negocio",
    quoted: false,
  },
  cripto: {
    nature: "growth",
    label: "Cripto y activos digitales",
    icon: "invest",
    defaultAssetType: "cripto",
    quoted: true,
  },
  alternativo: {
    nature: "growth",
    label: "Activos alternativos",
    icon: "spark",
    defaultAssetType: "commodity",
    quoted: false,
  },
};

/** Naturaleza ('cashflow' | 'growth') de una categoría. */
export function natureOfCategory(category: InvestmentCategory): InvestmentNature {
  return CATEGORY_META[category].nature;
}

const categoriesOfNature = (nature: InvestmentNature): InvestmentCategory[] =>
  (Object.keys(CATEGORY_META) as InvestmentCategory[]).filter(
    (c) => CATEGORY_META[c].nature === nature,
  );

/** Slugs de naturaleza 'cashflow' (flujo de caja), en orden de declaración. */
export const CASHFLOW_CATEGORIES: InvestmentCategory[] = categoriesOfNature("cashflow");

/** Slugs de naturaleza 'growth' (crecimiento patrimonial), en orden de declaración. */
export const GROWTH_CATEGORIES: InvestmentCategory[] = categoriesOfNature("growth");
