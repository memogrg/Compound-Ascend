import type { ReactNode } from "react";

import { mAmountScale } from "../content-kit";

/**
 * Gráficos del `vis` (columna derecha) de las 9 fichas del carrusel de Inicio
 * (piloto · Delta 2). Cada ficha del brief pide una FORMA distinta —dona, barras
 * agrupadas, ranking, medidor, checklist, hitos, tendencia— para que no se vean
 * todas iguales; aquí viven esas formas, compartidas y sin estado.
 *
 * Reglas del brief lockeado (rediseno-movil/PILOTO-Inicio-Carrusel-BriefVisual.md):
 *  - TODA gráfica lleva VALORES (moneda + %) y sus ejes rotulados. Nada de rayas sueltas.
 *  - Semántica de color: verde = ingreso/crece/aporte/deuda-que-baja; rojo = salida/
 *    pérdida/retiro/deuda-que-sube.
 *  - Barras alineadas a una LÍNEA BASE común; escala relativa al mayor para que la
 *    relación se lea (la cifra exacta va impresa, la barra solo da proporción).
 *
 * Todo es PURO (sin hooks): la ficha entera es un <Link> clickeable, así que ningún
 * gráfico puede capturar el toque para sí — se renderizan como hijos del server component.
 */

const GREEN = "var(--accent)";
const AMBER = "var(--warning)";
const RED = "var(--danger)";
const BLUE = "var(--info)";

// ---------------------------------------------------------------------------
// Dona (Ingresos activo/pasivo · Inversiones largo-plazo/flujo · Patrimonio productivo/no)
// ---------------------------------------------------------------------------
export type DonutSlice = { label: string; value: number; color: string };

/**
 * Dona con leyenda al lado: cada segmento con su color, valor y %. El centro va vacío
 * a propósito —el hueco no admite un importe— y el dato vive en la leyenda, que es lo
 * que el brief pide ("% y valor"). Los segmentos a cero no se dibujan ni se listan.
 */
