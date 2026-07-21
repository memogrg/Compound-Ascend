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
  amount: z.number({ error: "Monto inválido" }).nonnegative("No puede ser negativo"),
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
  amount: z.number({ error: "Monto inválido" }).nonnegative("No puede ser negativo"),
  currency: z.string().length(3),
  frequency,
  isFixed: z.boolean().default(true),
  obligation: z.enum(["obligatorio", "flexible", "deseable"]).optional(),
  reducible: z.enum(["si", "no", "tal_vez"]).optional(),
  ownerScope: ownerScope.default("usuario"),
});

export type IncomeInput = z.infer<typeof incomeInputSchema>;
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

// ---------- Base Financiera V2 ----------
const uuidOrNull = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().uuid().nullable(),
);

export const budgetItemInputSchema = z.object({
  type: z.enum(["income", "expense"]),
  categoryId: uuidOrNull.optional(),
  name: z.string().trim().min(1, "Ponle un nombre").max(120),
  amount: z.number({ error: "Monto inválido" }).nonnegative("No puede ser negativo"),
  currency: z.string().length(3),
  frequency: frequency.default("mensual"),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(3000),
  // Ingresos (Fase 1): clasificación + plantilla recurrente copy-on-demand.
  incomeType: z.enum(["activo", "pasivo", "extraordinario"]).optional(),
  recurringItemId: uuidOrNull.optional(),
  // Ingresos (Fase 3): inversión vinculada (stub de renta/dividendos).
  holdingId: uuidOrNull.optional(),
});

/**
 * Registro simplificado de una FUENTE de ingreso (tab Ingresos · Fase 1). Una
 * fuente = una línea budget_items de tipo income. `occurredOn` fija el periodo;
 * si `recurrent`, se crea/vincula una plantilla en recurring_items (copy-on-demand).
 */
export const incomeSourceInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(120),
  amount: z.number({ error: "Monto inválido" }).nonnegative("No puede ser negativo"),
  currency: z.string().length(3),
  occurredOn: z.string().min(8).max(10), // YYYY-MM-DD
  incomeType: z.enum(["activo", "pasivo", "extraordinario"]),
  recurrent: z.boolean().default(false),
  frequency: frequency.default("mensual"),
  // Subcategoría elegida (hoja del grupo del tipo); opcional.
  categoryId: uuidOrNull.optional(),
});

/**
 * Ingreso pasivo (renta/dividendos) que crea un stub de inversión vinculado
 * (Fase 3 · flujo inverso). Combina la fuente con los datos mínimos del activo.
 */
export const passiveIncomeStubInputSchema = z.object({
  income: incomeSourceInputSchema,
  subtype: z.enum(["renta", "dividendos"]),
  assetName: z.string().trim().min(1, "Ponle un nombre al activo").max(120),
  baseValue: z.number({ error: "Valor inválido" }).nonnegative("No puede ser negativo"),
});

export const txnInputSchema = z
  .object({
    kind: z.enum(["ingreso", "gasto", "ajuste"]),
    amount: z.number({ error: "Monto inválido" }).positive("Debe ser mayor a 0"),
    currency: z.string().length(3).default("CRC"),
    occurredOn: z.string().min(8).max(10), // YYYY-MM-DD
    categoryId: uuidOrNull.optional(),
    accountId: uuidOrNull.optional(),
    merchantOrSource: z.string().max(160).optional(),
    description: z.string().max(280).optional(),
    status: z.enum(["confirmed", "pending_review"]).default("confirmed"),
    origin: z.enum(["manual", "scanned", "imported", "recurring", "ai_assisted"]).default("manual"),
    // Canal de origen. Si se omite, buildTransactionRow lo deriva de `origin`.
    source: z.enum(["manual", "chat", "receipt", "recurring", "email"]).optional(),
    receiptUrl: z.string().max(500).optional(),
    confidence: z.number().min(0).max(1).optional(),
    // Vínculo transacción↔entidad (Fase 1 · orquestador). Opt-in: si se omite,
    // createTransaction persiste 'none'.
    linkedKind: z.enum(["none", "debt", "goal", "holding", "policy", "rental"]).optional(),
    linkedId: uuidOrNull.optional(),
    recurringItemId: uuidOrNull.optional(),
    // Ingresos (Fase 2): atribuye la transacción a una fuente (budget_items income).
    incomeSourceId: uuidOrNull.optional(),
    // Off-budget: false = no cuenta en el gasto del mes / free cashflow / actuals
    // (p.ej. consumo de un frasco de ahorro, que ya se contó al aportar). Opt-in
    // como el resto de los campos aditivos; si se omite, el insert usa true.
    countsInBudget: z.boolean().optional(),
  })
  .refine((d) => !d.linkedKind || d.linkedKind === "none" || !!d.linkedId, {
    message: "Un vínculo necesita la entidad (linkedId).",
    path: ["linkedId"],
  });

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(80),
  kind: z.enum(["banco", "efectivo", "tarjeta", "otro"]).default("banco"),
  currency: z.string().length(3).default("CRC"),
  isDefault: z.boolean().default(false),
});

