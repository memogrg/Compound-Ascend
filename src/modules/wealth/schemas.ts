/** Validación Zod de inversiones y pólizas (Módulo 4). */
import { z } from "zod";
import { INVESTMENT_CATEGORIES } from "@/modules/wealth/types";
import { pastDateSchema } from "@/lib/validation";

export const investmentInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(120),
  assetType: z.enum([
    "etf",
    "accion",
    "bono",
    "fondo",
    "certificado",
    "inmueble",
    "cripto",
    "negocio",
    "pension",
    "commodity",
    "arte",
    "nft",
    "otro",
  ]),
  symbol: z.string().trim().max(12).optional(),
  investedAmount: z.number().nonnegative(),
  contribution: z.number().nonnegative().default(0),
  currency: z.string().length(3),
  horizon: z.string().max(20).optional(),
  perceivedRisk: z.enum(["bajo", "medio", "alto", "no_se"]).optional(),
  liquidity: z.enum(["rapida", "penalidad", "largo_plazo", "no_se"]).optional(),
  dcaBroker: z.string().trim().max(80).optional(),
});

export const policyInputSchema = z.object({
  policyType: z.enum([
    "medico",
    "gastos_mayores",
    "gastos_menores",
    "vida",
    "incapacidad",
    "hogar",
    "vehiculo",
    "patrimonial",
    "empresarial",
    "familiar",
    "otro",
  ]),
  provider: z.string().trim().max(80).optional(),
  coverage: z.number().nonnegative().optional(),
  premium: z.number().nonnegative().optional(),
  premiumFrequency: z.enum(["mensual", "trimestral", "semestral", "anual"]).optional(),
  renewalDate: z.string().optional(),
  currency: z.string().length(3),
  isEssential: z.boolean().optional(),
});

export type InvestmentInput = z.infer<typeof investmentInputSchema>;
export type PolicyInput = z.infer<typeof policyInputSchema>;

const ASSET_TYPE_ENUM = [
  "etf",
  "accion",
  "bono",
  "fondo",
  "certificado",
  "inmueble",
  "cripto",
  "negocio",
  "pension",
  "commodity",
  "arte",
  "nft",
  "otro",
] as const;

export const holdingInputSchema = z.object({
  investmentId: z.string().uuid().optional(),
  // Opcional: las categorías no cotizadas no necesitan símbolo (el servicio
  // rellena un placeholder para satisfacer el NOT NULL de la columna).
  symbol: z.string().trim().max(12).toUpperCase().optional(),
  assetType: z.enum(ASSET_TYPE_ENUM),
  quantity: z.number().positive("La cantidad debe ser mayor a 0"),
  averageCost: z.number().nonnegative("El costo promedio no puede ser negativo"),
  purchaseDate: pastDateSchema.optional(),
  broker: z.string().trim().max(80).optional(),
  currency: z.string().length(3),
  label: z.string().trim().max(120).optional(),
  // Activos de renta / no cotizados.
  currentValueManual: z.number().nonnegative().optional(),
  rentalIncome: z.number().nonnegative().optional(),
  rentalFrequency: z
    .enum(["semanal", "mensual", "trimestral", "semestral", "anual", "al_vencimiento"])
    .optional(),
  annualRatePct: z.number().nonnegative().optional(),
  maturityDate: z.string().optional(),
  termYears: z.number().int().optional(),
  rentalSubtype: z.enum(["alquiler", "airbnb", "auto", "negocio", "otro"]).optional(),
  // Inmueble de renta: costos operativos (ratios 0-1 para vacancy/mgmt).
  purchasePrice: z.number().nonnegative().optional(),
  closingCosts: z.number().nonnegative().optional(),
  vacancyPct: z.number().min(0).max(1).optional(),
  mgmtPct: z.number().min(0).max(1).optional(),
  maintenanceMonthly: z.number().nonnegative().optional(),
  hoaMonthly: z.number().nonnegative().optional(),
  propertyTaxAnnual: z.number().nonnegative().optional(),
  insuranceAnnual: z.number().nonnegative().optional(),
  servicesMonthly: z.number().nonnegative().optional(),
  // Deuda que financia el inmueble (C-1b).
  debtId: z.string().uuid().optional(),
  // Taxonomía de inversiones (PLAN §2.2). `nature` es derivable de `category`
  // (el servicio la calcula si no viene).
  nature: z.enum(["cashflow", "growth"]).optional(),
  category: z.enum(INVESTMENT_CATEGORIES).optional(),
  incomeMonth: z.number().int().min(1).max(12).optional(),
  region: z.string().trim().max(20).optional(),
  isRecurring: z.boolean().optional(),
  // Aporte mensual del recurrente (separado del total invertido).
  monthlyContribution: z.number().nonnegative().optional(),
  // Fase 4.1: registrar la compra/aporte como gasto vinculado en Base
  // Financiera (default ON al crear; OFF al editar — un edit puede ser
  // corrección de datos, no un aporte real).
  registerExpense: z.boolean().optional(),
});

export const rentalPaymentInputSchema = z.object({
  holdingId: z.string().uuid(),
  receivedOn: pastDateSchema,
  amount: z.number().positive("El monto debe ser mayor a 0"),
  currency: z.string().length(3),
  frequency: z.enum(["mensual", "trimestral", "anual"]).optional(),
  holdingLabel: z.string().max(120).optional(),
  holdingSymbol: z.string().max(12).optional(),
});

export const dividendInputSchema = z.object({
  holdingId: z.string().uuid(),
  paymentDate: pastDateSchema,
  amount: z.number().positive("El monto debe ser mayor a 0"),
  currency: z.string().length(3),
  yieldPct: z.number().positive().max(100).optional(),
  frequency: z.enum(["mensual", "trimestral", "semestral", "anual"]).optional(),
  holdingLabel: z.string().max(120).optional(),
  holdingSymbol: z.string().max(12).optional(),
});

// Venta/retiro parcial de una posición (Fase 4 · flujos inversos).
export const holdingSaleInputSchema = z.object({
  holdingId: z.string().uuid(),
  saleDate: pastDateSchema,
  amount: z.number().positive("El monto debe ser mayor a 0"),
  currency: z.string().length(3),
  quantitySold: z.number().positive().optional(),
});

export type HoldingInput = z.infer<typeof holdingInputSchema>;
export type HoldingSaleInput = z.infer<typeof holdingSaleInputSchema>;
export type DividendInput = z.infer<typeof dividendInputSchema>;
export type RentalPaymentInput = z.infer<typeof rentalPaymentInputSchema>;
