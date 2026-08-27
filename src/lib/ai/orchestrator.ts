import "server-only";

/**
 * Orquestador de IA: selecciona proveedor, arma el system prompt en español con
 * el contexto financiero AUTORIZADO del usuario, y parsea acciones propuestas.
 * Las acciones nunca se ejecutan aquí; requieren confirmación del usuario.
 */
import { getServerEnv } from "@/lib/env";
import { now as simNow } from "@/lib/time/clock";
import { StubProvider, type AIProvider, type ChatMessage } from "@/lib/ai/provider";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { parseAction, type AIChatResponse } from "@/lib/ai/types";
import { applyGuardrail } from "@/lib/ai/guardrail";
import { logger } from "@/lib/logger";

// El system prompt y su contexto viven en system-prompt.ts (puro, testeable);
// el context-engine (Fase 5) arma el FinancialContext con datos autorizados.
import { buildSystemPrompt, type FinancialContext } from "@/lib/ai/system-prompt";
import { selectPatrimonioGuidance } from "@/lib/ai/biblia-knowledge";
import { retrieveBiblia } from "@/lib/ai/biblia-retrieval";
import {
  SIMULATE_DEBT_TOOL,
  COMPARE_DEBT_TOOL,
  MIN_PAYMENT_TOOL,
  PROJECT_INVESTMENT_TOOL,
  FREEDOM_TOOL,
  GOALS_TOOL,
  YEARS_TO_FREEDOM_TOOL,
  MARKET_DATA_TOOL,
  SURPLUS_TOOL,
  simulateDebtPayoff,
  compareDebtStrategies,
  analyzeMinPayment,
  projectInvestment,
  projectFreedom,
  projectGoals,
  yearsToFreedom,
  computeMarketScenario,
  type GoalForTool,
  type AiToolExecutor,
} from "@/lib/ai/tools";
import { CONSULTAR_TRANSACCIONES_TOOL } from "@/lib/ai/transactions-query";
import { CONSULTAR_HISTORIAL_TOOL } from "@/lib/ai/history-query";
import { CONSULTAR_DETALLE_TOOL } from "@/lib/ai/detail-query";
import type { DebtInput } from "@/modules/control/engine/debt-strategy";
import { convertCurrency } from "@/lib/fx";
// Router de complejidad (R1): carril barato para consultas de dato. Solo importa la función
// (los tipos que el router necesita de aquí son type-only → sin ciclo en runtime).
import {
  tryRouteQuery,
  resolveMatchedIntent,
  type RouterLane,
  type MatchedIntent,
} from "@/lib/ai/router";
import { capHistory, priorAssistantReplies } from "@/lib/ai/history";
import { guardMovimientos, TOOLS_DE_MOVIMIENTOS } from "@/lib/ai/movimientos-guard";
import { guardTendencia } from "@/lib/ai/tendencia-guard";
import { guardDeudaFantasma } from "@/lib/ai/deuda-fantasma-guard";
import { detectMencionSobre } from "@/lib/ai/context-levers";
import { formatMoney } from "@/lib/format";

export type { FinancialContext };
export type { MatchedIntent };

/**
 * CONTEXTO PEREZOSO: resuelve un intent YA matcheado por patrón con el contexto MÍNIMO que la ruta
 * le construyó (0 tokens). Devuelve el resultado listo (con guardrail) o null si el dato no alcanza →
 * la ruta escala al carril LLM (ahí sí arma el contexto completo). Comparte el guardrail y el shape
 * con financeChatWithTools. No corre el clasificador Lite ni el LLM (eso es el fallback de la ruta).
 */
export async function resolveDeterministic(
  matched: MatchedIntent,
  messages: ChatMessage[],
  ctx: FinancialContext,
  toolContext: ToolContext,
): Promise<
  | (AIChatResponse & { tokensIn: number; tokensOut: number; provider: string; lane: RouterLane })
  | null
> {
  const routed = await resolveMatchedIntent(matched, ctx, toolContext).catch((err: unknown) => {
    // Mismo motivo que el catch de resolveFetchIntent: tragarlo hace que un carril determinista
    // roto se vea exactamente igual que uno que no aplicaba. Con el log, una consulta real en
    // producción dice cuál de las dos cosas pasó.
    logger.warn("orchestrator.determinista.escala", {
      intent: matched.intent,
      message: err instanceof Error ? err.message : "?",
    });
    return null;
  });
  if (!routed) return null;
  return {
    ...guardReply(routed.response, ctx, `router:${routed.lane}`, priorAssistantReplies(messages)),
    tokensIn: routed.tokensIn,
    tokensOut: routed.tokensOut,
    provider: `router:${routed.lane}`,
    lane: routed.lane,
  };
}

