/**
 * Construcción PURA del payload de un holding (HoldingInput) desde los valores de
 * formulario, extraída del wizard web (`add-holding-wizard.tsx`) para reutilizarla
 * SIN duplicar en el wizard móvil (/m/inversiones). No toca React ni servicios;
 * la validación real la hace `holdingInputSchema` en la Server Action.
 *
 * Perfiles derivados de la categoría (CATEGORY_META):
 *   A = cotizado (símbolo/precio/cantidad)   · B = flujo de caja manual (valor+ingreso)
 *   C = crecimiento manual (valor)           · plan_inversion / propiedad_alquiler: extras
 */
import { CATEGORY_META } from "@/modules/wealth/constants";
import type { AssetType, InvestmentCategory } from "@/modules/wealth/types";
import type { HoldingInput } from "@/modules/wealth/schemas";

export type HoldingFrequency =
  | "semanal"
  | "mensual"
  | "trimestral"
  | "semestral"
  | "anual"
  | "al_vencimiento";

/** Costos operativos del inmueble de renta (perfil B · propiedad_alquiler). Strings de formulario. */
export type RentalCosts = {
  purchasePrice: string;
  closingCosts: string;
  vacancyPct: string;
  mgmtPct: string;
  maintenance: string;
  hoa: string;
  propertyTax: string;
  insurance: string;
  services: string;
};

/** Todos los campos de captura del wizard (strings/bools tal cual el estado del form). */
export type HoldingFormValues = {
  category: InvestmentCategory;
  name: string;
  invested: string;
  cur: string;
  // Perfil A (cotizado)
  symbol: string;
  quantity: string;
  unitPrice: string;
  livePrice: number | null;
  livePriceCurrency: string;
  // Perfil B/C (manual)
  currentValue: string;
  income: string;
  frequency: HoldingFrequency;
  incomeMonth: string;
  annualRatePct: string;
  maturityDate: string; // "YYYY-MM"
  termYears: string;
  startDate: string; // "YYYY-MM-DD"
  // Inmueble de renta
  subtype: "alquiler" | "airbnb";
  rc: RentalCosts;
  debtId: string;
  // Comunes
  region: string;
  aportoCadaMes: boolean;
  aporteMensual: string;
  registerExpense: boolean;
};

/** Perfil de captura derivado de la categoría. */
export function profileForCategory(category: InvestmentCategory | null): "A" | "B" | "C" | null {
  if (!category) return null;
  const m = CATEGORY_META[category];
  return m.quoted ? "A" : m.nature === "cashflow" ? "B" : "C";
}

/** assetType → categoría, para precargar holdings viejos sin `category` (mismo mapeo que el backfill). */
export function categoryFromAssetType(assetType: AssetType): InvestmentCategory {
  const map: Record<AssetType, InvestmentCategory> = {
    cripto: "cripto",
    etf: "etf_crecimiento",
    accion: "accion_crecimiento",
    bono: "bono_gobierno",
    fondo: "fondo_conservador",
    certificado: "deposito_plazo",
    inmueble: "propiedad_alquiler",
    negocio: "negocio_ingreso",
    pension: "roboadvisor",
    commodity: "alternativo",
    arte: "alternativo",
    nft: "cripto",
    otro: "alternativo",
  };
  return map[assetType] ?? "alternativo";
}

/** Pago por periodo estimado desde monto × % anual, según la frecuencia. */
export function perPaymentFromRate(invested: string, ratePct: string, freq: string): string {
  if (freq === "al_vencimiento") return "";
  const principal = parseFloat(invested) || 0;
  const rate = parseFloat(ratePct) || 0;
  if (principal <= 0 || rate <= 0) return "";
  const annual = (principal * rate) / 100;
  const divisor =
    freq === "semanal"
      ? 52
      : freq === "mensual"
        ? 12
        : freq === "trimestral"
          ? 4
          : freq === "semestral"
            ? 2
            : 1;
  return String(Math.round((annual / divisor) * 100) / 100);
}

