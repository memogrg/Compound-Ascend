/**
 * Proveedor de IA SCRIPTED para evals de comportamiento: determinista, sin red, sin tokens.
 * Sustituye al modelo real e inyecta una respuesta (y opcionalmente una llamada a herramienta)
 * para drivear el cerebro ENSAMBLADO (orquestador + system-prompt + biblia + tools + guardrail)
 * end-to-end. Captura el system prompt / tools / mensajes recibidos para asertar invariantes.
 */
import type {
  AIProvider,
  AIChatResult,
  ChatMessage,
  VisionInput,
} from "@/lib/ai/provider";
import type { AiToolDecl, AiToolExecutor } from "@/lib/ai/tools";

export type ScriptedScript = {
  /** Texto que "genera" el modelo (puede incluir un bloque ```action``` para la regla de oro). */
  reply?: string;
  /** Si se define, en chatWithTools se ejecuta esta herramienta y su resultado se anexa al reply. */
  toolCall?: { name: string; args: Record<string, unknown> };
};

export class ScriptedProvider implements AIProvider {
  readonly name = "scripted";
  readonly model = "scripted";

  // Lo último que recibió el orquestador (para asertar el prompt/herramientas ensamblados).
  lastSystem = "";
  lastMessages: ChatMessage[] = [];
  lastTools: AiToolDecl[] = [];

  constructor(private readonly script: ScriptedScript = {}) {}

  async chat(opts: { system: string; messages: ChatMessage[] }): Promise<AIChatResult> {
    this.lastSystem = opts.system;
    this.lastMessages = opts.messages;
    return { text: this.script.reply ?? "", tokensIn: 0, tokensOut: 0 };
  }

  async vision(_opts: VisionInput): Promise<AIChatResult> {
    return { text: "{}", tokensIn: 0, tokensOut: 0 };
  }

  async chatWithTools(opts: {
    system: string;
    messages: ChatMessage[];
    tools: AiToolDecl[];
    execute: AiToolExecutor;
  }): Promise<AIChatResult> {
    this.lastSystem = opts.system;
    this.lastMessages = opts.messages;
    this.lastTools = opts.tools;
    const reply = this.script.reply ?? "";
    if (this.script.toolCall) {
      // Ejecuta la herramienta REAL (motor puro) y expone su resultado en el texto, para que
      // las evals verifiquen que el cerebro publica los NÚMEROS reales, no inventados.
      const result = await opts.execute(this.script.toolCall.name, this.script.toolCall.args);
      return { text: `${reply}\n${JSON.stringify(result)}`, tokensIn: 0, tokensOut: 0 };
    }
    return { text: reply, tokensIn: 0, tokensOut: 0 };
  }
}
