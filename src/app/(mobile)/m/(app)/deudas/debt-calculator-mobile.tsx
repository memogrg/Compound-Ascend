"use client";

/**
 * Calculadora de préstamos en móvil — la misma de la web, con la piel de mobile.css.
 *
 * La lógica es `useLoanCalculator`, EL MISMO hook que usa `debt-calculator.tsx` en escritorio:
 * acá no se recalcula nada por cuenta propia. Si cambia una fórmula, cambia en el hook y las dos
 * pantallas se mueven juntas.
 *
 * Va como sección plegable y no como tab porque la página de deudas es un Server Component: un
 * selector que intercambiara toda la pantalla la obligaría a volverse cliente entera. Arranca
 * ABIERTA cuando el usuario todavía no tiene deudas — ese es justo el momento en que esto sirve,
 * y plegada quedaría invisible.
 *
 * Voz es-MX ("tú"), como el resto del móvil.
 */

import { useState } from "react";
import Link from "next/link";

import { addDebtAction } from "@/modules/control/api/actions";
import {
  useLoanCalculator,
  type LoanCalculator,
} from "@/modules/control/components/use-loan-calculator";
import type { SimContext } from "@/modules/control/engine/debt-sim-insights";

import {
  MSectionHeader,
  MContentCard,
  MMetricGrid,
  MMetricCard,
  mAmount,
} from "../../components/content-kit";
import {
  BottomSheet,
  MoneyField,
  Segmented,
  SheetSelect,
  CUR_OPTS,
} from "../../components/form-kit";
import { DebtForm, type DebtValues } from "./debt-form";

/** Meses → "15 años" / "4 años 6 m" / "8 meses". */
function plazoTexto(meses: number): string {
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  if (a === 0) return `${m} ${m === 1 ? "mes" : "meses"}`;
  if (m === 0) return `${a} ${a === 1 ? "año" : "años"}`;
  return `${a} ${a === 1 ? "año" : "años"} ${m} m`;
}

/** El hook trabaja con texto (para poder escribir libre); MoneyField, con número. */
const aNumero = (v: string): number | undefined => {
  const n = Number(v.replace(",", "."));
  return v === "" || !Number.isFinite(n) ? undefined : n;
};
const aTexto = (v: number | undefined): string => (v == null ? "" : String(v));

function Formulario({ calc }: { calc: LoanCalculator }) {
  return (
    <>
      <MoneyField
        name="capital"
        label="Capital prestado"
        currency={calc.currency}
        value={aNumero(calc.principal)}
        onChange={(v) => calc.setPrincipal(aTexto(v))}
      />

      <div className="m-qfield">
        <div className="m-qlabel">Tasa de interés anual (%)</div>
        <input
          className="m-inp"
          type="text"
          inputMode="decimal"
          value={calc.apr}
          onChange={(e) => calc.setApr(e.target.value)}
        />
      </div>

      <div className="m-qfield">
        <div className="m-qlabel">
          Plazo {calc.termUnit === "anos" ? "(años)" : "(meses)"}
          {calc.termUnit === "anos" && calc.input.termMonths > 0 ? (
            <span className="muted"> · {plazoTexto(calc.input.termMonths)}</span>
          ) : null}
        </div>
        <input
          className="m-inp"
          type="text"
          inputMode="decimal"
          value={calc.term}
          onChange={(e) => calc.setTerm(e.target.value)}
        />
      </div>

      <Segmented
        name="unidad"
        label="Unidad del plazo"
        value={calc.termUnit}
        onChange={(v) => calc.setTermUnit(v === "meses" ? "meses" : "anos")}
        options={[
          { value: "anos", label: "Años" },
          { value: "meses", label: "Meses" },
        ]}
      />

      <MoneyField
        name="seguro"
        label="Seguro mensual (opcional)"
        currency={calc.currency}
        value={aNumero(calc.insurance)}
        onChange={(v) => calc.setInsurance(aTexto(v))}
      />

      <SheetSelect
        name="moneda"
        label="Moneda"
        value={calc.currency}
        onChange={calc.setCurrency}
        options={CUR_OPTS}
        sheetTitle="Moneda del préstamo"
      />
    </>
  );
}

