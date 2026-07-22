/**
 * Vuelca al FinancialContext los campos RANKEADOS del borrador de perfil, serializados como
 * "primaria: X · secundaria: Y · terciaria: Z" (o el único valor). UN solo lugar: lo usan
 * tanto la ruta web (context-engine) como la de WhatsApp (wa-profile-context) para que la IA
 * reciba la MISMA jerarquía por ambos canales, sin divergir. Puro, sin IO.
 */
import type { FinancialContext } from "@/lib/ai/orchestrator";
import { asRanked, formatRanking, primaryOf, deUnderscore } from "@/modules/personal-profile/engine/ranking";

export function applyRankedProfile(
  ctx: Partial<FinancialContext>,
  draft: Record<string, unknown> | null | undefined,
): void {
  if (!draft) return;
  const fmt = (raw: unknown): string | undefined => {
    const arr = asRanked(raw);
    return arr.length ? formatRanking(arr, deUnderscore) : undefined;
  };
  // Campos de DISPLAY: la jerarquía se muestra tal cual en el prompt.
  ctx.lifeStage = fmt(draft.lifeStage) ?? ctx.lifeStage;
  ctx.topConcern = fmt(draft.mainConcerns) ?? ctx.topConcern;
  ctx.lossReaction = fmt(draft.lossReaction) ?? ctx.lossReaction;
  ctx.dominantValue = fmt(draft.dineroPrimero) ?? ctx.dominantValue;
  ctx.richLifePhrase = fmt(draft.richLifePhrase) ?? ctx.richLifePhrase;
  ctx.futureImage = fmt(draft.futureImage) ?? ctx.futureImage;
  // interventionStyle es CLAVE de un mapa cerrado en el system-prompt → la PRIMARIA (clave cruda).
  const iv = primaryOf(asRanked(draft.interventionStyle));
  if (iv) ctx.interventionStyle = iv;
}
