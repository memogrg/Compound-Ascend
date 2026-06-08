"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { formatMoney, formatPercent } from "@/lib/format";
import { PerformanceChart } from "@/components/charts/area-chart";
import { AddControlButton } from "./control-actions";
import {
  simulateStrategy,
  recommendMethod,
  orderDebts,
  type DebtInput,
  type DebtMethod,
} from "@/modules/control/engine/debt-strategy";
import { buildSchedule, type AmortizationInput } from "@/modules/control/engine/amortization";
import type { DebtsOverview, DebtVM } from "@/modules/control/services/debts-service";

const METHOD_LABEL: Record<DebtMethod, string> = {
  avalancha: "Avalancha",
  bola_nieve: "Bola de nieve",
  hibrido: "Híbrido",
};

function toAmortInput(d: DebtVM): AmortizationInput {
  return {
    balance: d.balance,
    apr: d.apr,
    termMonths: d.termMonths,
    monthlyPayment: d.monthlyPayment > 0 ? d.monthlyPayment : null,
    insurance: d.insurance,
    extraMonthly: d.extraMonthly,
    startDate: d.startDate,
    originalAmount: d.originalAmount,
  };
}

function toDebtInput(d: DebtVM): DebtInput {
  return {
    id: d.id,
    name: d.name,
    balance: d.balance,
    apr: d.apr,
    minPayment: d.minPayment > 0 ? d.minPayment : d.monthlyPayment,
  };
}

/** Resumen de amortización por deuda (calculado en cliente con el motor puro). */
function debtSummary(d: DebtVM) {
  const rows = buildSchedule(toAmortInput(d));
  const monthsRemaining = rows.length;
  const payoffDate = rows[rows.length - 1]?.date ?? null;
  const interestRemaining = rows.reduce((s, r) => s + r.interest, 0);
  const interestNext12 = rows.slice(0, 12).reduce((s, r) => s + r.interest, 0);
  const progress =
    d.originalAmount && d.originalAmount > 0
      ? Math.min(1, Math.max(0, (d.originalAmount - d.balance) / d.originalAmount))
      : 0;
  return { monthsRemaining, payoffDate, interestRemaining, interestNext12, progress };
}

function monthsToText(months: number): string {
  if (months <= 0) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} mes${m === 1 ? "" : "es"}`;
  if (m === 0) return `${y} año${y === 1 ? "" : "s"}`;
  return `${y} a ${m} m`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${months[Number(m) - 1] ?? ""} ${y}`;
}

