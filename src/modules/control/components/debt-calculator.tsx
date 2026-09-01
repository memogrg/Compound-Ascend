"use client";

/**
 * Calculadora de préstamos (piel de escritorio) — simular un crédito ANTES de tomarlo.
 *
 * Toda la lógica está en `useLoanCalculator`, que es EL MISMO hook que usa la pantalla del móvil.
 * Acá solo hay marcado y clases: si algo del cálculo hay que cambiarlo, se cambia en el hook y las
 * dos superficies se mueven juntas.
 *
 * Nada de esto se guarda. La calculadora es efímera a propósito: se simula, se mira y se decide.
 * Si el usuario ya tomó el préstamo, "Registrar esta deuda" abre el alta de siempre con los
 * números sembrados — el alta sigue siendo el alta, esto solo le ahorra tipearlos.
 */

import { useState } from "react";
import Link from "next/link";
import { PRIMARY_CURRENCY_OPTIONS } from "@/lib/format";
import { ControlDialog } from "@/modules/control/components/control-actions";
import {
  useLoanCalculator,
  type LoanCalculator,
} from "@/modules/control/components/use-loan-calculator";
import type { SimContext, SimInsight } from "@/modules/control/engine/debt-sim-insights";
import "./debt-calculator.css";

/** Meses → "15 años" / "4 años 6 meses" / "8 meses". */
function plazoTexto(meses: number): string {
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  if (a === 0) return `${m} ${m === 1 ? "mes" : "meses"}`;
  if (m === 0) return `${a} ${a === 1 ? "año" : "años"}`;
  return `${a} ${a === 1 ? "año" : "años"} ${m} m`;
}

function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fld">
      <label className="fld-label">{label}</label>
      {children}
      {hint ? <span className="dcalc-hint">{hint}</span> : null}
    </div>
  );
}

function Resumen({ calc }: { calc: LoanCalculator }) {
  const { sim, fmt } = calc;
  return (
    <div className="dcalc-cards">
      <div className="card card-pad dcalc-kpi">
        <div className="label">Cuota mensual</div>
        <div className="num-xl dcalc-kpi-n">{fmt(sim.monthlyTotal)}</div>
        <div className="dcalc-kpi-sub">
          {sim.insuranceMonthly > 0 ? (
            <>
              {fmt(sim.monthlyPayment)} de cuota + {fmt(sim.insuranceMonthly)} de seguro
            </>
          ) : (
            <>durante {plazoTexto(sim.months)}</>
          )}
        </div>
      </div>

      <div className="card card-pad dcalc-kpi">
        <div className="label">Intereses totales</div>
        <div className="num-xl dcalc-kpi-n neg">{fmt(sim.totalInterest)}</div>
        <div className="dcalc-kpi-sub">lo que cuesta el dinero prestado</div>
      </div>

      <div className="card card-pad dcalc-kpi">
        <div className="label">Total pagado</div>
        <div className="num-xl dcalc-kpi-n">{fmt(sim.totalPaid)}</div>
        <div className="dcalc-kpi-sub">
          capital + intereses{sim.totalInsurance > 0 ? " + seguro" : ""}
        </div>
      </div>

      <div className="card card-pad dcalc-kpi">
        <div className="label">Por cada 100 prestados</div>
        <div className="num-xl dcalc-kpi-n">{sim.costPer100.toFixed(0)}</div>
        <div className="dcalc-kpi-sub">devolvés {sim.costPer100.toFixed(0)} en total</div>
      </div>
    </div>
  );
}