export const transferInputSchema = z
  .object({
    fromAccountId: z.string().uuid("Elige la cuenta de origen"),
    toAccountId: z.string().uuid("Elige la cuenta de destino"),
    amount: z.number({ error: "Monto inválido" }).positive("Debe ser mayor a 0"),
    currency: z.string().length(3).default("CRC"),
    occurredOn: z.string().min(8).max(10),
    note: z.string().max(280).optional(),
  })
  .refine((d) => d.fromAccountId !== d.toAccountId, {
    message: "Elige cuentas distintas",
    path: ["toAccountId"],
  });

export const csvTxnSchema = z.object({
  kind: z.enum(["ingreso", "gasto"]),
  amount: z.number().positive(),
  occurredOn: z.string().min(8).max(10),
  description: z.string().max(200).optional(),
  currency: z.string().length(3).default("CRC"),
});

export const ruleInputSchema = z.object({
  merchantPattern: z.string().trim().min(1, "Escribe un texto a detectar").max(120),
  type: z.enum(["income", "expense"]),
  suggestedCategoryId: uuidOrNull.optional(),
  suggestedAccountId: uuidOrNull.optional(),
  active: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
  // Auto-vínculo (Fase 2): la regla puede fijar la entidad vinculada.
  linkedKind: z.enum(["debt", "goal", "holding", "policy", "rental"]).nullable().optional(),
  linkedId: uuidOrNull.optional(),
});

// ---------- Categorías personalizadas (módulo Transacciones) ----------
export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(60),
  parentId: uuidOrNull.optional(),
  categoryType: z.enum(["expense", "income", "transfer", "both"]).default("expense"),
  icon: z.string().max(40).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  isFavorite: z.boolean().optional(),
  isEssential: z.boolean().optional(),
});

export const categoryMergeSchema = z
  .object({
    fromId: z.string().uuid(),
    intoId: z.string().uuid(),
  })
  .refine((d) => d.fromId !== d.intoId, {
    message: "Elige categorías distintas",
    path: ["intoId"],
  });

export const categoryDeleteSchema = z.object({
  id: z.string().uuid(),
  reassignToId: uuidOrNull.optional(),
});

// ---------- Personalización por hogar (Fase 1: ocultar / forkear) ----------
export const categoryHideSchema = z.object({
  baseId: z.string().uuid(),
  reassignToId: uuidOrNull.optional(),
});

export const categoryForkSchema = z.object({
  baseId: z.string().uuid(),
  name: z.string().trim().min(1, "Ponle un nombre").max(60).optional(),
  icon: z.string().max(40).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  isFavorite: z.boolean().optional(),
  // "Gasto esencial": al forkear una base para marcarla esencial (una base de sistema
  // no se puede editar directo), la copia del hogar nace con este valor.
  isEssential: z.boolean().optional(),
});

export const categoryRevertSchema = z.object({
  baseId: z.string().uuid(),
});

// ---------- Plantillas / favoritos de transacción ----------
export const templateInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(80),
  kind: z.enum(["ingreso", "gasto", "transferencia"]).default("gasto"),
  amount: z.number({ error: "Monto inválido" }).positive().optional().nullable(),
  currency: z.string().length(3).default("CRC"),
  categoryId: uuidOrNull.optional(),
  accountId: uuidOrNull.optional(),
  merchantOrSource: z.string().max(160).optional().nullable(),
  note: z.string().max(280).optional().nullable(),
  isFavorite: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type BudgetItemInput = z.infer<typeof budgetItemInputSchema>;
export type IncomeSourceInput = z.infer<typeof incomeSourceInputSchema>;
export type PassiveIncomeStubInput = z.infer<typeof passiveIncomeStubInputSchema>;
export type TxnInput = z.infer<typeof txnInputSchema>;
export type AccountInput = z.infer<typeof accountInputSchema>;
export type RuleInput = z.infer<typeof ruleInputSchema>;
export type TransferInput = z.infer<typeof transferInputSchema>;
export type CsvTxnInput = z.infer<typeof csvTxnSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryMergeInput = z.infer<typeof categoryMergeSchema>;
export type CategoryDeleteInput = z.infer<typeof categoryDeleteSchema>;
export type CategoryHideInput = z.infer<typeof categoryHideSchema>;
export type CategoryForkInput = z.infer<typeof categoryForkSchema>;
export type CategoryRevertInput = z.infer<typeof categoryRevertSchema>;
export type TemplateInput = z.infer<typeof templateInputSchema>;