/**
 * Datos de solo lectura que habilitan las herramientas (chat web con sesión). Las
 * deudas vienen YA normalizadas a `currency` (la moneda principal); `fxUnavailable`
 * marca que no se pudieron convertir (cálculo asume una sola moneda).
 *
 * LOS TRES NÚMEROS PATRIMONIALES (todos "capital que, al 8% anual, cubre X gasto"; en moneda
 * PRINCIPAL; best-effort). NUNCA se mezclan ni se inventan:
 *  - `securityNumber`     → gasto ESENCIAL (Número de Seguridad).
 *  - `independenceNumber` → gasto TOTAL actual (Número de Independencia; siempre presente).
 *  - `libertyNumber`      → estilo de vida DESEADO (Número de Libertad; ausente si no lo definió).
 * `investableWealth` = patrimonio invertible (punto de partida de las proyecciones).
 */
export type ToolContext = {
  debts: DebtInput[];
  currency: string;
  /** Para la telemetría de herramientas (ai_events). Sin él, la invocación solo se loguea. */
  userId?: string;
  fxUnavailable?: boolean;
  securityNumber?: number;
  independenceNumber?: number;
  libertyNumber?: number;
  investableWealth?: number;
  /** Metas de ahorro del usuario en moneda PRINCIPAL (best-effort; vacío/undefined → tool degrada). */
  goals?: GoalForTool[];
};

/** Deuda cruda (de listDebts) con su moneda, antes de normalizar para la herramienta. */
type RawDebt = {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  apr: number | null;
  currency: string;
};

/**
 * Normaliza las deudas a la moneda principal con FX (balance y cuota mínima; las APR
 * quedan, son por deuda). Si no hay tasas (rates null), pasa los montos crudos. Puro
 * y testeable: con deudas mixtas USD+CRC convierte cada una, no suma cruda.
 */
export function normalizeDebtsForTool(
  debts: RawDebt[],
  primary: string,
  rates: Record<string, number> | null,
): DebtInput[] {
  return debts.map((d) => ({
    id: d.id,
    name: d.name,
    apr: d.apr ?? 0,
    balance: rates ? convertCurrency(d.balance, d.currency, primary, rates) : d.balance,
    minPayment: rates ? convertCurrency(d.minPayment, d.currency, primary, rates) : d.minPayment,
  }));
}

function getProvider(): AIProvider {
  if (getServerEnv().AI_PROVIDER === "gemini") {
    const g = createGeminiProvider();
    if (g) return g;
  }
  return new StubProvider();
}

export async function financeChat(
  messages: ChatMessage[],
  ctx: FinancialContext,
  // Seam de inyección (ADITIVO): por defecto el proveedor real; los evals end-to-end
  // inyectan un proveedor scripted. Ningún caller actual cambia (param opcional).
  provider: AIProvider = getProvider(),
): Promise<AIChatResponse & { tokensIn: number; tokensOut: number; provider: string }> {
  // Recuperación de la Biblia: emoción dominante (determinista) + temas (semántico con
  // fallback keyword) del último mensaje → guía conductual inyectada en el system prompt.
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content;
  // Biblia conductual + guía patrimonial §15 (banderas del diagnóstico), fusionadas y acotadas.
  const knowledge = [
    ...(await retrieveBiblia({ emotion: ctx.dominantEmotion, text: lastUser })),
    ...selectPatrimonioGuidance(ctx.patrimonioDiagnosis ?? []),
  ].slice(0, 5);
  const result = await provider.chat({
    system: buildSystemPrompt({ ...ctx, knowledge }),
    messages: capHistory(messages),
  });
  const parsed = parseAction(result.text);
  return {
    ...guardReply(parsed, ctx, provider.name, priorAssistantReplies(messages)),
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    provider: provider.name,
  };
}

/**
 * Red post-generación: pasa el reply por el guardrail determinista (no muta la
 * acción) y loguea las flags para observabilidad. No cambia el shape de la respuesta.
 */
