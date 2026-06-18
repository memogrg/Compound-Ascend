"use client";

/**
 * Calculadora de interés compuesto — 100% cliente, sin API. Re-skin fiel al
 * prototipo (design-reference/investments): sliders de capital/aporte/tasa/plazo,
 * gráfico de total acumulado vs solo aportes, y stats (total aportado, interés
 * ganado, multiplicador). "Usar mis datos" precarga el capital con el invertido
 * total del portafolio. El gráfico dual no tiene componente reutilizable (el
 * área chart solo dibuja una serie), por eso se traza inline con tokens.
 */
import { useMemo, useState } from "react";
import { formatMoney, formatCompact } from "@/lib/format";

type Projection = {
  finalValue: number;
  contributed: number;
  interest: number;
  series: number[];
  contribSeries: number[];
};

/** Capitalización mensual; series de puntos anuales (total y aportes). */
function project(capital: number, monthly: number, annualRatePct: number, years: number): Projection {
  const mr = annualRatePct / 100 / 12;
  const months = Math.round(Math.max(0, Math.min(60, years)) * 12);
  const series: number[] = [];
  const contribSeries: number[] = [];
  let balance = capital;
  let contributed = capital;
  for (let i = 0; i <= months; i++) {
    if (i > 0) {
      balance = balance * (1 + mr) + monthly;
      contributed += monthly;
    }
    if (i % 12 === 0) {
      series.push(balance);
      contribSeries.push(contributed);
    }
  }
  return { finalValue: balance, contributed, interest: balance - contributed, series, contribSeries };
}

export function CompoundCalculator({ defaultCapital, currency }: { defaultCapital: number; currency: string }) {
  const [capital, setCapital] = useState(10000);
  const [monthly, setMonthly] = useState(500);
  const [rate, setRate] = useState(8);
  const [years, setYears] = useState(20);

  const proj = useMemo(() => project(capital, monthly, rate, years), [capital, monthly, rate, years]);
  const multiplier = proj.contributed > 0 ? proj.finalValue / proj.contributed : 0;

  return (
    <div className="calc-grid">
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
          <div className="card-title" style={{ fontSize: 15 }}>Calculadora de interés compuesto</div>
          <button type="button" className="btn btn-secondary" onClick={() => setCapital(Math.round(defaultCapital))} disabled={defaultCapital <= 0}>
            Usar mis datos
          </button>
        </div>

        <Slider label="Capital inicial" display={formatMoney(capital, currency)} min={0} max={100000} step={1000} value={capital} onChange={setCapital} />
        <Slider label="Aporte mensual" display={formatMoney(monthly, currency)} min={0} max={5000} step={50} value={monthly} onChange={setMonthly} />
        <Slider label="Rendimiento anual" display={`${rate}%`} min={1} max={20} step={0.5} value={rate} onChange={setRate} />
        <Slider label="Plazo" display={`${years} años`} min={1} max={40} step={1} value={years} onChange={setYears} />
      </div>

      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="label" style={{ fontSize: 11.5, color: "var(--muted)" }}>Valor final proyectado</div>
            <div className="num-xl" style={{ fontSize: 44, marginTop: 8 }}>{formatMoney(proj.finalValue, currency)}</div>
          </div>
          <span className="status-pill live"><span className="d" />Interés compuesto</span>
        </div>

        <DualLine series={proj.series} contrib={proj.contribSeries} />

        <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 2, background: "var(--c-invest)", display: "inline-block" }} />Total acumulado
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 2, background: "var(--muted-2)", display: "inline-block" }} />Solo aportes
          </span>
        </div>

        <div className="calc-out">
          <div className="calc-stat">
            <div className="k">Total aportado</div>
            <div className="v">{formatMoney(proj.contributed, currency)}</div>
          </div>
          <div className="calc-stat">
            <div className="k">Interés ganado</div>
            <div className="v" style={{ color: "var(--pos)" }}>{formatMoney(proj.interest, currency)}</div>
          </div>
          <div className="calc-stat">
            <div className="k">Multiplicador</div>
            <div className="v">{multiplier.toFixed(1).replace(".", ",")}×</div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
          Proyección informativa · no es una recomendación de inversión. Total estimado en {formatCompact(proj.finalValue, currency)}.
        </p>
      </div>
    </div>
  );
}

function Slider({
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="calc-fld">
      <span className="calc-fld-label">
        {label}
        <span className="vv">{display}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </div>
  );
}

/** Gráfico dual (total acumulado sólido + solo aportes punteado). */
function DualLine({ series, contrib }: { series: number[]; contrib: number[] }) {
  const W = 560;
  const H = 230;
  const pad = 6;
  const all = [...series, ...contrib, 0];
  const max = Math.max(...all) * 1.04 || 1;
  const n = Math.max(series.length - 1, 1);
  const X = (i: number) => pad + i * ((W - 2 * pad) / n);
  const Y = (v: number) => H - 8 - (v / max) * (H - 20);
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const totalPath = path(series);
  const area = `${totalPath} L${X(n).toFixed(1)},${H} L${X(0).toFixed(1)},${H} Z`;
  const last = series[series.length - 1] ?? 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 230, display: "block", marginTop: 14 }} aria-hidden>
      <defs>
        <linearGradient id="ccf" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--c-invest)" stopOpacity="0.2" />
          <stop offset="1" stopColor="var(--c-invest)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="var(--line)" strokeWidth="1">
        <line x1="0" y1={H * 0.33} x2={W} y2={H * 0.33} />
        <line x1="0" y1={H * 0.66} x2={W} y2={H * 0.66} />
      </g>
      <path d={area} fill="url(#ccf)" />
      <path d={path(contrib)} fill="none" stroke="var(--muted-2)" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
      <path d={totalPath} fill="none" stroke="var(--c-invest)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={X(n).toFixed(1)} cy={Y(last).toFixed(1)} r="4" fill="var(--surface)" stroke="var(--c-invest)" strokeWidth="2" />
    </svg>
  );
}
