/**
 * Evolución del perfil (pura, determinista, testeable). Compara la foto más
 * reciente con la más antigua disponible y narra SOLO los avances (framing
 * positivo; nunca regresiones). Sin IO.
 */
import type { Archetype } from "@/modules/personal-profile/types";
import type { ProfileSnapshotMetrics } from "@/modules/personal-profile/services/profile-snapshots";
import { ARCHETYPE_PLAYBOOKS } from "@/lib/ai/advisor-knowledge";

export type Evolution = { since: string; changes: string[] };

/** Etiqueta del arquetipo si la clave existe; si no, undefined (se omite). */
function archetypeLabel(key?: string): string | undefined {
  if (!key || !(key in ARCHETYPE_PLAYBOOKS)) return undefined;
  return ARCHETYPE_PLAYBOOKS[key as Archetype].label;
}

export function buildEvolution(
  snapshots: { capturedOn: string; metrics: ProfileSnapshotMetrics }[],
): Evolution | null {
  if (snapshots.length < 2) return null;

  // getProfileSnapshots viene captured_on DESC: [0] = más reciente, último = más viejo.
  const cur = snapshots[0]!.metrics;
  const oldest = snapshots[snapshots.length - 1]!;
  const prev = oldest.metrics;
  const changes: string[] = [];

  // Arquetipo: solo si ambos existen, cambiaron y las etiquetas resuelven.
  if (cur.archetypePrimary && prev.archetypePrimary && cur.archetypePrimary !== prev.archetypePrimary) {
    const labelPrev = archetypeLabel(prev.archetypePrimary);
    const labelCur = archetypeLabel(cur.archetypePrimary);
    if (labelPrev && labelCur) {
      changes.push(`Tu arquetipo evolucionó de ${labelPrev} a ${labelCur}.`);
    }
  }

  // Escalas numéricas (solo si subieron).
  if (typeof cur.completion === "number" && typeof prev.completion === "number" && cur.completion > prev.completion) {
    changes.push(`Completaste más tu perfil (${prev.completion}% → ${cur.completion}%).`);
  }
  if (typeof cur.discipline === "number" && typeof prev.discipline === "number" && cur.discipline > prev.discipline) {
    changes.push(`Tu disciplina subió de ${prev.discipline} a ${cur.discipline}.`);
  }
  if (
    typeof cur.perceivedControl === "number" &&
    typeof prev.perceivedControl === "number" &&
    cur.perceivedControl > prev.perceivedControl
  ) {
    changes.push(`Sientes más control de tus finanzas (${prev.perceivedControl} → ${cur.perceivedControl}).`);
  }

  // Hitos booleanos (false → true).
  if (cur.hasBase === true && prev.hasBase === false) changes.push("Construiste tu Base Financiera.");
  if (cur.hasEmergencyFund === true && prev.hasEmergencyFund === false)
    changes.push("Creaste tu fondo de emergencia.");
  if (cur.hasGoals === true && prev.hasGoals === false) changes.push("Definiste tu primera meta.");
  if (cur.hasInvestments === true && prev.hasInvestments === false)
    changes.push("Empezaste a invertir.");

  // Patrimonio neto: crecimiento ≥ 2%.
  if (
    typeof cur.netWorth === "number" &&
    typeof prev.netWorth === "number" &&
    prev.netWorth > 0 &&
    cur.netWorth > prev.netWorth
  ) {
    const pct = Math.round(((cur.netWorth - prev.netWorth) / prev.netWorth) * 100);
    if (pct >= 2) changes.push(`Tu patrimonio creció un ${pct}%.`);
  }

  if (changes.length === 0) return null; // aún no hay historia que contar.
  return { since: oldest.capturedOn, changes };
}
