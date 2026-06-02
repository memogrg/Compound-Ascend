/** Validación Zod de ingresos y gastos (frontend y backend). */
import { z } from "zod";

const frequency = z.enum([
  "diario",
  "semanal",
  "quincenal",
  "mensual",
  "bimensual",
  "trimestral",
  "cuatrimestral",
  "semestral",
  "anual",
  "unico",
  "variable",
]);

const ownerScope = z.enum(["usuario", "pareja", "familia", "grupo"]);

export const incomeInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(120),
  incomeType: z.enum(["activo", "pasivo", "extraordinario"]),
  category: z.string().max(60).optional(),
  amount: z.number({ invalid_type_error: "Monto inválido" }).nonnegative("No puede ser negativo"),
  currency: z.string().length(3),
  frequency,
  isFixed: z.boolean().default(true),
  certainty: z.enum(["seguro", "probable", "incierto"]).optional(),
  ownerScope: ownerScope.default("usuario"),
  includeInBudget: z.boolean().default(true),
});

export const expenseInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(120),
  categoryKey: z.string().max(60).optional(),
  nature: z.enum([
    "esencial",
    "estilo_vida",
    "financiero",
    "proteccion",
    "crecimiento",
    "ahorro",
    "inversion",
    "donacion",
    "miscelaneo",
  ]),
  amount: z.number({ invalid_type_error: "Monto inválido" }).nonnegative("No puede ser negativo"),
  currency: z.string().length(3),
  frequency,
  isFixed: z.boolean().default(true),
  obligation: z.enum(["obligatorio", "flexible", "deseable"]).optional(),
  reducible: z.enum(["si", "no", "tal_vez"]).optional(),
  ownerScope: ownerScope.default("usuario"),
});

export type IncomeInput = z.infer<typeof incomeInputSchema>;
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
