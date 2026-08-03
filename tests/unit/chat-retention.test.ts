import { describe, it, expect } from "vitest";

import {
  CHAT_RETENTION_DAYS,
  MAX_CHAT_MESSAGES,
  retentionCutoffISO,
  retentionWindowLabel,
  retentionNoticeText,
} from "@/lib/ai/chat-retention";

describe("retención del chat · constantes", () => {
  it("la retención vigente es de una semana y la ventana leída está acotada", () => {
    expect(CHAT_RETENTION_DAYS).toBe(7);
    expect(MAX_CHAT_MESSAGES).toBeGreaterThan(0);
    expect(MAX_CHAT_MESSAGES).toBeLessThanOrEqual(500);
  });
});

describe("retentionCutoffISO · corte de la ventana retenida", () => {
  it("resta exactamente los días de retención", () => {
    expect(retentionCutoffISO(Date.parse("2026-08-03T15:00:00Z"))).toBe("2026-07-27T15:00:00.000Z");
  });
  it("sube a 30 días sin tocar el cálculo", () => {
    expect(retentionCutoffISO(Date.parse("2026-08-03T15:00:00Z"), 30)).toBe(
      "2026-07-04T15:00:00.000Z",
    );
  });
});

describe("retentionWindowLabel · el texto sigue a la constante", () => {
  it("múltiplos de 7 se dicen en semanas", () => {
    expect(retentionWindowLabel(7)).toBe("1 semana");
    expect(retentionWindowLabel(14)).toBe("2 semanas");
  });
  it("el resto se dice en días", () => {
    expect(retentionWindowLabel(1)).toBe("1 día");
    expect(retentionWindowLabel(30)).toBe("30 días");
  });
});

describe("retentionNoticeText · aviso al usuario", () => {
  it("con la retención vigente promete una semana", () => {
    expect(retentionNoticeText()).toBe(
      "Tu historial de chat se guarda por 1 semana; los mensajes más viejos se borran solos.",
    );
  });
  it("subir la retención cambia el texto solo (nada que editar a mano)", () => {
    expect(retentionNoticeText(30)).toContain("30 días");
  });
});