/** Meses de pago derivados del mes ancla (1-12) + frecuencia. */
export function derivedMonths(freq: string, anchor: number): number[] {
  const a = ((((anchor || 1) - 1) % 12) + 12) % 12;
  if (freq === "trimestral") return [0, 3, 6, 9].map((k) => ((a + k) % 12) + 1);
  if (freq === "semestral") return [0, 6].map((k) => ((a + k) % 12) + 1);
  if (freq === "anual") return [a + 1];
  return [];
}

/**
 * Arma el HoldingInput desde los valores del formulario. Réplica exacta del
 * `buildPayload` del wizard web (comportamiento idéntico). Cotizado con precio →
 * cantidad derivada (monto ÷ precio); cotizado con cantidad → costo = monto ÷ cantidad;
 * resto → 1 "unidad" cuyo costo ES el monto invertido.
 */
export function buildHoldingPayload(v: HoldingFormValues): HoldingInput {
  const cat = v.category;
  const m = CATEGORY_META[cat];

  const investedNum = parseFloat(v.invested) || 0;
  const qtyNum = parseFloat(v.quantity) || 0;
  const priceNum = parseFloat(v.unitPrice) || 0;
  // El precio en vivo solo se usa como costo si su moneda coincide con la elegida.
  const liveMatchesCur = v.livePriceCurrency === v.cur;
  const liveForCost = liveMatchesCur ? (v.livePrice ?? 0) : 0;

  let finalQty = 1;
  let finalAvg = investedNum;
  if (m.quoted && priceNum > 0) {
    finalAvg = priceNum;
    finalQty = investedNum > 0 ? investedNum / priceNum : qtyNum || 0;
  } else if (m.quoted && qtyNum > 0) {
    finalQty = qtyNum;
    finalAvg = investedNum > 0 ? investedNum / qtyNum : liveForCost;
  }

  const base: HoldingInput = {
    assetType: m.defaultAssetType,
    category: cat,
    nature: m.nature,
    quantity: finalQty,
    averageCost: finalAvg,
    currency: v.cur,
    label: v.name.trim() || undefined,
    region: v.region,
    isRecurring: v.aportoCadaMes,
    monthlyContribution: v.aportoCadaMes ? parseFloat(v.aporteMensual) || undefined : undefined,
    registerExpense: v.registerExpense,
    purchaseDate: new Date().toISOString().slice(0, 10),
  };

  if (m.quoted) {
    base.symbol = v.symbol.trim() ? v.symbol.trim().toUpperCase() : undefined;
  } else {
    // Manual (B/C): valor actual; default = invertido.
    base.currentValueManual = parseFloat(v.currentValue) || investedNum || undefined;
    if (cat === "plan_inversion") {
      base.termYears = parseInt(v.termYears, 10) || undefined;
      base.maturityDate = v.maturityDate ? `${v.maturityDate}-01` : undefined;
      if (v.startDate) base.purchaseDate = v.startDate;
    }
    if (m.nature === "cashflow") {
      const inc = parseFloat(v.income) || 0;
      if (inc > 0) {
        base.rentalIncome = inc;
        base.rentalFrequency = v.frequency;
        if (v.frequency !== "mensual" && v.frequency !== "semanal")
          base.incomeMonth = parseInt(v.incomeMonth, 10) || undefined;
      }
      base.annualRatePct = parseFloat(v.annualRatePct) || undefined;
      base.maturityDate = v.maturityDate ? `${v.maturityDate}-01` : undefined;
      if (cat === "propiedad_alquiler") {
        base.rentalSubtype = v.subtype;
        const n = (s: string) => parseFloat(s) || undefined;
        const pct = (s: string) => (s ? (parseFloat(s) || 0) / 100 : undefined);
        base.purchasePrice = n(v.rc.purchasePrice);
        base.closingCosts = n(v.rc.closingCosts);
        base.vacancyPct = pct(v.rc.vacancyPct);
        base.mgmtPct = pct(v.rc.mgmtPct);
        base.maintenanceMonthly = n(v.rc.maintenance);
        base.hoaMonthly = n(v.rc.hoa);
        base.propertyTaxAnnual = n(v.rc.propertyTax);
        base.insuranceAnnual = n(v.rc.insurance);
        base.servicesMonthly = n(v.rc.services);
        base.debtId = v.debtId || undefined;
      }
    }
  }
  return base;
}
