import { describe, it, expect } from "vitest";
import { resolveChatModel, thinkingConfigFor, CHAT_MODEL } from "@/lib/ai/providers/gemini";

describe("resolveChatModel · chat = gemini-3.1-flash-lite por default (no 2.5 ni el string viejo)", () => {
  it("sin explícito ni env → CHAT_MODEL (gemini-3.1-flash-lite)", () => {
    expect(resolveChatModel(undefined, undefined)).toBe("gemini-3.1-flash-lite");
    expect(CHAT_MODEL).toBe("gemini-3.1-flash-lite");
  });

  it("GEMINI_MODEL del env overridea el default", () => {
    expect(resolveChatModel(undefined, "gemini-2.5-flash-lite")).toBe("gemini-2.5-flash-lite");
  });

  it("modelo explícito (evals) gana sobre el env", () => {
    expect(resolveChatModel("gemini-2.5-flash", "gemini-3.1-flash-lite")).toBe("gemini-2.5-flash");
  });
});

describe("thinkingConfigFor · thinking OFF en chat y visión (flash/lite), no en *-pro", () => {
  it("gemini-3.1-flash-lite (chat) y gemini-2.5-flash (visión) → thinking OFF (budget 0)", () => {
    expect(thinkingConfigFor("gemini-3.1-flash-lite")).toEqual({ thinkingBudget: 0 });
    expect(thinkingConfigFor("gemini-2.5-flash")).toEqual({ thinkingBudget: 0 });
  });

  it("un modelo de razonamiento (*-pro) → undefined (usa su thinking por defecto)", () => {
    expect(thinkingConfigFor("gemini-2.5-pro")).toBeUndefined();
  });
});
