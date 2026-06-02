/**
 * Abstracción de proveedor de IA (intercambiable). El resto de la app depende de
 * esta interfaz, no de un proveedor concreto. Adaptador por defecto: Gemini.
 */

export type ChatRole = "user" | "assistant" | "system";
export type ChatMessage = { role: ChatRole; content: string };

export type AIUsage = { tokensIn: number; tokensOut: number };
export type AIChatResult = AIUsage & { text: string };

export type VisionInput = {
  imageBase64: string;
  mimeType: string;
  prompt: string;
};

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  chat(opts: { system: string; messages: ChatMessage[]; maxTokens?: number }): Promise<AIChatResult>;
  vision(opts: VisionInput): Promise<AIChatResult>;
}

/** Proveedor de respaldo cuando no hay credenciales: respuestas seguras y útiles. */
export class StubProvider implements AIProvider {
  readonly name = "stub";
  readonly model = "none";
  async chat(): Promise<AIChatResult> {
    return {
      text: "La IA aún no está configurada. Cuando se conecte un proveedor podré darte respuestas personalizadas. Mientras tanto, usa el asistente guiado para registrar transacciones.",
      tokensIn: 0,
      tokensOut: 0,
    };
  }
  async vision(): Promise<AIChatResult> {
    return { text: "{}", tokensIn: 0, tokensOut: 0 };
  }
}
