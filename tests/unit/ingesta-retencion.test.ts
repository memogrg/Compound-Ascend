/**
 * Retención de la ingesta por correo (30 días, Política de privacidad §6/§8):
 *  1. El corte es exactamente 30 días antes de "ahora"; lo estrictamente más viejo vence.
 *  2. La purga borra SOLO `ingest_proposals` e `ingest_notices`, por `created_at < corte`,
 *     sin filtrar por estado — y nunca toca `transactions`.
 *  3. Borra por lotes de 500, y una segunda corrida no borra nada (idempotente).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

type Fila = { id: string; created_at: string; status?: string };
const tablas = new Map<string, Fila[]>();
const llamadas: { table: string; op: string; args: unknown[] }[] = [];

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => ({
      select: (...sArgs: unknown[]) => {
        llamadas.push({ table, op: "select", args: sArgs });
        let corte = "";
        const q = {
          lt: (col: string, valor: string) => {
            llamadas.push({ table, op: "lt", args: [col, valor] });
            corte = valor;
            return q;
          },
          order: () => q,
          limit: async (n: number) => {
            llamadas.push({ table, op: "limit", args: [n] });
            const filas = (tablas.get(table) ?? [])
              .filter((f) => f.created_at < corte)
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .slice(0, n)
              .map((f) => ({ id: f.id }));
            return { data: filas, error: null };
          },
        };
        return q;
      },
      delete: (...dArgs: unknown[]) => {
        llamadas.push({ table, op: "delete", args: dArgs });
        return {
          in: async (col: string, ids: string[]) => {
            llamadas.push({ table, op: "in", args: [col, ids.length] });
            const antes = tablas.get(table) ?? [];
            const quedan = antes.filter((f) => !ids.includes(f.id));
            tablas.set(table, quedan);
            return { error: null, count: antes.length - quedan.length };
          },
        };
      },
    }),
  }),
}));

import {
  INGEST_RETENTION_DAYS,
  ingestRetentionCutoffISO,
  isIngestExpired,
} from "@/lib/ingestion/retention";
import { INGEST_PURGE_BATCH, purgeExpiredIngest } from "@/lib/ingestion/retention-service";

const AHORA = Date.parse("2026-10-17T12:00:00.000Z");
const CORTE = "2026-09-17T12:00:00.000Z";
const VIEJA = "2026-08-01T00:00:00.000Z";
const NUEVA = "2026-10-16T08:00:00.000Z";

function filas(prefijo: string, n: number, created_at: string, status?: string): Fila[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefijo}-${i}`, created_at, status }));
}

describe("filtro de fecha de la retención de ingesta", () => {
  it("son 30 días", () => {
    expect(INGEST_RETENTION_DAYS).toBe(30);
  });

  it("el corte es 30 días antes de ahora", () => {
    expect(ingestRetentionCutoffISO(AHORA)).toBe(CORTE);
  });

  it("vence lo estrictamente más viejo que el corte, no lo que cae justo en él", () => {
    expect(isIngestExpired("2026-09-17T11:59:59.999Z", AHORA)).toBe(true);
    expect(isIngestExpired(CORTE, AHORA)).toBe(false);
    expect(isIngestExpired(NUEVA, AHORA)).toBe(false);
  });
});

describe("purgeExpiredIngest", () => {
  beforeEach(() => {
    llamadas.length = 0;
    tablas.clear();
  });

  it("borra propuestas (de cualquier estado) y avisos vencidos, y nada más", async () => {
    tablas.set("ingest_proposals", [
      ...filas("p-pend", 1, VIEJA, "pending"),
      ...filas("p-conf", 1, VIEJA, "confirmed"),
      ...filas("p-merg", 1, VIEJA, "merged"),
      ...filas("p-nueva", 2, NUEVA, "pending"),
      { id: "p-justo", created_at: CORTE, status: "pending" },
    ]);
    tablas.set("ingest_notices", [...filas("n-vieja", 1, VIEJA), ...filas("n-nueva", 1, NUEVA)]);

    const deleted = await purgeExpiredIngest(AHORA);

    expect(deleted).toEqual({ ingest_proposals: 3, ingest_notices: 1 });
    expect(tablas.get("ingest_proposals")!.map((f) => f.id)).toEqual([
      "p-nueva-0",
      "p-nueva-1",
      "p-justo",
    ]);
    expect([...new Set(llamadas.map((l) => l.table))]).toEqual([
      "ingest_proposals",
      "ingest_notices",
    ]);
    for (const f of llamadas.filter((l) => l.op === "lt")) {
      expect(f.args).toEqual(["created_at", CORTE]);
    }
    // Ni estado (resueltas o no) ni movimientos.
    expect(llamadas.some((l) => l.table === "transactions")).toBe(false);
  });

  it("borra por lotes de 500 y la segunda corrida no borra nada", async () => {
    tablas.set("ingest_proposals", [...filas("p", 1201, VIEJA), ...filas("q", 5, NUEVA)]);

    expect(await purgeExpiredIngest(AHORA)).toEqual({ ingest_proposals: 1201, ingest_notices: 0 });
    const lotes = llamadas.filter((l) => l.table === "ingest_proposals" && l.op === "in");
    expect(lotes.map((l) => l.args[1])).toEqual([500, 500, 201]);
    for (const l of llamadas.filter((l) => l.op === "limit")) {
      expect(l.args).toEqual([INGEST_PURGE_BATCH]);
    }

    llamadas.length = 0;
    expect(await purgeExpiredIngest(AHORA)).toEqual({ ingest_proposals: 0, ingest_notices: 0 });
    expect(llamadas.some((l) => l.op === "delete")).toBe(false);
    expect(tablas.get("ingest_proposals")).toHaveLength(5);
  });
});