/** Una fila por año; al tocarla se abren sus meses. */
function TablaAmortizacion({ calc }: { calc: LoanCalculator }) {
  // Un préstamo a 30 años son 360 filas mensuales: ilegible. Por eso se entra por año y los
  // meses solo se despliegan donde el usuario los pide.
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const { sim, fmt } = calc;

  const alternar = (year: number) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });

  return (
    <div className="dcalc-tabla-wrap">
      <table className="dcalc-tabla">
        <thead>
          <tr>
            <th scope="col">Año</th>
            <th scope="col" className="n">
              Intereses
            </th>
            <th scope="col" className="n">
              Capital
            </th>
            <th scope="col" className="n">
              Saldo inicial
            </th>
            <th scope="col" className="n">
              Saldo final
            </th>
          </tr>
        </thead>
        <tbody>
          {sim.years.map((y) => {
            const abierto = abiertos.has(y.year);
            return [
              <tr key={`y${y.year}`} className="dcalc-year">
                <th scope="row">
                  <button
                    type="button"
                    className="dcalc-toggle"
                    onClick={() => alternar(y.year)}
                    aria-expanded={abierto}
                  >
                    <span className={abierto ? "dcalc-caret open" : "dcalc-caret"} aria-hidden />
                    Año {y.year}
                    <span className="dcalc-year-meses">
                      {y.months} {y.months === 1 ? "mes" : "meses"}
                    </span>
                  </button>
                </th>
                <td className="n">{fmt(y.interest)}</td>
                <td className="n">{fmt(y.principal)}</td>
                <td className="n muted">{fmt(y.openingBalance)}</td>
                <td className="n">{fmt(y.closingBalance)}</td>
              </tr>,
              ...(abierto
                ? y.rows.map((r, i) => {
                    // El saldo inicial del mes es el final del mes anterior; el del primero del
                    // año, la apertura del año.
                    const previo = y.rows[i - 1];
                    const inicial = previo ? previo.balance : y.openingBalance;
                    return (
                      <tr key={`m${r.month}`} className="dcalc-month">
                        <th scope="row">Mes {r.month}</th>
                        <td className="n">{fmt(r.interest)}</td>
                        <td className="n">{fmt(r.principal)}</td>
                        <td className="n muted">{fmt(inicial)}</td>
                        <td className="n">{fmt(r.balance)}</td>
                      </tr>
                    );
                  })
                : []),
            ];
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className="n">{fmt(sim.totalInterest)}</td>
            <td className="n">{fmt(calc.input.principal)}</td>
            <td className="n muted">—</td>
            <td className="n">{fmt(0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Comparacion({ calc }: { calc: LoanCalculator }) {
  const { shorter, sim, fmt } = calc;
  if (shorter.length === 0) return null;
  return (
    <div className="dcalc-tabla-wrap">
      <table className="dcalc-tabla dcalc-cmp">
        <thead>
          <tr>
            <th scope="col">Plazo</th>
            <th scope="col" className="n">
              Cuota mensual
            </th>
            <th scope="col" className="n">
              Intereses
            </th>
            <th scope="col" className="n">
              Diferencia
            </th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          <tr className="dcalc-cmp-base">
            <th scope="row">{plazoTexto(sim.months)} · tu simulación</th>
            <td className="n">{fmt(sim.monthlyTotal)}</td>
            <td className="n">{fmt(sim.totalInterest)}</td>
            <td className="n muted">—</td>
            <td />
          </tr>
          {shorter.map((o) => (
            <tr key={o.termMonths}>
              <th scope="row">{o.years} años</th>
              <td className="n">{fmt(o.monthlyTotal)}</td>
              <td className="n">{fmt(o.totalInterest)}</td>
              <td className="n">
                <span className="dcalc-mas">+{fmt(o.monthlyDelta)}/mes</span>
                <span className="dcalc-menos">−{fmt(o.interestSaved)} intereses</span>
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn-secondary dcalc-mini"
                  onClick={() => calc.usarPlazo(o.termMonths)}
                >
                  Usar este plazo
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Lectura({ insight }: { insight: SimInsight }) {
  return (
    <div className={`dcalc-insight t-${insight.tone}`}>
      <div className="dcalc-insight-t">{insight.title}</div>
      <div className="dcalc-insight-b">{insight.body}</div>
    </div>
  );
}

export function DebtCalculator({
  currency,
  context,
  indexRates,
}: {
  /** Moneda de visualización: la que se ofrece por defecto. */
  currency: string;
  /** Ingreso, sobrante y cuotas actuales para la lectura de capacidad. */
  context?: SimContext | null;
  indexRates?: Record<string, number>;
}) {
  const calc = useLoanCalculator({ currency, context: context ?? null });
  const [registrando, setRegistrando] = useState(false);
  const { sim, input } = calc;

  return (
    <div className="dcalc">
      {/* ── 1 · Los datos del préstamo ── */}
      <div className="card card-pad">
        <div className="card-title">Simular un préstamo</div>
        <div className="card-sub">
          Cambiá cualquier dato y los números de abajo se recalculan al instante. No se guarda nada.
        </div>

        <div className="dcalc-form">
          <Campo label="Capital prestado">
            <input
              className="inp"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={calc.principal}
              onChange={(e) => calc.setPrincipal(e.target.value)}
            />
          </Campo>

          <Campo label="Tasa de interés anual (%)">
            <input
              className="inp"
              type="number"
              min={0}
              step={0.1}
              inputMode="decimal"
              value={calc.apr}
              onChange={(e) => calc.setApr(e.target.value)}
            />
          </Campo>

          <Campo
            label={calc.termUnit === "anos" ? "Plazo (años)" : "Plazo (meses)"}
            hint={calc.termUnit === "anos" ? plazoTexto(input.termMonths) : undefined}
          >
            <div className="dcalc-plazo">
              <input
                className="inp"
                type="number"
                min={0}
                step={calc.termUnit === "anos" ? 0.5 : 1}
                inputMode="decimal"
                value={calc.term}
                onChange={(e) => calc.setTerm(e.target.value)}
              />
              <div className="seg" role="tablist" aria-label="Unidad del plazo">
                <button
                  type="button"
                  role="tab"
                  aria-selected={calc.termUnit === "anos"}
                  className={calc.termUnit === "anos" ? "seg-btn on" : "seg-btn"}
                  onClick={() => calc.setTermUnit("anos")}
                >
                  Años
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={calc.termUnit === "meses"}
                  className={calc.termUnit === "meses" ? "seg-btn on" : "seg-btn"}
                  onClick={() => calc.setTermUnit("meses")}
                >
                  Meses
                </button>
              </div>
            </div>
          </Campo>

          <Campo label="Seguro mensual (opcional)" hint="Se suma a la cuota; no baja el saldo.">
            <input
              className="inp"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={calc.insurance}
              onChange={(e) => calc.setInsurance(e.target.value)}
            />
          </Campo>

          <Campo label="Moneda">
            <select
              className="sel"
              value={calc.currency}
              onChange={(e) => calc.setCurrency(e.target.value)}
            >
              {PRIMARY_CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol})
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>

      {!calc.ready ? (
        <div className="card card-pad muted">
          Ingresá un capital y un plazo mayores que cero para ver la simulación.
        </div>
      ) : (
        <>
          {/* ── 2 · El resumen ── */}
          <Resumen calc={calc} />

          {/* ── 3 · El cuadro de amortización ── */}
          <div className="card card-pad">
            <div className="card-title">Cuadro de amortización</div>
            <div className="card-sub">
              Una fila por año. Tocá un año para ver sus meses: intereses, pago a capital y saldo.
            </div>
            <TablaAmortizacion calc={calc} />
          </div>

          {/* ── 4 · Las lecturas ── */}
          <div className="card card-pad">
            <div className="card-title">Qué dicen estos números</div>
            <div className="card-sub">
              Cálculos deterministas sobre tu simulación — nada de esto lo escribe la IA.
            </div>
            <div className="dcalc-insights">
              {calc.insights.map((i) => (
                <Lectura key={i.kind} insight={i} />
              ))}
            </div>
            {calc.shorter.length > 0 ? (
              <>
                <div className="dcalc-sub-h">Si lo pedís a menos plazo</div>
                <Comparacion calc={calc} />
              </>
            ) : null}
          </div>

          {/* ── 5 · Qué hacer con esto ── */}
          <div className="card card-pad dcalc-acciones">
            <div>
              <div className="card-title">¿Ya tomaste este préstamo?</div>
              <div className="card-sub">
                Registralo para que entre en tu plan de deudas, o conversá el escenario con el
                asesor antes de decidir.
              </div>
            </div>
            <div className="dcalc-btns">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setRegistrando(true)}
              >
                Registrar esta deuda
              </button>
              <Link
                className="btn btn-secondary"
                href={`/asistente?consulta=${encodeURIComponent(calc.escenario)}`}
              >
                Preguntarle al asesor
              </Link>
            </div>
          </div>
        </>
      )}

      {registrando ? (
        <ControlDialog
          kind="debt"
          currency={calc.currency}
          indexRates={indexRates}
          prefill={{
            balance: input.principal,
            originalAmount: input.principal,
            currency: calc.currency,
            apr: input.aprPct,
            termMonths: input.termMonths,
            currentPayment: sim.monthlyPayment,
            minPayment: sim.monthlyPayment,
            insurance: sim.insuranceMonthly > 0 ? sim.insuranceMonthly : undefined,
          }}
          onClose={() => setRegistrando(false)}
        />
      ) : null}
    </div>
  );
}
