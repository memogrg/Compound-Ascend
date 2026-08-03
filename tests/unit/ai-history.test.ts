import { describe, it, expect } from "vitest";
import { capHistory, priorAssistantReplies, LLM_HISTORY_WINDOW } from "@/lib/ai/history";
import type { ChatMessage } from "@/lib/ai/provider";

const turns = (n: number): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `m${i}` }) as ChatMessage);

describe("capHistory · acota el arrastre a la ventana del LLM", () => {
  it("historial más largo que la ventana → solo los últimos N (con el turno actual al final)", () => {
    const msgs = turns(20);
    const capped = capHistory(msgs);
    expect(capped).toHaveLength(LLM_HISTORY_WINDOW);
    expect(capped.at(-1)).toEqual(msgs.at(-1)); // el turno actual (último) SIEMPRE entra
    expect(capped[0]).toEqual(msgs[msgs.length - LLM_HISTORY_WINDOW]);
  });

  it("historial corto → se manda tal cual (sin perder nada)", () => {
    const msgs = turns(3);
    expect(capHistory(msgs)).toEqual(msgs);
  });

  it("ventana explícita", () => {
    expect(capHistory(turns(10), 4)).toHaveLength(4);
  });
});

describe("priorAssistantReplies · respuestas previas del asistente (dedupe del disclaimer)", () => {
  it("extrae solo el contenido de los turnos del asistente", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
    ];
    expect(priorAssistantReplies(msgs)).toEqual(["a1", "a2"]);
  });
});
