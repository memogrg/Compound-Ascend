import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resolveCardLabel,
  listAccountCards,
  registerCard,
  type AccountCard,
} from "@/lib/ingestion/cards-service";

type Row = Record<string, unknown>;
const store: { account_cards: Row[] } = { account_cards: [] };

/** Fake mínimo del cliente supabase: from().select().eq()/.is() (thenable) + insert(). */
function makeClient() {
  return {
    from(table: "account_cards") {
      const filters: Array<(r: Row) => boolean> = [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push((r) => r[col] === val);
          return builder;
        },
        is: (col: string, val: unknown) => {
          filters.push((r) => r[col] === val);
          return builder;
        },
        insert: (row: Row) => {
          store[table].push(row);
          return Promise.resolve({ error: null });
        },
        then: (resolve: (v: { data: Row[]; error: null }) => void) => {
          resolve({ data: store[table].filter((r) => filters.every((f) => f(r))), error: null });
        },
      };
      return builder;
    },
  };
}

beforeEach(() => {
  store.account_cards = [];
  vi.mocked(createServiceRoleClient).mockReturnValue(
    makeClient() as unknown as ReturnType<typeof createServiceRoleClient>,
  );
});

describe("cards-service · resolveCardLabel (puro)", () => {
  const cards: AccountCard[] = [
    { last4: "2062", label: "Mastercard personal", holderName: "Memo" },
    { last4: "1234", label: "Visa negocio", holderName: null },
  ];
  it("devuelve la etiqueta del último-4 registrado", () => {
    expect(resolveCardLabel(cards, "2062")).toBe("Mastercard personal");
  });
  it("último-4 desconocido o nulo -> null", () => {
    expect(resolveCardLabel(cards, "9999")).toBeNull();
    expect(resolveCardLabel(cards, null)).toBeNull();
    expect(resolveCardLabel(cards, undefined)).toBeNull();
  });
});

describe("cards-service · registerCard + listAccountCards", () => {
  const account = { userId: "u1", householdId: "h1" };

  it("registra una tarjeta y luego la resuelve por último-4", async () => {
    const res = await registerCard({ ...account, last4: "2062", label: "Mastercard personal" });
    expect(res.ok).toBe(true);

    const cards = await listAccountCards(account);
    expect(cards).toEqual([{ last4: "2062", label: "Mastercard personal", holderName: null }]);
    expect(resolveCardLabel(cards, "2062")).toBe("Mastercard personal");
    expect(resolveCardLabel(cards, "0000")).toBeNull();
  });

  it("no devuelve tarjetas de otra cuenta", async () => {
    await registerCard({ userId: "u2", householdId: "h2", last4: "5555", label: "Otra" });
    const cards = await listAccountCards(account); // cuenta h1, sin tarjetas
    expect(cards).toEqual([]);
  });
});