function guardReply(
  parsed: AIChatResponse,
  ctx: FinancialContext,
  provider: string,
  priorReplies: string[] = [],
): AIChatResponse {
  const guarded = applyGuardrail(
    parsed.reply,
    {
      hasEmergencyFund: ctx.hasEmergencyFund,
      urgency: ctx.urgency,
      dependentsCount: ctx.dependentsCount,
      emergencyMonths: ctx.emergencyMonths,
    },
    priorReplies,
  );
  if (guarded.flags.length) {
    logger.info("ai-guardrail aplicado", { flags: guarded.flags, provider });
  }
  return { ...parsed, reply: guarded.reply };
}

/** Biblia conductual + guía §15, fusionadas y acotadas (compartido por ambos chats). */
async function buildKnowledge(messages: ChatMessage[], ctx: FinancialContext): Promise<string[]> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content;
  return [
    ...(await retrieveBiblia({ emotion: ctx.dominantEmotion, text: lastUser })),
    ...selectPatrimonioGuidance(ctx.patrimonioDiagnosis ?? []),
  ].slice(0, 5);
}

/**
 * Tope para el comparador abonar-vs-invertir: 5 lecturas en paralelo dentro de una iteración del
 * tool-loop. Si tarda más que esto, mejor un error explicable que quemar el presupuesto de la ruta.
 */
const SURPLUS_TIMEOUT_MS = 6_000;

/**
 * Construye el ejecutor de herramientas (SOLO lectura/cálculo) con los datos del
 * usuario. Mapea cada nombre de tool a su motor puro; herramienta desconocida → error
 * explicable (nunca escribe nada).
 */
