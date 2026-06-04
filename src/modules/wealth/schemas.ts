/** Validación Zod de inversiones y pólizas (Módulo 4). */
import { z } from "zod";

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
  symbol: z.string().trim().min(1, "El símbolo es obligatorio").max(12).toUpperCase(),
  assetType: z.enum(ASSET_TYPE_ENUM),
  quantity: z.number().positive("La cantidad debe ser mayor a 0"),
  averageCost: z.number().nonnegative("El costo promedio no puede ser negativo"),
  purchaseDate: z.string().date().optional(),
  broker: z.string().trim().max(80).optional(),
  currency: z.string().length(3),
  label: z.string().trim().max(120).optional(),
});

export const dividendInputSchema = z.object({
  holdingId: z.string().uuid(),
  paymentDate: z.string().date(),
  amount: z.number().positive("El monto debe ser mayor a 0"),
  currency: z.string().length(3),
});

export type HoldingInput = z.infer<typeof holdingInputSchema>;
export type DividendInput = z.infer<typeof dividendInputSchema>;
