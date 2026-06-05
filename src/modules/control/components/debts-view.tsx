"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { formatMoney, formatPercent } from "@/lib/format";
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

export function DebtsView({ overview }: { overview: DebtsOverview }) {
  const { currency, incomeMonthly, debts } = overview;
  const noDecimals = ["CRC", "COP", "MXN"].includes(currency);
  const step = noDecimals ? 25000 : 50;
  const [extra, setExtra] = useState(0);

  // Orden por prioridad avalancha.
  const ordered = useMemo(() => {
    const inputs = debts.map(toDebtInput);
    const order = orderDebts(inputs, "avalancha");
    const rankById = new Map(order.map((d, i) => [d.id, i + 1]));
    return [...debts].sort(
      (a, b) => (rankById.get(a.id) ?? 99) - (rankById.get(b.id) ?? 99),
    );
  }, [debts]);

  const summaries = useMemo(() => new Map(debts.map((d) => [d.id, debtSummary(d)])), [debts]);

  const totals = useMemo(() => {
    const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
    const monthlyPayments = debts.reduce(
      (s, d) => s + (d.monthlyPayment > 0 ? d.monthlyPayment : d.minPayment),
      0,
    );
    const dti = incomeMonthly > 0 ? monthlyPayments / incomeMonthly : null;
    const highestApr = debts.reduce((m, d) => Math.max(m, d.apr), 0);
    const interestThisYear = debts.reduce(
      (s, d) => s + (summaries.get(d.id)?.interestNext12 ?? 0),
      0,
    );
    // Uso de crédito: saldo/monto original de tarjetas.
    const cards = debts.filter((d) => /tarjeta/i.test(d.debtType ?? ""));
    const cardLimit = cards.reduce((s, d) => s + (d.originalAmount ?? 0), 0);
    const cardBalance = cards.reduce((s, d) => s + d.balance, 0);
    const utilization = cardLimit > 0 ? cardBalance / cardLimit : null;
    return { totalDebt, monthlyPayments, dti, highestApr, interestThisYear, utilization };
  }, [debts, incomeMonthly, summaries]);

  const strategy = useMemo(() => {
    const inputs = debts.map(toDebtInput);
    const avalancha = simulateStrategy(inputs, "avalancha", extra);
    const bolaNieve = simulateStrategy(inputs, "bola_nieve", extra);
    const recommended = recommendMethod(inputs);
    return { avalancha, bolaNieve, recommended };
  }, [debts, extra]);

  if (debts.length === 0) {
    return (
      <div className="card card-pad" style={{ display: "grid", gap: 14, justifyItems: "start" }}>
        <div>
          <div className="card-title">Sin deudas registradas</div>
          <div className="card-sub">Cuando agregues una, verás aquí su amortización y estrategia de pago.</div>
        </div>
        <AddControlButton kind="debt" currency={currency} label="Agregar deuda" />
      </div>
    );
  }

  const rec = strategy.recommended;
  const recSim = rec.method === "bola_nieve" ? strategy.bolaNieve : strategy.avalancha;

  return (
    <div className="grid">
      {/* Panel superior */}
      <section className="top-grid">
        {/* Deuda total */}
        <div className="card card-pad">
          <div className="card-title">Deuda total</div>
          <div className="num-xl" style={{ fontSize: 40, color: "var(--neg)", marginTop: 10 }}>
            {formatMoney(totals.totalDebt, currency)}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {totals.dti != null ? (
              <span className="chip" style={{ background: "var(--neg-soft)", color: "var(--neg)" }}>
                {formatPercent(totals.dti)} de tus ingresos
              </span>
            ) : null}
            <span className="chip">
              Libre en {monthsToText(recSim.months)}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
            Pagando {formatMoney(totals.monthlyPayments + extra, currency)}/mes ({METHOD_LABEL[rec.method].toLowerCase()}),
            terminarías hacia <strong style={{ color: "var(--ink-2)" }}>{fmtDate(payoffDateFromMonths(recSim.months))}</strong>{" "}
            con {formatMoney(recSim.totalInterest, currency)} en intereses.
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

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span className="muted" style={{ fontSize: 12.5 }}>Pago extra mensual</span>
            <div className="seg" role="group" aria-label="Ajustar pago extra">
              <button className="seg-btn" onClick={() => setExtra((e) => Math.max(0, e - step))} aria-label="Reducir">−</button>
              <span className="seg-btn on tnum" style={{ minWidth: 96, textAlign: "center" }}>
                {formatMoney(extra, currency)}
              </span>
              <button className="seg-btn" onClick={() => setExtra((e) => e + step)} aria-label="Aumentar">+</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MethodCard
              label="Avalancha"
              sim={strategy.avalancha}
              currency={currency}
              highlight={rec.method === "avalancha"}
              note="Ataca la TAE más alta → menos intereses"
            />
            <MethodCard
              label="Bola de nieve"
              sim={strategy.bolaNieve}
              currency={currency}
              highlight={rec.method === "bola_nieve"}
              note="Liquida primero las pequeñas → más motivación"
            />
          </div>

          <div className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
            {rec.reason}
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
            <div className="card-sub">{debts.length} deuda(s) · orden de ataque (avalancha)</div>
          </div>
          <AddControlButton kind="debt" currency={currency} label="Agregar deuda" variant="btn-secondary" />
        </div>
        {ordered.map((d, i) => {
          const s = summaries.get(d.id)!;
          const isHighest = d.apr === totals.highestApr && totals.highestApr > 0;
          return (
            <Link key={d.id} href={`/control-financiero/deudas/${d.id}`} className="debt-row">
              <span className="debt-rank">{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.name}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {d.debtType ?? "Deuda"}
                  {d.rateType === "variable" ? " · variable" : ""}
                </div>
                {d.originalAmount ? (
                  <div className="dbar">
                    <span style={{ width: `${s.progress * 100}%` }} />
                  </div>
                ) : null}
              </div>
              <span className={`drate${isHighest ? " high" : ""}`}>
                {d.apr.toFixed(1)}%
              </span>
              <div className="dbal" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div>
                  <div className="dbal-amount">{formatMoney(d.balance, currency)}</div>
                  <div className="dbal-sub">≈ {monthsToText(s.monthsRemaining)} restantes</div>
                </div>
                <Icon name="chev" width={2} />
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
  highlight,
  note,
}: {
  label: string;
  sim: { months: number; totalInterest: number; feasible: boolean };
  currency: string;
  highlight: boolean;
  note: string;
}) {
  return (
    <div
      className="card-pad"
      style={{
        border: `1px solid ${highlight ? "var(--ink)" : "var(--line)"}`,
        borderRadius: "var(--r-md)",
        background: highlight ? "var(--surface-2)" : "transparent",
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>{label}</div>
      <div className="num-xl" style={{ fontSize: 22, marginTop: 6 }}>
        {sim.feasible ? monthsToText(sim.months) : "—"}
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
        {formatMoney(sim.totalInterest, currency)} en intereses
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>{note}</div>
    </div>
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