export function buildToolExecutor(toolContext: ToolContext): AiToolExecutor {
  const meta = { currency: toolContext.currency, fxUnavailable: toolContext.fxUnavailable };
  const run: AiToolExecutor = async (name, args) => {
    if (name === "simular_pago_deuda") {
      return simulateDebtPayoff(toolContext.debts, args, simNow(), meta);
    }
    if (name === "comparar_estrategias_deuda") {
      return compareDebtStrategies(toolContext.debts, args, simNow(), meta);
    }
    if (name === "analizar_pago_minimo") {
      // Trampa del mínimo + tasa efectiva sobre las deudas reales (moneda principal).
      return analyzeMinPayment(toolContext.debts, args, { currency: toolContext.currency });
    }
    if (name === "proyectar_inversion") {
      // Pura: solo necesita la moneda principal (no ToolContext nuevo).
      return projectInvestment(args, toolContext.currency);
    }
    if (name === "proyectar_libertad_financiera") {
      // Proyecta hacia el Número de LIBERTAD (estilo de vida deseado). Si no lo definió,
      // el motor devuelve disponible:false pidiendo definirlo — nunca hacia otro número.
      return projectFreedom(args, {
        libertyNumber: toolContext.libertyNumber,
        independenceNumber: toolContext.independenceNumber,
        investableWealth: toolContext.investableWealth,
        currency: toolContext.currency,
      });
    }
    if (name === "proyectar_metas") {
      // Metas reales del usuario, ya en moneda principal.
      return projectGoals(args, { goals: toolContext.goals, currency: toolContext.currency });
    }
    if (name === "anios_para_libertad") {
      // Años hasta el Número de LIBERTAD al ritmo actual + sensibilidad (invertible real).
      return yearsToFreedom(args, {
        libertyNumber: toolContext.libertyNumber,
        independenceNumber: toolContext.independenceNumber,
        investableWealth: toolContext.investableWealth,
        currency: toolContext.currency,
      });
    }
    if (name === "comparar_abonar_vs_invertir") {
      // El comparador REAL (fondos + base + moneda + deudas + FX, 5 lecturas en paralelo). Va
      // acotado: corre DENTRO del tool-loop (hasta 3 iteraciones bajo maxDuration=60), así que no
      // puede comerse el presupuesto. Si vence o falla, error explicable — NUNCA una comparación a
      // medias, que sería peor que no responder.
      try {
        const { getSurplusDecision } =
          await import("@/modules/wealth/services/surplus-decision-service");
        const { renderSurplusDecision } = await import("@/lib/ai/surplus-render");
        const { withTimeout } = await import("@/lib/async/with-timeout");
        const reporte = await withTimeout(getSurplusDecision(), SURPLUS_TIMEOUT_MS, null);
        if (!reporte) {
          return {
            error:
              "no pude leer tus datos para la comparación a tiempo (fondos de defensa, flujo libre y deudas). Reintentá en un momento.",
          };
        }
        // `resumen_md` viene YA renderizado por plantilla determinista: el modelo lo pasa tal cual.
        return { ...reporte, resumen_md: renderSurplusDecision(reporte) };
      } catch {
        return {
          error:
            "no pude armar la comparación abonar-vs-invertir con tus datos ahora mismo. Reintentá en un momento.",
        };
      }
    }
    if (name === "consultar_transacciones") {
      // Libro diario REAL (rango/tipo/sobre/comercio + agregación). Lectura con sesión: en
      // WhatsApp no hay, así que devuelve un error explicable en vez de una cifra inventada.
      try {
        const { consultarTransacciones } = await import("@/lib/ai/transactions-query-service");
        return await consultarTransacciones(args, toolContext.currency);
      } catch {
        return {
          error:
            "no pude leer tus movimientos ahora mismo. Reintentá en un momento — el detalle está en Transacciones.",
        };
      }
    }
    if (name === "consultar_detalle") {
      // Detalle fino por dominio (pagos, aportes, compras, dividendos, liquidez). Cierra el
      // principio: ningún dominio responde "no tengo acceso".
      try {
        const { consultarDetalle } = await import("@/lib/ai/detail-query-service");
        return await consultarDetalle(args, toolContext.currency);
      } catch {
        return {
          error:
            "no pude leer ese detalle ahora mismo. Reintentá en un momento — está en la pantalla del dominio.",
        };
      }
    }
    if (name === "consultar_historial") {
      // Serie histórica REAL desde los snapshots. Sin historia suficiente el motor lo dice
      // ("todavía no tengo suficiente historial"), nunca inventa una tendencia.
      try {
        const { consultarHistorial } = await import("@/lib/ai/history-query-service");
        return await consultarHistorial(args, toolContext.currency);
      } catch {
        return {
          error:
            "no pude leer tu historial ahora mismo. Reintentá en un momento — la evolución está en Patrimonio.",
        };
      }
    }
    if (name === "datos_de_mercado") {
      // Trae precio + máximo REAL de la capa market-data (cacheada, timeout corto → no suma 503) y
      // calcula el escenario de forma determinista. Best-effort: si no hay dato, lo dice sin inventar.
      const symbol = typeof args.symbol === "string" ? args.symbol : "";
      const at =
        args.assetType === "crypto" ? "crypto" : args.assetType === "etf" ? "etf" : "stock";
      const invertido = typeof args.invertido === "number" ? args.invertido : undefined;
      const cantidad = typeof args.cantidad === "number" ? args.cantidad : undefined;
      if (!symbol) return { error: "falta el símbolo" };
      try {
        const { getMarketHighlights } = await import("@/lib/market-data");
        const { logger } = await import("@/lib/logger");
        logger.info("tool.datos_de_mercado", { symbol: symbol.toUpperCase(), assetType: at });
        const h = await getMarketHighlights(symbol, at);
        return computeMarketScenario({
          symbol: symbol.toUpperCase(),
          assetType: at,
          currency: h?.currency ?? "USD",
          price: h?.price ?? null,
          high: h?.high ?? null,
          highKind: h?.highKind ?? null,
          highDate: h?.highDate ?? null,
          invertido,
          cantidad,
        });
      } catch {
        // Sin dato de mercado: devolvemos el escenario vacío (nota pide simular con precio objetivo).
        return computeMarketScenario({
          symbol: symbol.toUpperCase(),
          assetType: at,
          currency: "USD",
          price: null,
          high: null,
          highKind: null,
          highDate: null,
          invertido,
          cantidad,
        });
      }
    }
    return { error: `herramienta no disponible: ${name}` };
  };

  /**
   * OBSERVABILIDAD: qué herramienta se invocó, cuánto tardó y si devolvió error. Sin esto no hay
   * forma de saber si una tool nueva se usa ni cuánto cuesta — se estaba decidiendo a ojo. Cuando
   * la tool devuelve un bloque ya redactado (`resumen_md`), se registra su LARGO: comparado con el
   * largo del reply final (evento 'lane') dice si el modelo lo pasó entero o lo recortó.
   *
   * Van los DOS: el log para debug en vivo, la tabla para la pregunta de dentro de un mes (los
   * runtime logs de Vercel duran horas). El insert es best-effort y no puede romper la respuesta.
   */
  return async (name, args) => {
    const inicio = Date.now();
    const result = await run(name, args);
    const obj =
      typeof result === "object" && result !== null ? (result as Record<string, unknown>) : null;
    const resumen = obj?.resumen_md;
    const ms = Date.now() - inicio;
    const ok = !obj || !("error" in obj);
    const resumenLen = typeof resumen === "string" ? resumen.length : undefined;
    logger.info("assistant.tool", {
      tool: name,
      ms,
      ok,
      ...(resumenLen !== undefined ? { resumenLen } : {}),
    });
    if (toolContext.userId) {
      const { recordAiEvent } = await import("@/lib/ai/events");
      await recordAiEvent(toolContext.userId, { kind: "tool", name, ms, ok, resumenLen });
    }
    return result;
  };
}