/** Cuadro por año; cada año se abre a sus meses. */
function Tabla({ calc }: { calc: LoanCalculator }) {
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const { sim, currency } = calc;
  const corto = (n: number) => mAmount(n, currency, 9);

  const alternar = (year: number) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });

  return (
    <div className="m-dcalc-scroll">
      <table className="m-dcalc-tabla">
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
              <tr key={`y${y.year}`}>
                <th scope="row">
                  <button
                    type="button"
                    className="m-dcalc-toggle"
                    onClick={() => alternar(y.year)}
                    aria-expanded={abierto}
                  >
                    <span
                      className={abierto ? "m-dcalc-caret open" : "m-dcalc-caret"}
                      aria-hidden
                    />
                    Año {y.year}
                  </button>
                </th>
                <td className="n">{corto(y.interest)}</td>
                <td className="n">{corto(y.principal)}</td>
                <td className="n muted">{corto(y.openingBalance)}</td>
                <td className="n">{corto(y.closingBalance)}</td>
              </tr>,
              ...(abierto
                ? y.rows.map((r, i) => {
                    const previo = y.rows[i - 1];
                    const inicial = previo ? previo.balance : y.openingBalance;
                    return (
                      <tr key={`m${r.month}`} className="m-dcalc-mes">
                        <th scope="row">Mes {r.month}</th>
                        <td className="n">{corto(r.interest)}</td>
                        <td className="n">{corto(r.principal)}</td>
                        <td className="n muted">{corto(inicial)}</td>
                        <td className="n">{corto(r.balance)}</td>
                      </tr>
                    );
                  })
                : []),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DebtCalculatorMobile({
  currency,
  context,
  defaultOpen = false,
}: {
  currency: string;
  context?: SimContext | null;
  /** Abierta de entrada. Es lo que pasa cuando todavía no hay ninguna deuda registrada. */
  defaultOpen?: boolean;
}) {
  const [abierta, setAbierta] = useState(defaultOpen);
  const [registrando, setRegistrando] = useState(false);
  // es-MX: el engine escribe las lecturas en "tú", no en voseo como en la web.
  const calc = useLoanCalculator({ currency, context: context ?? null, voz: "tu" });
  const { sim, input, fmt } = calc;

  const inicial: DebtValues = {
    name: "",
    balance: input.principal,
    originalAmount: input.principal,
    currency: calc.currency,
    apr: input.aprPct,
    termMonths: input.termMonths,
    currentPayment: sim.monthlyPayment,
    minPayment: sim.monthlyPayment,
    insurance: sim.insuranceMonthly > 0 ? sim.insuranceMonthly : undefined,
  };

  return (
    <>
      <MSectionHeader
        title="Calculadora de préstamos"
        action={
          <button
            type="button"
            className="m-dcalc-link"
            onClick={() => setAbierta((v) => !v)}
            aria-expanded={abierta}
          >
            {abierta ? "Ocultar" : "Simular"}
          </button>
        }
      />

      {!abierta ? (
        <MContentCard style={{ marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            Simula un préstamo antes de pedirlo: cuota, intereses totales y cuánto ahorras si lo
            tomas a menos plazo. No se guarda nada.
          </div>
        </MContentCard>
      ) : (
        <>
          <MContentCard style={{ marginBottom: 16 }}>
            <Formulario calc={calc} />
          </MContentCard>

          {!calc.ready ? (
            <MContentCard style={{ marginBottom: 16 }}>
              <div className="muted" style={{ fontSize: 12.5 }}>
                Escribe un capital y un plazo mayores que cero para ver la simulación.
              </div>
            </MContentCard>
          ) : (
            <>
              <MMetricGrid style={{ marginBottom: 16 }}>
                <MMetricCard
                  label="Cuota mensual"
                  value={mAmount(sim.monthlyTotal, calc.currency, 8)}
                  sub={
                    sim.insuranceMonthly > 0
                      ? `${mAmount(sim.monthlyPayment, calc.currency, 7)} + seguro`
                      : plazoTexto(sim.months)
                  }
                />
                <MMetricCard
                  label="Intereses totales"
                  value={mAmount(sim.totalInterest, calc.currency, 8)}
                  sub="lo que cuesta el préstamo"
                  tone="danger"
                />
                <MMetricCard
                  label="Total pagado"
                  value={mAmount(sim.totalPaid, calc.currency, 8)}
                  sub={
                    sim.totalInsurance > 0 ? "capital + intereses + seguro" : "capital + intereses"
                  }
                />
                <MMetricCard
                  label="Por cada 100"
                  value={sim.costPer100.toFixed(0)}
                  sub="es lo que devuelves"
                  tone="warning"
                />
              </MMetricGrid>

              <MContentCard style={{ marginBottom: 16 }}>
                <div className="m-dcalc-h">Cuadro de amortización</div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>
                  Una fila por año. Toca un año para ver sus meses.
                </div>
                <Tabla calc={calc} />
              </MContentCard>

              <MContentCard style={{ marginBottom: 16 }}>
                <div className="m-dcalc-h">Qué dicen estos números</div>
                {calc.insights.map((i) => (
                  <div key={i.kind} className={`m-dcalc-ins t-${i.tone}`}>
                    <div className="m-dcalc-ins-t">{i.title}</div>
                    <div className="m-dcalc-ins-b">{i.body}</div>
                  </div>
                ))}

                {calc.shorter.length > 0 ? (
                  <>
                    <div className="m-dcalc-h" style={{ marginTop: 14 }}>
                      Si lo pides a menos plazo
                    </div>
                    {calc.shorter.map((o) => (
                      <div key={o.termMonths} className="m-dcalc-cmp">
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{o.years} años</div>
                          <div className="muted" style={{ fontSize: 11.5 }}>
                            {fmt(o.monthlyTotal)} al mes · +{fmt(o.monthlyDelta)}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="pos" style={{ fontWeight: 700, fontSize: 13 }}>
                            −{fmt(o.interestSaved)}
                          </div>
                          <button
                            type="button"
                            className="m-dcalc-link"
                            onClick={() => calc.usarPlazo(o.termMonths)}
                          >
                            Usar este plazo
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                ) : null}
              </MContentCard>

              <MContentCard style={{ marginBottom: 16 }}>
                <div className="m-dcalc-h">¿Ya tomaste este préstamo?</div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
                  Regístralo para que entre en tu plan de deudas, o platica el escenario con el
                  asesor antes de decidir.
                </div>
                <div className="m-dcalc-btns">
                  <button
                    type="button"
                    className="m-btn m-btn-primary"
                    onClick={() => setRegistrando(true)}
                  >
                    Registrar esta deuda
                  </button>
                  <Link
                    className="m-btn"
                    href={`/m/asistente?consulta=${encodeURIComponent(calc.escenario)}`}
                  >
                    Preguntarle al asesor
                  </Link>
                </div>
              </MContentCard>
            </>
          )}
        </>
      )}

      {/* El alta de siempre, con los números de la simulación ya escritos. */}
      <BottomSheet
        open={registrando}
        onClose={() => setRegistrando(false)}
        title="Registrar esta deuda"
      >
        <DebtForm
          initial={inicial}
          action={addDebtAction}
          submitLabel="Registrar deuda"
          successMessage="Deuda registrada"
          onSuccess={() => setRegistrando(false)}
        />
      </BottomSheet>
    </>
  );
}
