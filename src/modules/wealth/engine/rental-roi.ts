/**
 * ROI operativo de un inmueble de renta. Determinista y puro (sin server-only:
 * se usa también en el formulario, en vivo). Convierte renta bruta + costos en
 * flujo neto mensual y ROI operativo anual. La deuda (apalancamiento) y la
 * plusvalía se incorporan en prompts posteriores.
 */
import { monthlyize, type Frequency } from "@/modules/financial-base";

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
};

export type RentalRoi = {
  grossMonthly: number;
  vacancyLoss: number;
  mgmtCost: number;
  fixedMonthly: number; // mantenimiento + hoa + servicios + impuestos/12 + seguro/12
  netMonthly: number; // NOI mensual (sin deuda)
  noiAnnual: number;
  operatingRoi: number; // 0-1 = NOI anual / efectivo invertido
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
  return { grossMonthly, vacancyLoss, mgmtCost, fixedMonthly, netMonthly, noiAnnual, operatingRoi };
}