export const TOOLS_PROMPT_LINE =
  "Cuando el usuario pregunte cuánto tardaría en pagar su deuda o cuánto ahorraría abonando " +
  "extra, USÁ la herramienta de simulación; no inventes números. Los montos van en la moneda " +
  "principal del usuario; si la herramienta devuelve fx_no_disponible:true, aclaralo (el " +
  "cálculo asume una sola moneda). Si el usuario pregunta qué estrategia le conviene " +
  "(avalancha vs bola de nieve), USÁ comparar_estrategias_deuda y explicá cuál ahorra más " +
  "intereses y cuál da victorias más rápido; no inventes. Si pregunta cuánto podría crecer su " +
  "dinero, en cuánto llegaría a una meta o a su Número de Libertad, USÁ proyectar_inversion; no " +
  "inventes cifras de crecimiento y aclará que el rendimiento es un SUPUESTO, no una garantía. " +
  "Si pregunta cuánto le falta o cuánto al mes para SU libertad financiera, USÁ " +
  "proyectar_libertad_financiera (usa su patrimonio real); si devuelve disponible:false, decile " +
  "que primero registre gastos/patrimonio para calcular su Número de Libertad. Si pregunta por el " +
  "avance o cuándo alcanza sus metas de ahorro, USÁ proyectar_metas (datos reales); si devuelve " +
  "disponible:false, decile que primero registre una meta. " +
  "Para CUALQUIER tabla o desglose año-por-año de crecimiento o ahorro, USÁ el 'cronograma_anual' " +
  "que devuelve proyectar_inversion (saldo inicial, aportes, interés y saldo final por año). " +
  "NUNCA construyas una tabla numérica a mano ni calcules el interés compuesto de memoria. " +
  "Si el usuario pregunta en cuánto tiempo llegaría a su libertad financiera con su ritmo de " +
  "ahorro ACTUAL, o cuánto se acortaría si ahorra más, USÁ anios_para_libertad (no estimes de " +
  "memoria); el rendimiento es un SUPUESTO. " +
  "Si el usuario pregunta cuánto tardaría pagando solo el mínimo de su tarjeta/deuda, cuánto " +
  "interés le cuesta, o cuál es la tasa efectiva real, USÁ analizar_pago_minimo (no estimes de " +
  "memoria); recordá que en CR la cifra honesta incluye comisiones (TITA). " +
  "Si el usuario pregunta por el PRECIO, el ATH/MÁXIMO de un activo, o 'si vendo en el máximo/ATH, " +
  "cuánto gano', USÁ datos_de_mercado con su símbolo y assetType, y pasale `invertido` y `cantidad` " +
  "de esa posición (de tu contexto de inversiones) para que calcule la ganancia REAL al precio " +
  "actual y al máximo — NO inventes precio ni máximo. Respetá la honestidad del dato: si " +
  "maximo_tipo es '52_semanas' aclará que es el máximo de 52 semanas, no un ATH. El máximo es " +
  "PASADO: presentá la ganancia 'al máximo' como ESCENARIO hipotético, no como plan (no se puede " +
  "cronometrar el techo). Si no trae el dato, decilo y ofrecé simular con un precio objetivo. " +
  "Si el usuario pregunta si ABONAR la deuda o INVERTIR, qué hacer con lo que le sobra, o si pagar " +
  "la hipoteca o meter la plata a un ETF, USÁ comparar_abonar_vs_invertir — no armes esa " +
  "comparación de memoria ni estimes retornos. Esa herramienta devuelve un campo `resumen_md` YA " +
  "REDACTADO: pasalo TAL CUAL (íntegro, sin recortar escenarios ni caídas máximas) y agregá como " +
  "mucho UNA frase corta de encuadre. No reescribas sus cifras ni las resumas en una sola línea: el " +
  "rango con el peor caso visible ES la respuesta. Si devuelve `error`, decí qué no pudiste leer. " +
  // El carril determinista responde estas consultas sin gastar tokens, pero cuando por lo que sea
  // no aplica y caés acá, el resultado tiene que ser EL MISMO. Sin esta regla el modelo recibía el
  // payload y lo reformateaba a su gusto: viñetas y ₡/$ mezclados, justo lo que el motor ya había
  // resuelto en una tabla y en una sola moneda.
  "REGLA DE PASO DIRECTO — consultar_transacciones, consultar_historial y consultar_detalle " +
  "devuelven `resumen_md` YA REDACTADO por una plantilla determinista, con la TABLA armada y todas " +
  "las cifras en la moneda de visualización del usuario. Pasalo TAL CUAL: no lo conviertas en " +
  "viñetas, no reordenes, no recalcules el total y NUNCA mezcles monedas (si ves montos en otra " +
  "moneda dentro del payload crudo, ignoralos: el `resumen_md` ya los convirtió). Como mucho, UNA " +
  "frase corta antes o después. " +
  "Y si el usuario NOMBRA UN SOBRE ('las transacciones de restaurante', 'lo de transporte'), pasá " +
  "ese nombre en el argumento `sobre` de consultar_transacciones — sin él la herramienta devuelve " +
  "TODAS las categorías y estarías contestando otra pregunta. " +
  // El caso real: tras la tabla de conciliación el usuario escribía "dale, registralas" y el
  // modelo emitía N bloques create_transaction a mano, con montos convertidos a dólares que no
  // estaban en ningún lado. Ese camino ahora lo atiende un carril determinista.
  "ESTADO DE CUENTA PEGADO — PROHIBIDO escribir las altas a mano. Si el usuario pegó una lista de " +
  "movimientos y después pide registrar las que faltan ('dale', 'registralas', 'agregá las que " +
  "faltan'), NO emitas bloques ```action``` de create_transaction: el sistema ya tiene el bloque " +
  "parseado con los montos y las MONEDAS ORIGINALES y arma la tarjeta de alta en lote solo. " +
  "Copiar esas cifras a mano las convierte o las inventa. Si por lo que sea llegás a ese turno, " +
  "decí en una línea que la lista está lista para confirmar y NO propongas ninguna acción.";

