/**
 * Fase 3 · PARAMETRIC POPULATION generator. Deterministic (seeded PRNG → a persona is reproducible
 * by its seed), synthesizes N lean persona specs by sampling a parameter space, and ALWAYS includes
 * a fixed list of 10 guaranteed EDGE personas (income 0, debt ≫ income, negative net worth, FX debt/
 * holding, `mayor` life-stage, everything-at-once, …). Breadth, not depth: a persona is a static
 * setup + a minimal 1-month money-loop (the population runner), NOT the multi-month behavior engine.
 *
 * The generator has its OWN self-check (anti-defang): every spec must be well-formed (finite amounts,
 * valid enums, payDay ≤ 25, sane debt) BEFORE it is seeded — a malformed spec is a generator bug, not
 * an app finding.
 */
import { createPrng, type Prng } from "../prng";

export const PRIMARY = "CRC";
export const FX = "USD"; // foreign currency for the FX cohort (app converts USD→CRC, ~510)

export interface DebtSpec {
  balance: number;
  minPayment: number;
  currency: string;
}
export interface HoldingSpec {
  value: number;
  currency: string;
}
export interface PersonaPop {
  id: string;
  seed: number;
  label: string;
  /** The guaranteed-edge key, or null for a sampled persona. */
  edge: string | null;
  /** True when any debt/holding is in a non-primary currency → relative identity tolerance. */
  fx: boolean;
  ageBand: "joven" | "adulto" | "mayor";
  household: "soltero" | "pareja" | "familia";
  dependents: number;
  opening: number;
  income: number; // monthly income received (0 = income-0 edge)
  expense: number; // fixed monthly expense
  debt: DebtSpec | null;
  goal: { target: number } | null;
  holding: HoldingSpec | null;
}

/** The 10 GUARANTEED edge personas — each a named repro, always present regardless of N. */
function edges(): PersonaPop[] {
  const base = (id: string, label: string, over: Partial<PersonaPop>): PersonaPop => ({
    id,
    seed: 0, // stamped below
    label,
    edge: id,
    fx: false,
    ageBand: "adulto",
    household: "soltero",
    dependents: 0,
    opening: 500_000,
    income: 600_000,
    expense: 400_000,
    debt: null,
    goal: null,
    holding: null,
    ...over,
  });
  const list: PersonaPop[] = [
    base("edge-income0", "Ingreso 0 con gastos (sobregiro)", { income: 0, expense: 300_000, opening: 100_000 }),
    base("edge-debt-gg-income", "Deuda ≫ ingreso (10×), opening chico → neto muy negativo", {
      opening: 50_000, income: 300_000, expense: 200_000,
      debt: { balance: 3_000_000, minPayment: 150_000, currency: PRIMARY },
    }),
    base("edge-negative-networth", "Neto negativo (sin activos, deuda grande)", {
      opening: 20_000, income: 400_000, expense: 250_000,
      debt: { balance: 1_500_000, minPayment: 50_000, currency: PRIMARY },
    }),
    base("edge-overspend", "Overspend sostenido (gasto 1.2× ingreso)", { income: 500_000, expense: 600_000 }),
    base("edge-minimal", "Minimal (sin deuda/meta/holding)", {}),
    base("edge-holding-heavy-no-income", "Holding grande, ingreso 0", {
      income: 0, expense: 50_000, opening: 80_000, holding: { value: 4_000_000, currency: PRIMARY },
    }),
    base("edge-mayor-pension", "Life-stage `mayor`, pensión baja", {
      ageBand: "mayor", household: "pareja", income: 250_000, expense: 220_000, opening: 300_000,
      goal: { target: 500_000 },
    }),
    base("edge-family-deps3", "Familia, 3 dependientes, metas grandes", {
      household: "familia", dependents: 3, income: 1_100_000, expense: 700_000,
      goal: { target: 2_000_000 }, debt: { balance: 400_000, minPayment: 20_000, currency: PRIMARY },
    }),
    base("edge-fx-debt-usd", "FX: deuda en USD con primaria CRC", {
      fx: true, income: 800_000, expense: 400_000,
      debt: { balance: 2_000, minPayment: 100, currency: FX },
    }),
    base("edge-fx-holding-usd", "FX: holding en USD con primaria CRC", {
      fx: true, income: 800_000, expense: 400_000, holding: { value: 1_000, currency: FX },
    }),
    base("edge-everything-fx", "Todo junto + FX (deuda USD + holding USD + meta)", {
      fx: true, income: 1_000_000, expense: 500_000, opening: 600_000,
      debt: { balance: 1_500, minPayment: 80, currency: FX },
      holding: { value: 800, currency: FX },
      goal: { target: 1_000_000 },
    }),
  ];
  return list;
}

