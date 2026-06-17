"use client";

/**
 * Calculadora de interés compuesto (Fase 4) — 100% cliente, sin API. Proyecta
 * un capital inicial + aporte mensual a una tasa anual estimada, con la
 * frecuencia de capitalización elegida. "Usar mis datos" precarga el capital con
 * el monto invertido total del portafolio. Estilo minimalista.
 */
import { useMemo, useState } from "react";
import { PerformanceChart, type AreaPoint } from "@/components/charts/lazy";
import { formatMoney } from "@/lib/format";

const COMPOUNDING: { value: number; label: string }[] = [
  { value: 12, label: "Mensual" },
  { value: 4, label: "Trimestral" },
  { value: 2, label: "Semestral" },
  { value: 1, label: "Anual" },
];

type Projection = { finalValue: number; contributed: number; interest: number; series: AreaPoint[] };

/**
 * Proyección por iteración mensual: el aporte entra cada mes; el interés se
 * acredita cada `12/freq` meses (frecuencia de capitalización). La serie son
 * puntos anuales para la gráfica.
 */
function project(args: {
  capital: number;
  monthly: number;
  annualRatePct: number;
  years: number;
  freq: number;
}): Projection {
  const { capital, monthly, annualRatePct, years, freq } = args;
  const months = Math.round(years * 12);
  const ratePerPeriod = annualRatePct / 100 / freq;
  const monthsPerPeriod = Math.max(1, Math.round(12 / freq));

  let balance = capital;
  const series: AreaPoint[] = [{ date: "0", value: Math.round(balance) }];
  for (let m = 1; m <= months; m++) {
    balance += monthly;
    if (m % monthsPerPeriod === 0) balance *= 1 + ratePerPeriod;
    if (m % 12 === 0) series.push({ date: `${m / 12}`, value: Math.round(balance) });
  }
  if (months % 12 !== 0) series.push({ date: `${(months / 12).toFixed(1)}`, value: Math.round(balance) });

  const contributed = capital + monthly * months;
  return {
    finalValue: balance,
    contributed,
    interest: balance - contributed,
    series,
  };
}

export function CompoundCalculator({
  defaultCapital,
  currency,
}: {
  defaultCapital: number;
  currency: string;
}) {
  const [capital, setCapital] = useState("10000");
  const [monthly, setMonthly] = useState("300");
  const [rate, setRate] = useState("7");
  const [years, setYears] = useState("20");
  const [freq, setFreq] = useState(12);

  const proj = useMemo(
    () =>
      project({
        capital: parseFloat(capital) || 0,
        monthly: parseFloat(monthly) || 0,
        annualRatePct: parseFloat(rate) || 0,
        years: Math.max(0, Math.min(60, parseFloat(years) || 0)),
        freq,
      }),
    [capital, monthly, rate, years, freq],
  );

  function useMyData() {
    // El monto del aporte recurrente por holding aún no se persiste (Fase 2 solo
    // guardó is_recurring); precargamos el capital con el invertido total.
    setCapital(String(Math.round(defaultCapital)));
  }

  return (
    <div className="grid">
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="card-title">Calculadora de interés compuesto</div>
            <div className="card-sub">Proyección informativa · no es una recomendación de inversión.</div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={useMyData} disabled={defaultCapital <= 0}>
            Usar mis datos
          </button>
        </div>

        <div className="fld-2" style={{ marginTop: 14 }}>
          <Field label="Capital inicial" sym currency={currency} value={capital} onChange={setCapital} />
          <Field label="Aporte mensual" sym currency={currency} value={monthly} onChange={setMonthly} />
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Tasa anual estimada (%)</label>
            <input
              className="inp"
              type="number"
              step="0.1"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <div className="fld">
            <label className="fld-label">Años</label>
            <input
              className="inp"
              type="number"
              step="1"
              min="0"
              max="60"
              value={years}
              onChange={(e) => setYears(e.target.value)}
            />
          </div>
        </div>
        <div className="fld">
          <label className="fld-label">Frecuencia de capitalización</label>
          <div className="seg" role="group" aria-label="Frecuencia de capitalización">
            {COMPOUNDING.map((c) => (
              <button
                key={c.value}
                type="button"
                className={freq === c.value ? "seg-btn on" : "seg-btn"}
                onClick={() => setFreq(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="cols-3">
        <ResultBox label="Valor final" value={formatMoney(proj.finalValue, currency)} tone="pos" />
        <ResultBox label="Total aportado" value={formatMoney(proj.contributed, currency)} tone="neutral" />
        <ResultBox label="Intereses ganados" value={formatMoney(proj.interest, currency)} tone="info" />
      </section>

      <div className="card card-pad">
        <div className="card-title">Crecimiento proyectado</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>
          Valor estimado por año
        </div>
        <PerformanceChart data={proj.series} currency={currency} height={220} tone="pos" />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  currency,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  sym?: boolean;
  currency: string;
}) {
  const symbol = { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[currency] ?? "";
  return (
    <div className="fld">
      <label className="fld-label">{label}</label>
      <div className="inp-money">
        <span className="pre">{symbol}</span>
        <input type="number" step="any" min="0" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />
      </div>
    </div>
  );
}

function ResultBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "pos" | "info" | "neutral";
}) {
  const color = tone === "pos" ? "var(--pos)" : tone === "info" ? "var(--info)" : "var(--ink)";
  return (
    <div className="card card-pad">
      <div className="label" style={{ fontSize: 12, color: "var(--muted)" }}>
        {label}
      </div>
      <div className="num-xl" style={{ marginTop: 6, fontSize: 22, color }}>
        {value}
      </div>
    </div>
  );
}