/**
 * Como financeChat, pero habilita function-calling cuando hay `toolContext` (chat web
 * con sesión) y el proveedor lo soporta: la IA invoca motores de SOLO lectura y da
 * números calculados, no inventados. Sin toolContext (p. ej. WhatsApp) o sin soporte
 * del proveedor → idéntico a financeChat. La IA sigue PROPONIENDO, nunca ejecuta.
 */
/** Contenido del ÚLTIMO mensaje del usuario (para la detección del FOCO). "" si no hay. */
function lastUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

export async function financeChatWithTools(
  messages: ChatMessage[],
  ctx: FinancialContext,
  toolContext?: ToolContext,
  // Seam de inyección (ADITIVO): mismo proveedor para el fallback sin tools.
  provider: AIProvider = getProvider(),
): Promise<
  AIChatResponse & { tokensIn: number; tokensOut: number; provider: string; lane?: RouterLane }
> {
  if (!toolContext || !provider.chatWithTools) {
    return financeChat(messages, ctx, provider);
  }

  // Router de complejidad (R1): intenta el carril BARATO (patrones/Flash-Lite → motor + plantilla,
  // 0 tokens o clasificación mínima). Ante duda escala al razonamiento (abajo). Como esto vive
  // dentro de financeChatWithTools, cubre web y WhatsApp por igual. Best-effort: si falla, sigue.
  try {
    const routed = await tryRouteQuery(messages, ctx, toolContext);
    if (routed) {
      return {
        ...guardReply(
          routed.response,
          ctx,
          `router:${routed.lane}`,
          priorAssistantReplies(messages),
        ),
        tokensIn: routed.tokensIn,
        tokensOut: routed.tokensOut,
        provider: `router:${routed.lane}`,
        lane: routed.lane,
      };
    }
  } catch {
    // Router caído → razonamiento completo (nunca degrada la respuesta).
  }

  const knowledge = await buildKnowledge(messages, ctx);
  // FOCO (context-salience): si el ÚLTIMO mensaje nombra un sobre del contexto, su ₡ es la cifra
  // saliente del turno — así el asesor confronta con ESE monto y no con el total (Paso 3.9-#2).
  const focoSobre = detectMencionSobre(lastUserMessage(messages), ctx.expenseSobres);
  /** Herramientas que EFECTIVAMENTE corrieron en este turno (la llena `registrarUso`). */
  const usadas = new Set<string>();
  /** ¿`consultar_historial` trajo ≥2 puntos reales este turno? (respaldo para citar historia). */
  const hist: TurnHistorial = { conDatos: false };
  const result = await provider.chatWithTools({
    system: `${buildSystemPrompt({ ...ctx, knowledge, focoSobre })}\n\n${TOOLS_PROMPT_LINE}`,
    messages: capHistory(messages),
    tools: [
      SIMULATE_DEBT_TOOL,
      COMPARE_DEBT_TOOL,
      MIN_PAYMENT_TOOL,
      PROJECT_INVESTMENT_TOOL,
      FREEDOM_TOOL,
      GOALS_TOOL,
      YEARS_TO_FREEDOM_TOOL,
      MARKET_DATA_TOOL,
      SURPLUS_TOOL,
      CONSULTAR_TRANSACCIONES_TOOL,
      CONSULTAR_HISTORIAL_TOOL,
      CONSULTAR_DETALLE_TOOL,
    ],
    // Se registra QUÉ herramientas corrieron: es el dato que habilita (o no) enumerar movimientos.
    execute: registrarUso(buildToolExecutor(toolContext), usadas, hist),
  });
  const parsed = parseAction(result.text);

  // RED DETERMINISTA sobre los movimientos. Una instrucción en el prompt no es garantía: si la
  // respuesta enumera transacciones o afirma un total y en ESTE turno no corrió ninguna tool de
  // movimientos, la respuesta NO sale. Es el cierre de la clase de bug que entró tres veces por
  // puertas distintas (un sustantivo faltante en el ruteo, una cita que apagaba los carriles, una
  // ambigüedad sin salida): en todos, el LLM terminaba inventando comercios y montos.
  const consultoTool = TOOLS_DE_MOVIMIENTOS.some((t) => usadas.has(t));
  const gMov = guardMovimientos(parsed.reply, consultoTool);
  if (gMov.bloqueado) {
    logger.warn("assistant.movimientos_bloqueados", {
      // Sin el texto: puede traer cifras del usuario. Alcanza con saber que pasó y con qué tools.
      tools: [...usadas].join(",") || "ninguna",
      largo: parsed.reply.length,
    });
  }
  // RED DETERMINISTA sobre la TRAYECTORIA (hallazgo Fase 10): si la respuesta afirma evolución con
  // cifras/‏% en marco temporal y no hay respaldo ESTE turno (tool con <2 puntos para el dinero,
  // ctx.trajectory undefined para el %), no sale. A mes6 (tool ≥2 pts + trajectory definida) pasa
  // intacta y sigue citando su historia real. Encadena sobre gMov.reply (una respuesta ya
  // reemplazada por el guard de movimientos no es longitudinal, así que este no la re-toca).
  const resumenActual =
    ctx.netWorth != null && ctx.currency
      ? `tu patrimonio neto es ${formatMoney(ctx.netWorth, ctx.currency)}`
      : undefined;
  const gTend = guardTendencia(
    gMov.reply,
    { conDatos: hist.conDatos, trajectoryDefined: ctx.trajectory !== undefined, serie: hist.serie },
    resumenActual,
  );
  if (gTend.bloqueado) {
    logger.warn("assistant.tendencia_bloqueada", {
      tools: [...usadas].join(",") || "ninguna",
      largo: parsed.reply.length,
    });
  }
  // RED DETERMINISTA sobre la recomendación FANTASMA de abonar a una deuda inexistente: si no hay
  // deuda con saldo vivo y la respuesta igual da un directivo de abono en prosa, no sale (la acción
  // estructurada ya se anula en el resolvedor; esto cubre la MENCIÓN). Encadena sobre gTend.reply.
  const gDeuda = guardDeudaFantasma(gTend.reply, toolContext.debts);
  if (gDeuda.bloqueado) {
    logger.warn("assistant.deuda_fantasma_bloqueada", { deudas: toolContext.debts.length });
  }
  const bloqueado = gMov.bloqueado || gTend.bloqueado || gDeuda.bloqueado;

  return {
    ...guardReply(
      // Una respuesta bloqueada tampoco puede arrastrar una ACCIÓN propuesta: se armó sobre datos
      // que no existen.
      bloqueado ? { reply: gDeuda.reply, action: null } : parsed,
      ctx,
      provider.name,
      priorAssistantReplies(messages),
    ),
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    provider: provider.name,
    lane: "reasoning",
  };
}

