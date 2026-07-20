"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatMoney, formatPercent } from "@/lib/format";
import { PerformanceChart } from "@/components/charts/lazy";
import { AddControlButton, ControlDialog } from "./control-actions";
import { removeDebtAction, reportPaymentAction } from "@/modules/control/api/actions";
import type { Debt } from "@/modules/control/types";
import {
  simulateStrategy,
  recommendMethod,
  orderDebts,
  type DebtInput,
  type DebtMethod,
  cuotaPrecargada,
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
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${months[Number(m) - 1] ?? ""} ${y}`;
}

/** Fecha de vencimiento corta: "12 jun". */
function dueLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
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
  if (/hipoteca/.test(t))
    return "linear-gradient(135deg,var(--c-networth,var(--info)),var(--ink-2))";
  return "linear-gradient(135deg,var(--muted-2),var(--ink-2))";
}

/**
 * Curva de saldo total proyectado bajo la estrategia avalancha con `extra`.
 * Replica la simulación de debt-strategy registrando el saldo total por mes
 * (responde al control ± de pago extra).
 */
function strategyCurve(
  items: DebtInput[],
  extra: number,
  method: DebtMethod,
): { date: string; value: number }[] {
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
  // Deudas crudas por id (para precargar el form de edición sin perder campos
  // que el VM no expone: currentPayment, delinquency, stress, notes).
  const rawById = useMemo(() => new Map(overview.raw.map((d) => [d.id, d])), [overview.raw]);
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
    return [...debts].sort((a, b) => (rankById.get(a.id) ?? 99) - (rankById.get(b.id) ?? 99));
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

  const curve = useMemo(
    () => strategyCurve(debts.map(toDebtInput), extra, activeMethod),
    [debts, extra, activeMethod],
  );

  if (debts.length === 0) {
    return (
      <div className="card card-pad" style={{ display: "grid", gap: 14, justifyItems: "start" }}>
        <div>
          <div className="card-title">Sin deudas registradas</div>
          <div className="card-sub">
            Cuando agregues una, verás aquí su amortización y estrategia de pago.
          </div>
        </div>
        <AddControlButton
          kind="debt"
          currency={currency}
          label="Agregar deuda"
          indexRates={indexRates}
          deepLinkKey="debt"
        />
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
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 14,
            }}
          >
            <div>
              <div className="label">Deuda total</div>
              <div className="num-xl" style={{ fontSize: 38, color: "var(--neg)", marginTop: 8 }}>
                {formatMoney(totals.totalDebt, currency)}
              </div>
              <div
                className="row"
                style={{
                  gap: 18,
                  marginTop: 14,
                  fontSize: 12.5,
                  color: "var(--muted)",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  Pagos mensuales{" "}
                  <strong style={{ color: "var(--ink-2)" }}>
                    {formatMoney(totals.monthlyPayments, currency)}
                  </strong>
                </div>
                <div>
                  Tasa media{" "}
                  <strong style={{ color: "var(--ink-2)" }}>{totals.avgApr.toFixed(1)}%</strong>
                </div>
                <div>
                  Libre de deudas{" "}
                  <strong style={{ color: "var(--pos)" }}>
                    {activeSim.feasible ? fmtDate(payoffDateFromMonths(activeSim.months)) : "—"}
                  </strong>
                </div>
              </div>
            </div>
            {totals.dti != null ? (
              <span
                className="chip"
                style={{
                  fontWeight: 700,
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
            <strong style={{ color: "var(--ink-2)" }}>
              {METHOD_LABEL[activeMethod].toLowerCase()}
            </strong>
          </div>
        </div>

        {/* Estrategia de pago */}
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div className="card-title">Estrategia de pago</div>
            <span
              className="chip"
              style={{
                fontWeight: 700,
                background: "var(--accent-soft)",
                color: "var(--success)",
              }}
            >
              {METHOD_LABEL[rec.method]} recomendado
            </span>
          </div>

          <div className="extra-adj">
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Pago extra mensual</div>
              {freeCashflow > 0 ? (
                <div className="muted" style={{ fontSize: 11.5 }}>
                  de tu sobrante {formatMoney(freeCashflow, currency)}
                </div>
              ) : null}
            </div>
            <div className="stepper" role="group" aria-label="Ajustar pago extra">
              <button onClick={() => setExtra((e) => Math.max(0, e - step))} aria-label="Reducir">
                −
              </button>
              <span className="v tnum">{formatMoney(extra, currency)}</span>
              <button onClick={() => setExtra((e) => e + step)} aria-label="Aumentar">
                +
              </button>
            </div>
          </div>

          <div className="methods">
            <MethodCard
              label="Avalancha"
              sim={strategy.avalancha}
              currency={currency}
              selected={activeMethod === "avalancha"}
              recommended={rec.method === "avalancha"}
              onSelect={() => setMethod("avalancha")}
              note="Ataca la tasa anual equivalente más alta → menos intereses"
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
              <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {attackPlan.map((p, i) => {
                  const d = debtById.get(p.id);
                  return (
                    <li key={p.id} className="atk">
                      <span className="n">{i + 1}</span>
                      <span style={{ fontWeight: 500 }}>{d?.name ?? p.name}</span>
                      <span className="muted">— liquida en ~{monthsToText(p.monthPaid)}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}

          <div className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
            <strong style={{ color: "var(--ink-2)" }}>
              Recomendado: {METHOD_LABEL[rec.method].toLowerCase()}.
            </strong>{" "}
            {rec.reason}
          </div>
        </div>
      </section>

      {/* Health strip */}
      <div className="health-strip">
        <Kpi
          label="Deuda / ingresos"
          value={totals.dti != null ? formatPercent(totals.dti) : "—"}
          ratio={totals.dti}
          danger={0.4}
        />
        <Kpi
          label="Uso de crédito"
          value={totals.utilization != null ? formatPercent(totals.utilization) : "—"}
          ratio={totals.utilization}
          danger={0.3}
        />
        <Kpi
          label="TAE más alta"
          value={`${totals.highestApr.toFixed(1)}%`}
          ratio={totals.highestApr / 60}
          danger={0.5}
        />
        <Kpi label="Intereses (próx. 12m)" value={formatMoney(totals.interestThisYear, currency)} />
      </div>

      {/* Lista de deudas */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Tus deudas</div>
            <div className="card-sub">
              {debts.length} deuda(s) · orden de ataque ({METHOD_LABEL[activeMethod].toLowerCase()})
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <RegisterPaymentButton debts={debts} raw={overview.raw} currency={currency} />
            <AddControlButton
              kind="debt"
              currency={currency}
              label="Agregar deuda"
              variant="btn-secondary"
              indexRates={indexRates}
              deepLinkKey="debt"
            />
          </div>
        </div>
        {ordered.map((d, i) => {
          const s = summaries.get(d.id)!;
          const isHighest = d.apr === totals.highestApr && totals.highestApr > 0;
          const raw = rawById.get(d.id);
          return (
            <div key={d.id} style={{ position: "relative" }}>
            <Link href={`/deudas/${d.id}`} className="debt-row">
              <span className="debt-ic" style={{ background: debtGradient(d.debtType) }}>
                {i + 1}
              </span>
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
                    Vence el {dueLabel(d.nextDue)} —{" "}
                    {formatMoney(d.monthlyPayment > 0 ? d.monthlyPayment : d.minPayment, currency)}
                  </div>
                ) : null}
                {d.rateNote ? (
                  <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 3 }}>
                    {d.rateNote}
                  </div>
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
                <span className="chev">
                  <Icon name="chev" width={1.8} />
                </span>
              </div>
            </Link>
            {raw ? (
              <DebtRowActions debt={raw} currency={currency} indexRates={indexRates} />
            ) : null}
            </div>
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

/** "Registrar pago" desde la lista: elige deuda + tipo (normal/extraordinario). */
function RegisterPaymentButton({
  debts,
  raw,
  currency,
}: {
  debts: DebtVM[];
  /** Deudas sin convertir: el modal guarda con la moneda de la entidad, no con la de
   *  visualización, así que necesita la fuente cruda. */
  raw: Debt[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  if (debts.length === 0) return null;
  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Icon name="debt" width={2} /> Registrar pago
      </button>
      {open ? (
        <RegisterPaymentModal
          debts={debts}
          raw={raw}
          currency={currency}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * El importe y la moneda vienen los DOS de la deuda CRUDA, nunca del VM.
 *
 * Aquí estuvo el fallo que corrompió datos: `DebtVM` trae los montos ya convertidos a la
 * moneda principal (lo dice su propio comentario, "montos ya normalizados"), así que el
 * modal precargaba la cuota en colones y la rotulaba "Moneda: CRC", pero el guardado
 * escribía con la moneda de la DEUDA. Un pago de 2.341 USD se guardó como 1.063.076 USD
 * — el número convertido con la etiqueta sin convertir, multiplicado por el tipo de
 * cambio.
 *
 * Se elige la moneda de la ENTIDAD y no convertir al guardar, por tres razones:
 *  · `debt_payments` NO tiene columna de moneda: su importe es implícitamente el de la
 *    deuda, así que el ledger TIENE que recibir la moneda de la deuda. Convertir al
 *    guardar metería una división por el tipo de cambio en la amortización de una deuda
 *    real, y el mismo pago amortizaría distinto según el día.
 *  · Una tarjeta en dólares se paga en dólares: el usuario teclea lo que dice su estado
 *    de cuenta, no una aproximación.
 *  · El propio servicio ya distingue los dos mundos — devuelve `raw` "sin conversión
 *    para precargar el form de edición". Este modal era el único que no lo usaba.
 *
 * El equivalente en la moneda principal se muestra como referencia de solo lectura, para
 * que ver dólares en una app que lleva colones no desoriente.
 */
function RegisterPaymentModal({
  debts,
  raw,
  currency,
  onClose,
}: {
  debts: DebtVM[];
  /** Deudas SIN convertir: la única fuente válida para lo que se va a guardar. */
  raw: Debt[];
  /** Moneda de visualización. Solo para el equivalente informativo, nunca para guardar. */
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const rawOf = (id: string) => raw.find((x) => x.id === id) ?? null;
  const cuotaOf = (id: string) => {
    const d = rawOf(id);
    return d ? cuotaPrecargada(d).amount : 0;
  };
  const [debtId, setDebtId] = useState(debts[0]!.id);
  const [kind, setKind] = useState<"ordinario" | "extraordinario">("ordinario");
  const [amount, setAmount] = useState<string>(() => {
    const c = cuotaOf(debts[0]!.id);
    return c ? String(c) : "";
  });
  const [date, setDate] = useState(today);
  const [pending, setPending] = useState(false);

  const monedaDeuda = rawOf(debtId)?.currency ?? currency;
  // Solo informativo: NUNCA se guarda. Sirve para que el usuario reconozca el importe
  // en la moneda en la que piensa, sin que eso toque lo que se escribe.
  const vm = debts.find((d) => d.id === debtId) ?? null;
  const equivalente =
    vm && monedaDeuda !== currency
      ? vm.monthlyPayment > 0
        ? vm.monthlyPayment
        : vm.minPayment
      : null;

  const onDebt = (id: string) => {
    setDebtId(id);
    if (kind === "ordinario") {
      const c = cuotaOf(id);
      setAmount(c ? String(c) : "");
    }
  };
  const onKind = (k: "ordinario" | "extraordinario") => {
    setKind(k);
    if (k === "ordinario") {
      const c = cuotaOf(debtId);
      setAmount(c ? String(c) : "");
    } else setAmount("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount) || 0;
    if (amt <= 0) {
      toast("Ingresa un monto válido", "error");
      return;
    }
    setPending(true);
    const res = await reportPaymentAction({
      debtId,
      paymentDate: date,
      amount: amt,
      extraAmount: 0,
      kind,
      // Viaja junto al importe para que el servidor pueda comprobar que los dos vienen
      // de la misma fuente. Sin esto, un desajuste se guarda en silencio.
      currency: monedaDeuda,
    });
    setPending(false);
    if (res.ok) {
      toast(kind === "extraordinario" ? "Abono a capital registrado" : "Pago registrado");
      onClose();
      router.refresh();
    } else toast(res.message ?? "No se pudo registrar", "error");
  };

  return (
    <Modal
      title="Registrar pago"
      sub="Elige la deuda y el tipo de pago."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="fld">
            <label className="fld-label">Deuda</label>
            <select className="sel" value={debtId} onChange={(e) => onDebt(e.target.value)}>
              {debts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="fld">
            <label className="fld-label">Tipo de pago</label>
            <div className="seg" role="group">
              <button
                type="button"
                className={`seg-btn${kind === "ordinario" ? " on" : ""}`}
                onClick={() => onKind("ordinario")}
              >
                Pago normal
              </button>
              <button
                type="button"
                className={`seg-btn${kind === "extraordinario" ? " on" : ""}`}
                onClick={() => onKind("extraordinario")}
              >
                Extraordinario
              </button>
            </div>
            {kind === "extraordinario" ? (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                Abono directo a capital: no paga intereses ni cuenta como la cuota del mes.
              </div>
            ) : null}
          </div>

          <div className="fld-2">
            <div className="fld">
              <label className="fld-label">{kind === "extraordinario" ? "Monto del abono" : "Monto de la cuota"}</label>
              <div className="inp-money">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
            </div>
            <div className="fld">
              <label className="fld-label">Fecha</label>
              <input
                className="inp"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            Moneda: {monedaDeuda}
            {monedaDeuda !== currency && equivalente != null ? (
              <> · equivale a {formatMoney(equivalente, currency)}</>
            ) : null}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Kebab (⋯) por deuda: Editar (DebtForm precargado) / Eliminar (confirmación).
 *  Se renderiza FUERA del <Link> (hermano absoluto), así no hay anidamiento
 *  interactivo inválido ni navegación accidental al accionar. */
function DebtRowActions({
  debt,
  currency,
  indexRates,
}: {
  debt: Debt;
  currency: string;
  indexRates: Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);

  const onDelete = async () => {
    setPending(true);
    const res = await removeDebtAction(debt.id);
    setPending(false);
    if (res.ok) {
      toast("Deuda eliminada");
      setDeleting(false);
      router.refresh();
    } else toast(res.message ?? "No se pudo eliminar", "error");
  };

  return (
    <div style={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}>
      <button
        type="button"
        className="icon-btn"
        style={{ width: 30, height: 30, background: "var(--surface)" }}
        aria-label="Acciones de la deuda"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="dots" />
      </button>
      {open ? (
        <div className="txn-menu" onMouseLeave={() => setOpen(false)}>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setEditing(true);
            }}
          >
            Editar
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              setOpen(false);
              setDeleting(true);
            }}
          >
            Eliminar
          </button>
        </div>
      ) : null}

      {editing ? (
        <ControlDialog
          kind="debt"
          currency={currency}
          item={debt}
          indexRates={indexRates}
          onClose={() => setEditing(false)}
        />
      ) : null}

      {deleting ? (
        <Modal
          title="Eliminar deuda"
          sub="Se quita de tu lista de deudas y de la estrategia."
          onClose={() => setDeleting(false)}
        >
          <div className="modal-body">
            <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              ¿Eliminar <strong>{debt.name}</strong>? Esta acción no se puede deshacer.
            </p>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setDeleting(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              onClick={onDelete}
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
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
      className={`method${selected ? " on" : ""}`}
    >
      <div className="mn">
        {label}
        {recommended ? (
          <span
            className="chip"
            style={{
              background: "var(--accent-soft)",
              color: "var(--success)",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            Recomendado
          </span>
        ) : null}
      </div>
      <div className="md">{note}</div>
      <div className="mm">
        <b>{sim.feasible ? monthsToText(sim.months) : "—"}</b> ·{" "}
        {formatMoney(sim.totalInterest, currency)} en intereses
      </div>
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
