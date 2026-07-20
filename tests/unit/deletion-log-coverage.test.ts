/**
 * MITIGACIÓN DEL RIESGO (E3): el log de borrados se captura desde la capa de app,
 * así que solo cubre las rutas que instrumentamos. Este test escanea el código
 * fuente y verifica que TODA función de borrado de usuario sobre una tabla
 * COMPARTIBLE llame a logHouseholdDeletion. Si alguien agrega un delete nuevo sin
 * log, este test falla — que es lo que compensa no usar un trigger de BD.
 *
 * Es análisis estático (no runtime): el punto ciego que dejó pasar
 * assertLinkableEntity (#436) fue una función que los greps no veían; acá el
 * escaneo es explícito y la lista de exclusiones es revisable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Tablas que el hogar comparte (su borrado es una acción sobre datos comunes).
// NO incluye las PERSONALES (transaction_rules, perfiles, user_settings…).
const SHARED = new Set([
  "accounts", "assets", "budget_items", "debt_payments", "debts", "dividends",
  "expense_items", "goal_contributions", "income_sources", "insurance_policies",
  "investment_holdings", "investment_transactions", "investments", "liabilities",
  "rental_payments", "savings_goals", "transaction_templates", "transactions",
  "watchlist_symbols", "holding_contributions", "holding_valuations", "account_cards",
  "email_ingest_links", "ingest_proposals", "expense_categories", "goal_period_resets",
]);

// Funciones EXCLUIDAS del log, con su razón (revisable):
//  · Grupo B automáticas (sweeps/resyncs): ruido, no acciones de persona.
//  · Grupo C "mis datos" (wipe/reset por user_id).
//  · delete-en-create/rollback: no son borrados de usuario.
//  · recurring_items en cascada: secundario del income_source (primario ya logueado).
const EXCLUDED = new Set([
  "syncDerivedBudget", "sweepOrphanedDerived", "recordTransactionDelta", "relinkRentalReceipts",
  "clearAllFinancialData", "seedDemoTemplate", "completeProfile", "saveDraft",
  "createDividend", "createHolding", "registerPassiveIncomeWithStub", "updateIncomeSource",
  "deleteIncomeSourcesByHolding",
  // Reverso interno del orquestador: al borrar una transacción vinculada revierte
  // su ledger (p.ej. borra el debt_payment). El primario (la transacción) ya lo
  // registra su caller (deleteTransaction/deleteLinkedTransaction).
  "reverseLinkedTransaction",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Extrae [nombreFn, cuerpo] de cada función de nivel superior de un archivo. */
function functions(src: string): { name: string; body: string }[] {
  const re = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/g;
  const starts: { name: string; idx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ name: m[1]!, idx: m.index });
  return starts.map((s, i) => ({
    name: s.name,
    body: src.slice(s.idx, i + 1 < starts.length ? starts[i + 1]!.idx : src.length),
  }));
}

describe("cobertura del log de borrados (E3)", () => {
  const files = walk(join(process.cwd(), "src/modules")).concat(
    walk(join(process.cwd(), "src/lib")),
  );

  it("toda función que borra una tabla compartible registra en el log (o está excluida con razón)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!src.includes(".delete(")) continue;
      for (const fn of functions(src)) {
        if (EXCLUDED.has(fn.name)) continue;
        // ¿borra alguna tabla compartible? (delete literal o RPC delete_*)
        const deletesShared =
          [...fn.body.matchAll(/\.from\(\s*"([a-z_0-9]+)"\s*\)\s*\.delete\(/g)].some((mm) =>
            SHARED.has(mm[1]!),
          ) || /\.rpc\(\s*"delete_[a-z_]+"/.test(fn.body);
        if (!deletesShared) continue;
        if (!fn.body.includes("logHouseholdDeletion(")) {
          offenders.push(`${file.split(/[\/]/).slice(-1)[0]} :: ${fn.name}`);
        }
      }
    }
    expect(offenders, `Borrados sin log (agregá logHouseholdDeletion o excluí con razón):\n${offenders.join("\n")}`).toEqual([]);
  });
});
