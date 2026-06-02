/** Validación Zod de activos y pasivos (Módulo 5). */
import { z } from "zod";

export const assetInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(120),
  assetClass: z.enum(["liquido", "inversion", "productivo", "uso_personal", "especial"]),
  value: z.number().nonnegative(),
  currency: z.string().length(3),
  generatesIncome: z.boolean().default(false),
  liquidity: z.enum(["alta", "media", "baja"]).optional(),
});

export const liabilityInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(120),
  liabilityClass: z.enum(["consumo", "patrimonial", "productivo", "critico"]),
  balance: z.number().nonnegative(),
  currency: z.string().length(3),
});

export type AssetInput = z.infer<typeof assetInputSchema>;
export type LiabilityInput = z.infer<typeof liabilityInputSchema>;