/** Trayectoria observada este turno: ¿`consultar_historial` devolvió ≥2 puntos reales? + la serie
 *  de valores reales (para que el guard de tendencia verifique las cifras citadas, no solo que exista). */
type TurnHistorial = { conDatos: boolean; serie?: number[] };

/** Envuelve el ejecutor para anotar qué herramientas corrieron y si `consultar_historial` trajo
 *  ≥2 puntos reales (respaldo que consume el guard de tendencia). */
function registrarUso(
  run: AiToolExecutor,
  usadas: Set<string>,
  hist: TurnHistorial,
): AiToolExecutor {
  return async (name, args) => {
    usadas.add(name);
    const out = await run(name, args);
    // `consultar_historial` con ≥2 puntos reales ⟺ payload.insuficiente === null. Es el respaldo
    // que habilita citar cifras históricas (lo consume el guard de tendencia, igual que `usadas` al
    // de movimientos). El detalle de la serie no se guarda: alcanza con saber si hay respaldo.
    if (
      name === "consultar_historial" &&
      out !== null &&
      typeof out === "object" &&
      "insuficiente" in out &&
      (out as { insuficiente: unknown }).insuficiente === null
    ) {
      hist.conDatos = true;
      // Se guardan los VALORES de la serie real (además del booleano) para que el guard de tendencia
      // pueda refutar cifras fabricadas aunque haya respaldo (≥2 puntos).
      const serie = (out as { serie?: unknown }).serie;
      if (Array.isArray(serie)) {
        hist.serie = serie
          .map((p) =>
            p && typeof p === "object" && "valor" in p
              ? Number((p as { valor: unknown }).valor)
              : NaN,
          )
          .filter((n) => Number.isFinite(n));
      }
    }
    return out;
  };
}

