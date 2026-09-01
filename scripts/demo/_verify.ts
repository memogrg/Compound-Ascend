import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeBaseIndicators } from "../../src/modules/financial-base/engine/base-engine.ts";
import { computeHealthScore } from "../../src/modules/financial-base/engine/health.ts";
import { recomputeFromPayments } from "../../src/modules/control/engine/amortization.ts";

const env: Record<string, string> = {};
for (const l of readFileSync(new URL("../../.env.prod.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const UID = "1727c50e-d945-4649-aa3e-0f894bd7dda2";
const crc = (n: number) => "₡" + Math.round(n).toLocaleString("es-CR");

const { data: inc } = await db.from("income_sources").select("*").eq("user_id", UID);
const { data: exp } = await db.from("expense_items").select("*").eq("user_id", UID);
const ind = computeBaseIndicators(
  (inc ?? []).map((r: any) => ({ incomeType: r.income_type, amountMonthly: Number(r.amount_monthly_base), includeInBudget: r.include_in_budget })) as any,
  (exp ?? []).map((r: any) => ({ nature: r.nature, amountMonthly: Number(r.amount_monthly_base), frequency: r.frequency })) as any,
);
const health = computeHealthScore(ind, ind.investmentRate);
console.log("\n── BASE FINANCIERA (motor real) ───────────────────────────────");
console.log(`  ingreso ${crc(ind.incomeMonthly)} · gasto ${crc(ind.expenseMonthly)} · flujo libre ${crc(ind.freeCashflow)}`);
console.log(`  ahorro ${(ind.savingsRate * 100).toFixed(0)}% · inversión ${(ind.investmentRate * 100).toFixed(0)}% · deuda ${(ind.debtWeight * 100).toFixed(0)}% · esenciales ${(ind.essentialsWeight * 100).toFixed(0)}% · estilo de vida ${(ind.lifestyleWeight * 100).toFixed(0)}%`);
console.log(`  presión financiera: ${ind.financialPressure}`);
console.log(`  SALUD FINANCIERA: ${health.score}/100 — ${health.grade}`);
console.log("  " + health.bars.map((b) => `${b.label} ${b.display}`).join(" · "));

const { data: debts } = await db.from("debts").select("*").eq("user_id", UID);
const { data: pays } = await db.from("debt_payments").select("*").eq("user_id", UID);
console.log("\n── DEUDAS (saldo vivo = ancla − pagos, motor real) ────────────");
let totalDeuda = 0;
for (const d of debts ?? []) {
  const ps = (pays ?? []).filter((p: any) => p.debt_id === d.id)
    .map((p: any) => ({ amount: Number(p.amount), paymentDate: p.occurred_on, kind: p.kind, extraAmount: Number(p.extra_amount ?? 0) }));
  const r = recomputeFromPayments({
    balance: Number(d.balance), apr: Number(d.apr ?? 0), termMonths: d.term_months,
    monthlyPayment: Number(d.current_payment) > 0 ? Number(d.current_payment) : null,
    insurance: Number(d.insurance ?? 0), extraMonthly: Number(d.extra_monthly ?? 0),
    startDate: d.start_date, originalAmount: d.original_amount == null ? null : Number(d.original_amount),
  } as any, ps as any);
  totalDeuda += r.currentBalance;
  console.log(`  ${d.name.padEnd(30)} ${crc(r.currentBalance).padStart(13)}  (era ${crc(Number(d.balance))}) · capital abonado ${crc(r.paidPrincipal)} · intereses ${crc(r.paidInterest)} · avance ${(r.progressPct * 100).toFixed(1)}% · libre en ${r.projectedPayoffMonths} meses`);
}
console.log(`  TOTAL ADEUDADO HOY: ${crc(totalDeuda)}  (hace un año: ${crc(28500000 + 7200000 + 1850000)})`);

const { data: goals } = await db.from("savings_goals").select("*").eq("user_id", UID);
console.log("\n── METAS ──────────────────────────────────────────────────────");
for (const g of goals ?? [])
  console.log(`  ${g.name.padEnd(24)} ${crc(Number(g.current_amount)).padStart(12)} / ${crc(Number(g.target_amount))}  (${((Number(g.current_amount) / Number(g.target_amount)) * 100).toFixed(0)}%) · aporte ${crc(Number(g.monthly_contribution))}/mes`);

const { data: nw } = await db.from("net_worth_snapshots").select("period,net_worth,total_assets,total_liabilities").eq("user_id", UID).order("period");
console.log("\n── PATRIMONIO NETO (histórico cerrado) ────────────────────────");
for (const s of nw ?? []) console.log(`  ${s.period.slice(0, 7)}  activos ${crc(Number(s.total_assets)).padStart(13)}  pasivos ${crc(Number(s.total_liabilities)).padStart(13)}  neto ${crc(Number(s.net_worth)).padStart(13)}`);