export function FDonut({ slices, currency }: { slices: DonutSlice[]; currency: string }) {
  const shown = slices.filter((s) => s.value > 0);
  const total = shown.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return <span className="m-hficha-empty">Sin datos aún</span>;
  }
  const fmt = mAmountScale(
    shown.map((s) => s.value),
    currency,
    7,
  );
  let acc = 0;
  return (
    <span className="m-hficha-donut">
      <svg className="m-hficha-donut-svg" viewBox="0 0 42 42" aria-hidden>
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--surface-2)" strokeWidth={5} />
        {shown.map((s, i) => {
          const pct = (s.value / total) * 100;
          const seg = (
            <circle
              key={i}
              cx="21"
              cy="21"
              r="15.915"
              fill="none"
              stroke={s.color}
              strokeWidth={5}
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeDashoffset={`${25 - acc}`}
            />
          );
          acc += pct;
          return seg;
        })}
      </svg>
      <span className="m-hficha-legend">
        {shown.map((s, i) => (
          <span key={i} className="m-hficha-leg">
            <span className="m-hficha-dot" style={{ background: s.color }} aria-hidden />
            <span className="m-hficha-leg-txt">
              <span className="m-hficha-leg-l">{s.label}</span>
              <span className="m-hficha-leg-v">
                {fmt(s.value)} · {Math.round((s.value / total) * 100)}%
              </span>
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Barras agrupadas plan·real (Presupuesto): Ingreso y Gasto, sobre línea base común
// ---------------------------------------------------------------------------
type ParPlanReal = { plan: number; real: number };

/**
 * Dos grupos —Ingreso (verde) y Gasto (rojo)—, cada uno con su barra de PLAN (fantasma)
 * y su barra REAL (sólida) sobre la misma línea base. La escala es común a las cuatro
 * barras para que se comparen entre sí. Debajo de cada grupo van los dos valores: el
 * real en negrita y el plan atenuado, así no hace falta leyenda aparte.
 */
export function FGroupedBars({
  ingreso,
  gasto,
  currency,
}: {
  ingreso: ParPlanReal;
  gasto: ParPlanReal;
  currency: string;
}) {
  const H = 42;
  const max = Math.max(ingreso.plan, ingreso.real, gasto.plan, gasto.real, 1);
  const h = (v: number) => Math.max(3, Math.round((Math.max(0, v) / max) * H));
  const fmt = mAmountScale([ingreso.plan, ingreso.real, gasto.plan, gasto.real], currency, 6);
  const Group = ({ label, par, color }: { label: string; par: ParPlanReal; color: string }) => (
    <span className="m-hficha-gb-group">
      <span className="m-hficha-gb-bars" style={{ height: H }} aria-hidden>
        <span
          className="m-hficha-gb-bar"
          style={{ height: h(par.plan), background: color, opacity: 0.32 }}
        />
        <span className="m-hficha-gb-bar" style={{ height: h(par.real), background: color }} />
      </span>
      <span className="m-hficha-gb-l">{label}</span>
      <span className="m-hficha-gb-v">
        <b>{fmt(par.real)}</b>
        <span className="m-hficha-gb-plan">plan {fmt(par.plan)}</span>
      </span>
    </span>
  );
  return (
    <span className="m-hficha-gb">
      <Group label="Ingreso" par={ingreso} color={GREEN} />
      <Group label="Gasto" par={gasto} color={RED} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Ranking horizontal (Gastos): top sobres con su valor
// ---------------------------------------------------------------------------
/**
 * Los sobres que más pesan, como barras horizontales a escala del mayor, con la
 * etiqueta y el importe. Rojo tenue: son salidas, pero es un desglose, no una alarma.
 */
export function FRanking({
  items,
  currency,
}: {
  items: { label: string; value: number }[];
  currency: string;
}) {
  if (items.length === 0) {
    return <span className="m-hficha-empty">Sin gastos aún</span>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  const fmt = mAmountScale(
    items.map((i) => i.value),
    currency,
    7,
  );
  return (
    <span className="m-hficha-rank">
      {items.map((it, i) => (
        <span key={i} className="m-hficha-rank-row">
          <span className="m-hficha-rank-l">{it.label}</span>
          <span className="m-hficha-rank-track" aria-hidden>
            <span
              className="m-hficha-rank-fill"
              style={{ width: `${Math.max(6, (it.value / max) * 100)}%` }}
            />
          </span>
          <span className="m-hficha-rank-v">{fmt(it.value)}</span>
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Proyección de cierre (Deudas): línea descendente saldo→0 en N meses
// ---------------------------------------------------------------------------
/**
 * SIN historia del saldo (eso es Delta 3), la tendencia se dibuja como PROYECCIÓN: del
 * saldo de hoy (rojo) a 0 en `mesesACierre` (verde, porque bajar deuda es bueno). Ejes
 * rotulados: X = meses, Y = saldo. Si la simulación no es factible con los mínimos, no
 * se inventa una recta: se degrada a un aviso.
 */
export function FPayoff({
  total,
  mesesACierre,
  currency,
}: {
  total: number;
  mesesACierre: number | null;
  currency: string;
}) {
  const fmt = mAmountScale([total], currency, 7);
  if (mesesACierre == null || mesesACierre <= 0) {
    return (
      <span className="m-hficha-payoff">
        <span className="m-hficha-payoff-flat" aria-hidden />
        <span className="m-hficha-payoff-x">
          <span>{fmt(total)}</span>
          <span className="m-hficha-payoff-note">sin proyección</span>
        </span>
      </span>
    );
  }
  return (
    <span className="m-hficha-payoff">
      <svg
        className="m-hficha-payoff-svg"
        viewBox="0 0 100 46"
        preserveAspectRatio="none"
        aria-hidden
      >
        {/* Línea base (eje X) */}
        <line x1="2" y1="42" x2="98" y2="42" stroke="var(--border)" strokeWidth={1} />
        {/* Proyección descendente saldo→0 */}
        <line
          x1="6"
          y1="6"
          x2="94"
          y2="40"
          stroke={GREEN}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx="6" cy="6" r="3.4" fill={RED} />
        <circle cx="94" cy="40" r="3.4" fill={GREEN} />
      </svg>
      <span className="m-hficha-payoff-ax">
        <span>
          hoy <b>{fmt(total)}</b>
        </span>
        <span>
          mes {mesesACierre} <b>₡0</b>
        </span>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Checklist (Protección): 5 protecciones base con ✓ verde / ✗ rojo
// ---------------------------------------------------------------------------
export function FChecklist({
  items,
}: {
  items: { key: string; label: string; covered: boolean }[];
}) {
  return (
    <span className="m-hficha-check">
      {items.map((it) => (
        <span key={it.key} className={`m-hficha-check-row${it.covered ? " on" : ""}`}>
          <span className="m-hficha-check-i" aria-hidden>
            {it.covered ? "✓" : "✗"}
          </span>
          <span className="m-hficha-check-l">{it.label}</span>
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Hitos (Libertad): Partida → Seguridad → Independencia → Libertad, monto + %
// ---------------------------------------------------------------------------
/**
 * La escalera de hitos como filas compactas: un punto, la etiqueta, y a la derecha el
 * monto objetivo + % de avance. El COLOR codifica el estado, no solo el pct: alcanzado
 * (verde, relleno), en curso (ámbar, relleno), pendiente (rojo, contorno). Así se ve de
 * un vistazo en qué hito estás, no solo cuáles pasaste. El monto ₡0 no se imprime como
 * cifra: Partida (alcanzada) muestra ✓ y Libertad sin meta definida, "Por definir".
 */
export type MilestoneVisState = "done" | "current" | "pending";

export function FMilestones({
  steps,
  currency,
}: {
  steps: { label: string; amount: number; pct: number; state: MilestoneVisState }[];
  currency: string;
}) {
  const fmt = mAmountScale(
    steps.map((s) => s.amount),
    currency,
    6,
  );
  const color = (st: MilestoneVisState) => (st === "done" ? GREEN : st === "current" ? AMBER : RED);
  return (
    <span className="m-hficha-miles">
      {steps.map((s, i) => {
        const c = color(s.state);
        const filled = s.state !== "pending"; // pendiente = contorno; alcanzado/en curso = relleno
        return (
          <span key={i} className={`m-hficha-mile${s.state === "pending" ? "" : " on"}`}>
            <span
              className="m-hficha-mile-dot"
              style={{ background: filled ? c : "transparent", borderColor: c }}
              aria-hidden
            />
            <span className="m-hficha-mile-l">{s.label}</span>
            <span className="m-hficha-mile-v" style={{ color: c }}>
              {s.amount > 0
                ? `${fmt(s.amount)} · ${Math.round(Math.min(1, s.pct) * 100)}%`
                : s.state === "done"
                  ? "✓"
                  : "Por definir"}
            </span>
          </span>
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helper de color semántico para la CIFRA titular
// ---------------------------------------------------------------------------
export function FVal({ tone, children }: { tone: "pos" | "neg" | "neutral"; children: ReactNode }) {
  return (
    <span className={tone === "pos" ? "pos" : tone === "neg" ? "neg" : undefined}>{children}</span>
  );
}

export { BLUE as FICHA_BLUE, GREEN as FICHA_GREEN, RED as FICHA_RED };
