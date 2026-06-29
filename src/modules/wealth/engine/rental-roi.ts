/**
 * ROI operativo de un inmueble de renta. Determinista y puro (sin server-only:
 * se usa también en el formulario, en vivo). Convierte renta bruta + costos en
 * flujo neto mensual y ROI operativo anual. La deuda (apalancamiento) y la
 * plusvalía se incorporan en prompts posteriores.
 */
// `Frequency` se importa solo-tipo del barrel (se borra en build, no arrastra el
// `server-only` que reexporta). El factor de mensualización se replica localmente
// (fuente: financial-base/engine/monthlyize) porque este motor corre en el wizard
// (cliente) y no puede importar el valor a través del barrel server-only.
import type { Frequency } from "@/modules/financial-base";

/** Factor monto→mensual. Espejo de FREQUENCY_FACTORS en financial-base/engine/monthlyize. */
const MONTHLY_FACTOR: Record<Frequency, number> = {
  diario: 30,
  semanal: 52 / 12,
  quincenal: 2,
  mensual: 1,
  bimensual: 0.5,
  trimestral: 1 / 3,
  cuatrimestral: 1 / 4,
  semestral: 1 / 6,
  anual: 1 / 12,
  unico: 0,
  variable: 1,
};

function monthlyize(amount: number, frequency: Frequency): number {
  return Math.round(amount * (MONTHLY_FACTOR[frequency] ?? 0) * 100) / 100;
}

export type RentalRoiInput = {
  rentalIncome: number;
  rentalFrequency: Frequency;
  vacancyPct: number; // 0-1
  mgmtPct: number; // 0-1, sobre renta cobrada
  maintenanceMonthly: number;
  hoaMonthly: number;
  servicesMonthly: number;
  propertyTaxAnnual: number;
  insuranceAnnual: number;
  /** Efectivo invertido: precio de compra + cierre (o monto invertido). */
  investedCash: number;
  /** Cuota mensual de la deuda que financia el inmueble (C-1b). 0 si no hay. */
  debtServiceMonthly?: number;
};

export type RentalRoi = {
  grossMonthly: number;
  vacancyLoss: number;
  mgmtCost: number;
  fixedMonthly: number; // mantenimiento + hoa + servicios + impuestos/12 + seguro/12
  netMonthly: number; // NOI mensual (sin deuda)
  noiAnnual: number;
  operatingRoi: number; // 0-1 = NOI anual / efectivo invertido
  debtServiceMonthly: number; // cuota mensual de la deuda ligada (0 si no hay)
  leveredNetMonthly: number; // flujo neto mensual después de la cuota (netMonthly - deuda)
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function computeRentalRoi(i: RentalRoiInput): RentalRoi {
  const grossMonthly = monthlyize(i.rentalIncome, i.rentalFrequency);
  const vacancyLoss = grossMonthly * clamp01(i.vacancyPct);
  const collected = grossMonthly - vacancyLoss;
  const mgmtCost = collected * clamp01(i.mgmtPct);
  const fixedMonthly =
    i.maintenanceMonthly +
    i.hoaMonthly +
    i.servicesMonthly +
    i.propertyTaxAnnual / 12 +
    i.insuranceAnnual / 12;
  const netMonthly = collected - mgmtCost - fixedMonthly;
  const noiAnnual = netMonthly * 12;
  const operatingRoi = i.investedCash > 0 ? noiAnnual / i.investedCash : 0;
  // El ROI operativo se mantiene sin apalancar; la deuda solo afecta el flujo.
  const debtServiceMonthly = Math.max(0, i.debtServiceMonthly ?? 0);
  const leveredNetMonthly = netMonthly - debtServiceMonthly;
  return {
    grossMonthly,
    vacancyLoss,
    mgmtCost,
    fixedMonthly,
    netMonthly,
    noiAnnual,
    operatingRoi,
    debtServiceMonthly,
    leveredNetMonthly,
  };
}
