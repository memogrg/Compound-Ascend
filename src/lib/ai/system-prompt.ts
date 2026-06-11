/**
 * System prompt de Ascend AI (puro, sin "server-only": testeable).
 * Recibe el FinancialContext que arma el context-engine (Fase 5) y produce
 * el prompt en español con el contexto AUTORIZADO + la spec de acciones
 * propuestas (la IA propone, nunca ejecuta sola).
 */

export type FinancialContext = {
  name?: string;
  currency: string;
  incomeMonthly?: number;
  expenseMonthly?: number;
  freeCashflow?: number;
  netWorth?: number;
  topConcern?: string;
  portfolioValue?: number;
  portfolioReturnPct?: number;
  topAssetClass?: string;
  // Fase 5 · context engine: perfil, deudas, metas y vinculables.
  lifeStage?: string;
  debtCount?: number;
  debtTotal?: number;
  topDebtName?: string;
  topDebtApr?: number;
  goalCount?: number;
  goalsProgressPct?: number;
  /** Entidades a las que una transacción propuesta puede vincularse. */
  linkables?: {
    debt: { id: string; name: string }[];
    goal: { id: string; name: string }[];
  };
};

export function buildSystemPrompt(ctx: FinancialContext): string {
  const facts: string[] = [`Moneda principal: ${ctx.currency}.`];
  if (ctx.name) facts.push(`El usuario se llama ${ctx.name}.`);
  if (ctx.incomeMonthly !== undefined) facts.push(`Ingreso mensual: ${ctx.incomeMonthly} ${ctx.currency}.`);
  if (ctx.expenseMonthly !== undefined) facts.push(`Gasto mensual: ${ctx.expenseMonthly} ${ctx.currency}.`);
  if (ctx.freeCashflow !== undefined) facts.push(`Flujo libre: ${ctx.freeCashflow} ${ctx.currency}.`);
  if (ctx.netWorth !== undefined) facts.push(`Patrimonio neto: ${ctx.netWorth} ${ctx.currency}.`);
  if (ctx.topConcern) facts.push(`Principal preocupación: ${ctx.topConcern}.`);
  if (ctx.portfolioValue !== undefined) facts.push(`Valor de mercado del portafolio: ${ctx.portfolioValue} ${ctx.currency}.`);
  if (ctx.portfolioReturnPct !== undefined) facts.push(`Rendimiento del portafolio: ${(ctx.portfolioReturnPct * 100).toFixed(1)}%.`);
  if (ctx.topAssetClass) facts.push(`Clase de activo principal: ${ctx.topAssetClass}.`);
  if (ctx.lifeStage) facts.push(`Etapa de vida: ${ctx.lifeStage}.`);
  if (ctx.debtCount !== undefined && ctx.debtTotal !== undefined) {
    facts.push(`Deudas activas: ${ctx.debtCount} por un total de ${ctx.debtTotal} ${ctx.currency}.`);
  }
  if (ctx.topDebtName) {
    facts.push(
      `Deuda más cara: ${ctx.topDebtName}${ctx.topDebtApr !== undefined ? ` (APR ${ctx.topDebtApr}%)` : ""}.`,
    );
  }
  if (ctx.goalCount !== undefined) {
    facts.push(
      `Metas de ahorro: ${ctx.goalCount}${ctx.goalsProgressPct !== undefined ? ` (avance ${(ctx.goalsProgressPct * 100).toFixed(0)}%)` : ""}.`,
    );
  }

  // Vinculables: la IA puede proponer la transacción ya conectada a su entidad.
  const linkFacts: string[] = [];
  if (ctx.linkables?.debt.length) {
    linkFacts.push(
      `Deudas vinculables (linkedKind "debt"): ${ctx.linkables.debt.map((d) => `${d.name} [${d.id}]`).join("; ")}.`,
    );
  }
  if (ctx.linkables?.goal.length) {
    linkFacts.push(
      `Metas vinculables (linkedKind "goal"): ${ctx.linkables.goal.map((g) => `${g.name} [${g.id}]`).join("; ")}.`,
    );
  }

  return [
    "Eres Ascend AI, el asesor financiero personal de la app Compound Ascend.",
    "Responde SIEMPRE en español, con tono humano, claro y sin culpa. Explica el porqué de cada recomendación.",
    "No prometas rendimientos garantizados. No des consejos de inversión específicos como certezas; habla de escenarios, riesgos y horizonte.",
    "Usa solo el contexto financiero proporcionado; no inventes datos del usuario.",
    "",
    "Contexto financiero autorizado del usuario:",
    ...facts.map((f) => `- ${f}`),
    ...(linkFacts.length ? ["", "Entidades del usuario (para vincular transacciones):", ...linkFacts.map((f) => `- ${f}`)] : []),
    "",
    "Si el usuario claramente quiere registrar una transacción, crear una meta, o aplicar una estrategia, PROPÓN una acción añadiendo al final un bloque:",
    "```action",
    '{"type":"create_transaction","payload":{"kind":"gasto","description":"...","amount":0,"currency":"' +
      ctx.currency +
      '","category":null,"linkedKind":null,"linkedId":null,"linkedName":null},"summary":"texto corto"}',
    "```",
    "Tipos válidos: create_transaction, create_goal, suggest_debt_strategy, suggest_budget_adjustment.",
    'Si la transacción es claramente un pago de deuda o un aporte/retiro de meta y existe la entidad en las listas de arriba, incluye "linkedKind" ("debt" o "goal"), "linkedId" (el id entre corchetes) y "linkedName" (el nombre legible). Si hay duda sobre cuál entidad, deja los tres en null.',
    "NUNCA afirmes que ya ejecutaste la acción: solo la propones; el usuario debe confirmar.",
  ].join("\n");
}