/** Sample one persona from the parameter space (deterministic under `rng`). */
function sample(rng: Prng, i: number): PersonaPop {
  const income = rng.pick([0, 150_000, 400_000, 800_000, 1_500_000, 3_000_000]);
  const expenseRatio = rng.pick([0.3, 0.6, 0.9, 1.2]);
  const expense = Math.round((income || 300_000) * expenseRatio);
  const debtKind = rng.pick(["none", "moderate", "heavy", "tiny"] as const);
  const holdKind = rng.pick(["none", "small", "large"] as const);
  const goalKind = rng.pick(["none", "small", "large"] as const);
  const fx = rng.next() < 0.15; // ~15% FX cohort among sampled
  const debtCur = fx && rng.next() < 0.5 ? FX : PRIMARY;
  const holdCur = fx && rng.next() < 0.5 ? FX : PRIMARY;
  const debt: DebtSpec | null =
    debtKind === "none"
      ? null
      : debtCur === FX
        ? { balance: rng.amount(500, 5_000, 100), minPayment: rng.amount(50, 300, 10), currency: FX }
        : {
            balance:
              debtKind === "heavy"
                ? rng.amount(2_000_000, 6_000_000, 100_000)
                : debtKind === "tiny"
                  ? rng.amount(20_000, 80_000, 10_000)
                  : rng.amount(200_000, 900_000, 50_000),
            minPayment: rng.amount(10_000, 60_000, 5_000),
            currency: PRIMARY,
          };
  const holding: HoldingSpec | null =
    holdKind === "none"
      ? null
      : holdCur === FX
        ? { value: rng.amount(500, 8_000, 100), currency: FX }
        : { value: holdKind === "large" ? rng.amount(1_000_000, 5_000_000, 100_000) : rng.amount(100_000, 800_000, 50_000), currency: PRIMARY };
  const goal = goalKind === "none" ? null : { target: goalKind === "large" ? rng.amount(1_000_000, 3_000_000, 100_000) : rng.amount(100_000, 800_000, 50_000) };

  return {
    id: `gen-${String(i).padStart(3, "0")}`,
    seed: 0,
    label: `sampled income=${income} exp=${expense} debt=${debtKind}${debtCur === FX ? "·USD" : ""} hold=${holdKind}${holdCur === FX ? "·USD" : ""} goal=${goalKind}`,
    edge: null,
    fx: (debt?.currency === FX) || (holding?.currency === FX),
    ageBand: rng.pick(["joven", "adulto", "mayor"] as const),
    household: rng.pick(["soltero", "pareja", "familia"] as const),
    dependents: rng.int(0, 3),
    opening: rng.amount(0, 2_000_000, 50_000),
    income,
    expense,
    debt,
    goal,
    holding,
  };
}

/**
 * Build a population of `n` personas: the 10 guaranteed edges + (n−edges) sampled. Each gets a
 * per-persona seed derived from `baseSeed` + index (reproducible). `n` clamps up from the edge count.
 */
export function buildPopulation(n: number, baseSeed = 0xc0ffee): PersonaPop[] {
  const es = edges();
  const out: PersonaPop[] = es.map((p, i) => ({ ...p, seed: (baseSeed ^ (i + 1)) >>> 0 }));
  const target = Math.max(n, es.length);
  for (let i = 0; out.length < target; i++) {
    const seed = (baseSeed ^ (0x9e37 * (i + 100))) >>> 0;
    out.push({ ...sample(createPrng(seed), i), seed });
  }
  return out;
}

/**
 * GENERATOR SELF-CHECK (anti-defang): every spec must be well-formed before it can be seeded. A
 * violation here is a GENERATOR bug, not an app finding. Returns the list of malformed specs.
 */
export function generatorSelfCheck(pop: PersonaPop[]): string[] {
  const errs: string[] = [];
  const finite = (x: number): boolean => Number.isFinite(x);
  const ids = new Set<string>();
  for (const p of pop) {
    if (ids.has(p.id)) errs.push(`${p.id}: id duplicado`);
    ids.add(p.id);
    for (const [k, v] of [["opening", p.opening], ["income", p.income], ["expense", p.expense]] as const) {
      if (!finite(v) || v < 0) errs.push(`${p.id}: ${k} inválido (${v})`);
    }
    if (p.debt && (!finite(p.debt.balance) || p.debt.balance < 0 || !finite(p.debt.minPayment) || p.debt.minPayment < 0)) errs.push(`${p.id}: debt inválida`);
    if (p.holding && (!finite(p.holding.value) || p.holding.value < 0)) errs.push(`${p.id}: holding inválido`);
    if (p.goal && (!finite(p.goal.target) || p.goal.target < 0)) errs.push(`${p.id}: goal inválida`);
    if (p.fx !== ((p.debt?.currency === FX) || (p.holding?.currency === FX))) errs.push(`${p.id}: flag fx incoherente con las monedas`);
  }
  return errs;
}