/** Fecha de vencimiento corta: "12 jun". */
function dueLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(d)} ${months[Number(m) - 1] ?? ""}`;
}

/** Salud del ratio deuda/ingresos (DTI). */
function dtiHealth(dti: number): { label: string; color: string } {
  if (dti < 0.36) return { label: "Saludable", color: "var(--pos)" };
  if (dti < 0.43) return { label: "Ajustado", color: "var(--warn)" };
  return { label: "Alto", color: "var(--neg)" };
}

/** Color sólido de la categoría (barra de progreso). */
function debtColor(debtType: string | null): string {
  const t = (debtType ?? "").toLowerCase();
  if (/tarjeta/.test(t)) return "var(--neg)";
  if (/auto|veh/.test(t)) return "var(--warn)";
  if (/estud/.test(t)) return "var(--info)";
  if (/hipoteca/.test(t)) return "var(--c-networth, var(--info))";
  return "var(--muted-2)";
}

/** Gradiente del icono por categoría (estética Debts.html). */
function debtGradient(debtType: string | null): string {
  const t = (debtType ?? "").toLowerCase();
  if (/tarjeta/.test(t)) return "linear-gradient(135deg,var(--neg),var(--warn))";
  if (/auto|veh/.test(t)) return "linear-gradient(135deg,var(--warn),var(--gold,#d9a441))";
  if (/estud/.test(t)) return "linear-gradient(135deg,var(--info),var(--teal,#3aa))";
  if (/hipoteca/.test(t)) return "linear-gradient(135deg,var(--c-networth,var(--info)),var(--ink-2))";
  return "linear-gradient(135deg,var(--muted-2),var(--ink-2))";
}

/**
 * Curva de saldo total proyectado bajo la estrategia avalancha con `extra`.
 * Replica la simulación de debt-strategy registrando el saldo total por mes
 * (responde al control ± de pago extra).
 */
function strategyCurve(items: DebtInput[], extra: number, method: DebtMethod): { date: string; value: number }[] {
  const order = orderDebts(items, method);
  const state = order.map((d) => ({ ...d, bal: d.balance }));
  const totalMin = state.reduce((s, d) => s + d.minPayment, 0);
  const sum = () => Math.round(state.reduce((s, d) => s + Math.max(0, d.bal), 0));
  const curve = [{ date: "Hoy", value: sum() }];
  let months = 0;
  while (state.some((d) => d.bal > 0.01) && months < 600) {
    months += 1;
    for (const d of state) if (d.bal > 0) d.bal += d.bal * (d.apr / 100 / 12);
    let budget = totalMin + extra;
    for (const d of state) {
      if (d.bal <= 0) continue;
      const pay = Math.min(d.minPayment, d.bal, budget);
      d.bal -= pay;
      budget -= pay;
    }
    for (const d of state) {
      if (budget <= 0) break;
      if (d.bal <= 0) continue;
      const pay = Math.min(budget, d.bal);
      d.bal -= pay;
      budget -= pay;
    }
    for (const d of state) if (d.bal <= 0.01) d.bal = 0;
    curve.push({ date: payoffDateFromMonths(months), value: sum() });
  }
  return curve;
}

export function DebtsView({ overview }: { overview: DebtsOverview }) {
  const { currency, incomeMonthly, debts, freeCashflow, indexRates } = overview;
  const noDecimals = ["CRC", "COP", "MXN"].includes(currency);
  const step = noDecimals ? 25000 : 50;
  // Extra por defecto = sobrante mensual del usuario (ajustable con ±).
  const [extra, setExtra] = useState(Math.max(0, Math.round(freeCashflow)));
  // Método elegido por el usuario (null = usar el recomendado).
  const [method, setMethod] = useState<DebtMethod | null>(null);

  // Orden por el método activo.
  const recommended = useMemo(() => recommendMethod(debts.map(toDebtInput)), [debts]);
  // El selector ofrece avalancha/bola; por defecto sigue al recomendado.
  const defaultSel: DebtMethod = recommended.method === "bola_nieve" ? "bola_nieve" : "avalancha";
  const activeMethod: DebtMethod = method ?? defaultSel;

  const ordered = useMemo(() => {
    const inputs = debts.map(toDebtInput);
    const order = orderDebts(inputs, activeMethod);
    const rankById = new Map(order.map((d, i) => [d.id, i + 1]));
    return [...debts].sort(
      (a, b) => (rankById.get(a.id) ?? 99) - (rankById.get(b.id) ?? 99),
    );
  }, [debts, activeMethod]);

  const summaries = useMemo(() => new Map(debts.map((d) => [d.id, debtSummary(d)])), [debts]);

  const totals = useMemo(() => {
    const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
    const monthlyPayments = debts.reduce(
      (s, d) => s + (d.monthlyPayment > 0 ? d.monthlyPayment : d.minPayment),
      0,
    );
    const dti = incomeMonthly > 0 ? monthlyPayments / incomeMonthly : null;
    const highestApr = debts.reduce((m, d) => Math.max(m, d.apr), 0);
    const avgApr = totalDebt > 0 ? debts.reduce((s, d) => s + d.balance * d.apr, 0) / totalDebt : 0;
    const interestThisYear = debts.reduce(
      (s, d) => s + (summaries.get(d.id)?.interestNext12 ?? 0),
      0,
    );
    // Uso de crédito: saldo/monto original de tarjetas.
    const cards = debts.filter((d) => /tarjeta/i.test(d.debtType ?? ""));
    const cardLimit = cards.reduce((s, d) => s + (d.originalAmount ?? 0), 0);
    const cardBalance = cards.reduce((s, d) => s + d.balance, 0);
    const utilization = cardLimit > 0 ? cardBalance / cardLimit : null;
    return { totalDebt, monthlyPayments, dti, highestApr, avgApr, interestThisYear, utilization };
  }, [debts, incomeMonthly, summaries]);

  const strategy = useMemo(() => {
    const inputs = debts.map(toDebtInput);
    const avalancha = simulateStrategy(inputs, "avalancha", extra);
    const bolaNieve = simulateStrategy(inputs, "bola_nieve", extra);
    return { avalancha, bolaNieve };
  }, [debts, extra]);

  // Orden de ataque concreto del método activo (con tiempos por deuda).
  const attackPlan = useMemo(
    () => simulateStrategy(debts.map(toDebtInput), activeMethod, extra).payoffOrder,
    [debts, activeMethod, extra],
  );

  const curve = useMemo(() => strategyCurve(debts.map(toDebtInput), extra, activeMethod), [debts, extra, activeMethod]);

  if (debts.length === 0) {
    return (
      <div className="card card-pad" style={{ display: "grid", gap: 14, justifyItems: "start" }}>
        <div>
          <div className="card-title">Sin deudas registradas</div>
          <div className="card-sub">Cuando agregues una, verás aquí su amortización y estrategia de pago.</div>
        </div>
        <AddControlButton kind="debt" currency={currency} label="Agregar deuda" indexRates={indexRates} />
      </div>
    );
  }

  const rec = recommended;
  const activeSim = activeMethod === "bola_nieve" ? strategy.bolaNieve : strategy.avalancha;
  const debtById = new Map(debts.map((d) => [d.id, d]));

  return (
    <div className="grid">
      {/* Panel superior */}
      <section className="top-grid">
        {/* Deuda total */}
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
            <div>
              <div className="label">Deuda total</div>
              <div className="num-xl" style={{ fontSize: 44, color: "var(--neg)", marginTop: 8 }}>
                {formatMoney(totals.totalDebt, currency)}
              </div>
              <div className="row" style={{ gap: 18, marginTop: 14, fontSize: 12.5, color: "var(--muted)", flexWrap: "wrap" }}>
                <div>Pagos mensuales <strong style={{ color: "var(--ink-2)" }}>{formatMoney(totals.monthlyPayments, currency)}</strong></div>
                <div>Tasa media <strong style={{ color: "var(--ink-2)" }}>{totals.avgApr.toFixed(1)}%</strong></div>
                <div>Libre de deudas <strong style={{ color: "var(--pos)" }}>{activeSim.feasible ? fmtDate(payoffDateFromMonths(activeSim.months)) : "—"}</strong></div>
              </div>
            </div>
            {totals.dti != null ? (
              <span
                className="chip"
                style={{
                  background: `color-mix(in srgb, ${dtiHealth(totals.dti).color} 16%, transparent)`,
                  color: dtiHealth(totals.dti).color,
                }}
              >
                Ratio de deuda {formatPercent(totals.dti)} · {dtiHealth(totals.dti).label}
              </span>
            ) : null}
          </div>

          <div style={{ marginTop: 14 }}>
            <PerformanceChart data={curve} currency={currency} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 4 }}>
            Saldo proyectado con la estrategia{" "}
            <strong style={{ color: "var(--ink-2)" }}>{METHOD_LABEL[activeMethod].toLowerCase()}</strong>
          </div>
        </div>

        {/* Estrategia de pago */}
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div className="card-title">Estrategia de pago</div>
            <span className="chip" style={{ background: "linear-gradient(140deg,var(--pos-soft),var(--info-soft))", color: "var(--ink-2)" }}>
              {METHOD_LABEL[rec.method]} recomendado
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 12.5 }}>Pago extra mensual</span>
            <div className="seg" role="group" aria-label="Ajustar pago extra">
              <button className="seg-btn" onClick={() => setExtra((e) => Math.max(0, e - step))} aria-label="Reducir">−</button>
              <span className="seg-btn on tnum" style={{ minWidth: 96, textAlign: "center" }}>
                {formatMoney(extra, currency)}
              </span>
              <button className="seg-btn" onClick={() => setExtra((e) => e + step)} aria-label="Aumentar">+</button>
            </div>
            {freeCashflow > 0 ? (
              <span className="muted" style={{ fontSize: 11 }}>de tu sobrante {formatMoney(freeCashflow, currency)}</span>
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MethodCard
              label="Avalancha"
              sim={strategy.avalancha}
              currency={currency}
              selected={activeMethod === "avalancha"}
              recommended={rec.method === "avalancha"}
              onSelect={() => setMethod("avalancha")}
              note="Ataca la TAE más alta → menos intereses"
            />
            <MethodCard
              label="Bola de nieve"
              sim={strategy.bolaNieve}
              currency={currency}
              selected={activeMethod === "bola_nieve"}
              recommended={rec.method === "bola_nieve"}
              onSelect={() => setMethod("bola_nieve")}
              note="Liquida primero las pequeñas → más motivación"
            />
          </div>

          {/* Orden de ataque concreto del método elegido */}
          {attackPlan.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div className="label" style={{ fontSize: 11, marginBottom: 8 }}>
                Orden de ataque · {METHOD_LABEL[activeMethod].toLowerCase()}
              </div>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {attackPlan.map((p, i) => {
                  const d = debtById.get(p.id);
                  return (
                    <li key={p.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5 }}>
                      <span className="tnum" style={{ color: "var(--muted)", minWidth: 16 }}>{i + 1}º</span>
                      <span style={{ fontWeight: 500 }}>{d?.name ?? p.name}</span>
                      <span className="muted">— liquida en ~{monthsToText(p.monthPaid)}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}

          <div className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
            <strong style={{ color: "var(--ink-2)" }}>Recomendado: {METHOD_LABEL[rec.method].toLowerCase()}.</strong> {rec.reason}
          </div>
        </div>
      </section>

      {/* Health strip */}
      <div className="health-strip">
        <Kpi label="Deuda / ingresos" value={totals.dti != null ? formatPercent(totals.dti) : "—"} ratio={totals.dti} danger={0.4} />
        <Kpi label="Uso de crédito" value={totals.utilization != null ? formatPercent(totals.utilization) : "—"} ratio={totals.utilization} danger={0.3} />
        <Kpi label="TAE más alta" value={`${totals.highestApr.toFixed(1)}%`} ratio={totals.highestApr / 60} danger={0.5} />
        <Kpi label="Intereses (próx. 12m)" value={formatMoney(totals.interestThisYear, currency)} />
      </div>

      {/* Lista de deudas */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Tus deudas</div>
            <div className="card-sub">{debts.length} deuda(s) · orden de ataque ({METHOD_LABEL[activeMethod].toLowerCase()})</div>
          </div>
          <AddControlButton kind="debt" currency={currency} label="Agregar deuda" variant="btn-secondary" indexRates={indexRates} />
        </div>
        {ordered.map((d, i) => {
          const s = summaries.get(d.id)!;
          const isHighest = d.apr === totals.highestApr && totals.highestApr > 0;
          return (
            <Link key={d.id} href={`/deudas/${d.id}`} className="debt-row">
              <span className="debt-ic" style={{ background: debtGradient(d.debtType) }}>{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div className="debt-name">{d.name}</div>
                <div className="debt-sub">
                  {d.debtType ?? "Deuda"}
                  {d.bank ? ` · ${d.bank}` : ""}
                  {d.rateType === "variable" ? " · variable" : ""}
                  {i === 0 ? " · pagar primero" : ""}
                </div>
                {d.dueSoon && d.nextDue ? (
                  <div style={{ fontSize: 11, color: "var(--neg)", marginTop: 3, fontWeight: 500 }}>
                    Vence el {dueLabel(d.nextDue)} — {formatMoney(d.monthlyPayment > 0 ? d.monthlyPayment : d.minPayment, currency)}
                  </div>
                ) : null}
                {d.rateNote ? (
                  <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 3 }}>{d.rateNote}</div>
                ) : null}
              </div>
              <div className="dbar">
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${d.originalAmount ? Math.min(100, (d.balance / d.originalAmount) * 100) : 100}%`,
                      background: debtColor(d.debtType),
                    }}
                  />
                </div>
                <div className="dbar-meta">
                  <span>
                    {d.originalAmount
                      ? `${formatMoney(d.balance, currency)} de ${formatMoney(d.originalAmount, currency)}`
                      : formatMoney(d.balance, currency)}
                  </span>
                  <span>
                    {d.monthlyPayment > 0
                      ? `${formatMoney(d.monthlyPayment, currency)}/mes`
                      : `mín. ${formatMoney(d.minPayment, currency)}`}
                  </span>
                </div>
              </div>
              <div className={`drate${isHighest ? " high" : ""}`}>
                <div className="r">{d.apr.toFixed(1)}%</div>
                <div className="l">TAE</div>
              </div>
              <div className="dbal">
                <div>
                  <div className="b">{formatMoney(d.balance, currency)}</div>
                  <div className="m">≈ {monthsToText(s.monthsRemaining)}</div>
                </div>
                <span className="chev"><Icon name="chev" width={1.8} /></span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function payoffDateFromMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function MethodCard({
  label,
  sim,
  currency,
  selected,
  recommended,
  onSelect,
  note,
}: {
  label: string;
  sim: { months: number; totalInterest: number; feasible: boolean };
  currency: string;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
  note: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="card-pad"
      style={{
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
        border: `1px solid ${selected ? "var(--ink)" : "var(--line)"}`,
        borderRadius: "var(--r-md)",
        background: selected ? "var(--surface-2)" : "transparent",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>{label}</span>
        {recommended ? (
          <span className="chip" style={{ background: "var(--pos-soft)", color: "var(--pos)", fontSize: 10 }}>Recomendado</span>
        ) : null}
      </div>
      <div className="num-xl" style={{ fontSize: 22, marginTop: 6 }}>
        {sim.feasible ? monthsToText(sim.months) : "—"}
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
        {formatMoney(sim.totalInterest, currency)} en intereses
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>{note}</div>
    </button>
  );
}

function Kpi({
  label,
  value,
  ratio,
  danger,
}: {
  label: string;
  value: string;
  ratio?: number | null;
  danger?: number;
}) {
  const pct = ratio != null ? Math.min(100, Math.max(0, ratio * 100)) : null;
  const color = ratio != null && danger != null && ratio >= danger ? "var(--neg)" : "var(--ink-2)";
  return (
    <div className="health-cell">
      <span className="hc-label">{label}</span>
      <span className="hc-val">{value}</span>
      {pct != null ? (
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
      ) : null}
    </div>
  );
}
