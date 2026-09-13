/**
 * Purga de `ai_conversation_turns`.
 *
 * El problema que arregla no se veía: `loadRecentTurns` solo lee los últimos 120
 * minutos, así que un turno de anteayer ya era inalcanzable — pero seguía en la tabla,
 * sin nada que lo borrara nunca. La interfaz promete que el historial se guarda 1
 * semana; la tabla lo guardaba para siempre.
 *
 * Por eso el corte que se comprueba es el de 7 días y no el de la ventana de lectura:
 * lo que se verifica es que la promesa sea literalmente cierta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

/** Lo que el doble de Supabase registra de cada llamada. */
let tablaUsada: string | null = null;
let columnaDelCorte: string | null = null;
let corteRecibido: string | null = null;
let opcionesDelDelete: unknown = null;
let resultado: { error: { message: string } | null; count: number | null } = {
  error: null,
  count: 3,
};

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from(tabla: string) {
      tablaUsada = tabla;
      return {
        delete(opts: unknown) {
          opcionesDelDelete = opts;
          return {
            async lt(columna: string, valor: string) {
              columnaDelCorte = columna;
              corteRecibido = valor;
              return resultado;
            },
          };
        },
      };
    },
  }),
}));

import { purgeExpiredConversationTurns } from "@/lib/ai/conversation-store";
import { CHAT_RETENTION_DAYS, retentionCutoffISO } from "@/lib/ai/chat-retention";

const AHORA = Date.parse("2026-09-13T05:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  tablaUsada = null;
  columnaDelCorte = null;
  corteRecibido = null;
  opcionesDelDelete = null;
  resultado = { error: null, count: 3 };
});

describe("purgeExpiredConversationTurns", () => {
  it("borra de ai_conversation_turns lo anterior al corte", async () => {
    await purgeExpiredConversationTurns(AHORA);

    expect(tablaUsada).toBe("ai_conversation_turns");
    expect(columnaDelCorte).toBe("created_at");
  });

  it("el corte son los 7 días de la retención, no los 120 min de lectura", async () => {
    await purgeExpiredConversationTurns(AHORA);

    expect(corteRecibido).toBe(retentionCutoffISO(AHORA));
    // Explícito, para que se vea qué se está afirmando: 7 días antes de AHORA.
    expect(corteRecibido).toBe("2026-09-06T05:00:00.000Z");
    expect(CHAT_RETENTION_DAYS).toBe(7);
  });

  it("pide el conteo exacto: sin eso no se sabe si borró algo", async () => {
    await purgeExpiredConversationTurns(AHORA);
    expect(opcionesDelDelete).toEqual({ count: "exact" });
  });

  it("devuelve cuántas borró", async () => {
    resultado = { error: null, count: 42 };
    expect(await purgeExpiredConversationTurns(AHORA)).toBe(42);
  });

  it("si Postgres no reporta el conteo, devuelve null en vez de inventar un 0", async () => {
    resultado = { error: null, count: null };
    expect(await purgeExpiredConversationTurns(AHORA)).toBe(null);
  });

  it("un error devuelve null SIN lanzar: no puede tumbar el cron", async () => {
    resultado = { error: { message: "permission denied" }, count: null };

    // Si esto lanzara, se llevaría puesto el resultado de la purga de chat_messages,
    // que es la que sí le importa a la persona.
    await expect(purgeExpiredConversationTurns(AHORA)).resolves.toBe(null);
  });

  it("es idempotente por construcción: el corte solo depende de `now`", async () => {
    await purgeExpiredConversationTurns(AHORA);
    const primero = corteRecibido;
    await purgeExpiredConversationTurns(AHORA);
    expect(corteRecibido).toBe(primero);
  });
});