export type ReceiptExtract = {
  amount: number | null;
  merchant: string | null;
  date: string | null;
  category: string | null;
};

const RECEIPT_PROMPT =
  "Eres un extractor de recibos. Analiza la imagen y devuelve SOLO un JSON válido, sin texto extra, con esta forma: " +
  '{"amount": number|null, "merchant": string|null, "date": "YYYY-MM-DD"|null, "category": string|null}. ' +
  "El monto es el total pagado. La categoría debe ser una palabra simple en español (ej. supermercado, restaurante, transporte).";

export async function scanReceipt(
  imageBase64: string,
  mimeType: string,
): Promise<{ extract: ReceiptExtract; tokensIn: number; tokensOut: number; provider: string }> {
  const provider = getProvider();
  const result = await provider.vision({ imageBase64, mimeType, prompt: RECEIPT_PROMPT });
  const extract = parseReceipt(result.text);
  return {
    extract,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    provider: provider.name,
  };
}

function parseReceipt(text: string): ReceiptExtract {
  const empty: ReceiptExtract = { amount: null, merchant: null, date: null, category: null };
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return empty;
  try {
    const o = JSON.parse(m[0]) as Partial<ReceiptExtract>;
    return {
      amount: typeof o.amount === "number" ? o.amount : null,
      merchant: typeof o.merchant === "string" ? o.merchant : null,
      date: typeof o.date === "string" ? o.date : null,
      category: typeof o.category === "string" ? o.category : null,
    };
  } catch {
    return empty;
  }
}
