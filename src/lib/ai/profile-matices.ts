import "server-only";

/**
 * Matices del cierre del onboarding: una nota personal y breve generada por la IA
 * a partir de datos YA derivados del perfil (arquetipo, valor dominante, money
 * script, fortaleza y oportunidad). No bloquea el cierre: ante cualquier fallo o
 * timeout devuelve null y la UI cae con elegancia. `buildMaticesPrompt` es puro.
 */
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { getServerEnv } from "@/lib/env";

export type MaticesInput = {
  name?: string;
  archetypeLabel: string;
  archetypeLabel2?: string;
  dominantValue?: string;
  moneyScript?: string;
  dominantEmotion?: string;
  recommendedTone: string;
  topStrength?: string;
  topOpportunity: string;
};

const TIMEOUT_MS = 8000;
const MAX_CHARS = 600;

/** Construye el prompt (system + user) de forma pura y testeable. */
export function buildMaticesPrompt(p: MaticesInput): { system: string; user: string } {
  const system = [
    "Eres Ascend AI, asesor financiero conductual de Compound Ascend. Escribe una nota personal y",
    "BREVE (2 a 4 frases) para el usuario que acaba de completar su perfil. Háblale en segunda",
    `persona, en español, con tono ${p.recommendedTone}, cálido y motivador. Hila quién es`,
    "(arquetipo), lo que más quiere de su dinero y su siguiente nivel, en un párrafo natural.",
    "Esta nota es un espejo: nombra su patrón con el dinero, conecta sus números con su vida",
    "(tiempo, opciones, tranquilidad), y si hay una aparente contradicción (p.ej. alto control",
    "con alta urgencia), resuélvela en positivo. 2 a 4 frases.",
    "REGLAS ESTRICTAS: usa SOLO los datos que te doy; NO inventes cifras ni porcentajes; NO",
    "prometas rendimientos ni menciones instrumentos específicos; no repitas listas literalmente;",
    "sin juicio ni culpa; sin clichés vacíos. Devuelve SOLO el párrafo, sin encabezados ni viñetas.",
  ].join(" ");

  const lines: string[] = [];
  if (p.name) lines.push(`Nombre: ${p.name}`);
  lines.push(
    p.archetypeLabel2
      ? `Arquetipo: ${p.archetypeLabel} (con rasgos de ${p.archetypeLabel2})`
      : `Arquetipo: ${p.archetypeLabel}`,
  );
  if (p.dominantValue) lines.push(`Lo que más quiere de su dinero: ${p.dominantValue}`);
  if (p.moneyScript) lines.push(`Creencia sobre el dinero (money script): ${p.moneyScript}`);
  if (p.dominantEmotion) lines.push(`Emoción dominante: ${p.dominantEmotion}`);
  if (p.topStrength) lines.push(`Fortaleza principal: ${p.topStrength}`);
  lines.push(`Oportunidad principal (siguiente nivel): ${p.topOpportunity}`);

  return { system, user: lines.join("\n") };
}

/**
 * Genera la nota personal. Devuelve null (sin lanzar) si la IA no está activa,
 * no hay credenciales, o hay timeout/error: el cierre nunca depende de esto.
 */
export async function generateMatices(p: MaticesInput): Promise<string | null> {
  if (getServerEnv().AI_PROVIDER !== "gemini") return null;
  const provider = createGeminiProvider();
  if (!provider) return null;

  const { system, user } = buildMaticesPrompt(p);

  try {
    const result = await Promise.race([
      provider.chat({ system, messages: [{ role: "user", content: user }], maxTokens: 256 }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    if (!result) return null;
    const text = result.text.trim().slice(0, MAX_CHARS).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
