"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { PerformanceChart } from "@/components/charts/lazy";
import { formatMoney, currencySymbol } from "@/lib/format";
import {
  reportPaymentAction,
  updateDebtPaymentAction,
  deleteDebtPaymentAction,
} from "@/modules/control/api/actions";
import type { DebtPayment } from "@/modules/control/types";
import {
  compareExtra,
  solveExtraForTarget,
  applyExtraDecision,
  type AmortizationInput,
} from "@/modules/control/engine/amortization";
import type { DebtDetailVM } from "@/modules/control/services/debt-detail-service";

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

/** Fecha con día: "12 jun 2026". */
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-");
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
  return `${Number(d)} ${months[Number(m) - 1] ?? ""} ${y}`;
}

export function DebtDetail({ vm }: { vm: DebtDetailVM }) {
  const { currency } = vm;
  const input: AmortizationInput = useMemo(
    () => ({
      balance: vm.balance,
      apr: vm.apr,
      termMonths: vm.termMonths,
      monthlyPayment: vm.monthlyPayment > 0 ? vm.monthlyPayment : null,
      insurance: vm.insurance,
      extraMonthly: 0,
      startDate: vm.startDate,
      originalAmount: vm.originalAmount,
    }),
    [vm],
  );

  const chartData = useMemo(() => {
    // Con cuotas pagadas, el saldo arranca en el monto original (la curva baja
    // hasta hoy y sigue con la proyección); sin pagos, arranca en el saldo actual.
    const hasPaid = vm.schedule[0]?.paid ?? false;
    const headValue = hasPaid ? (vm.originalAmount ?? vm.balance) : vm.balance;
    const head = { date: vm.startDate ?? "Hoy", value: headValue };
    const rest = vm.schedule.map((r) => ({ date: r.date ?? `Mes ${r.month}`, value: r.balance }));
    return [head, ...rest];
  }, [vm]);

  const today = new Date().toISOString().slice(0, 10);
  const [pay, setPay] = useState<{ amount: number; date: string } | null>(null);
  const [editPayment, setEditPayment] = useState<string | null>(null);
  const [deletePayment, setDeletePayment] = useState<string | null>(null);

  const editing = editPayment ? (vm.payments.find((p) => p.id === editPayment) ?? null) : null;
  const deleting = deletePayment
    ? (vm.payments.find((p) => p.id === deletePayment) ?? null)
    : null;

  return (
    <div className="grid">
      {/* Encabezado */}
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="card-title" style={{ fontSize: 18 }}>
              {vm.name}
            </div>
            <div className="card-sub" style={{ marginTop: 2 }}>
              {vm.debtType ?? "Deuda"}
              {vm.bank ? ` · ${vm.bank}` : ""}
              {vm.rateType === "variable"
                ? vm.introFixedMonths && vm.introApr != null
                  ? ` · ${vm.introApr}% fija ${vm.introFixedMonths}m → ${(vm.rateIndex ?? "").toUpperCase()} + ${vm.rateSpread ?? 0}%`
                  : ` · variable (${(vm.rateIndex ?? "").toUpperCase()} + ${vm.rateSpread ?? 0}%)`
                : " · tasa fija"}
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setPay({ amount: vm.monthlyPayment || 0, date: today })}
          >
            Reportar pago
          </button>
        </div>

        {vm.dueSoon && vm.nextDue ? (
          <div className="auth-msg warn" style={{ margin: "14px 0 0", fontSize: 12.5 }}>
            Tu pago de <strong>{vm.name}</strong> vence el <strong>{fmtDay(vm.nextDue)}</strong> —{" "}
            {formatMoney(vm.monthlyPayment + vm.insurance, currency)}.
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
            gap: 14,
            marginTop: 18,
          }}
        >
          <Stat label="Saldo actual" value={formatMoney(vm.balance, currency)} big />
          <Stat label="Tasa Anual Equivalente" value={`${vm.apr.toFixed(2)}%`} />
          <Stat
            label="Cuota mensual"
            value={formatMoney(vm.monthlyPayment + vm.insurance, currency)}
          />
          <Stat
            label="Libre de deuda"
            value={fmtDate(vm.payoffDate)}
            sub={monthsToText(vm.monthsRemaining)}
          />
          <Stat label="Interés restante" value={formatMoney(vm.interestRemaining, currency)} />
        </div>

        {vm.rateNote ? (
          <div className="auth-msg warn" style={{ margin: "14px 0 0", fontSize: 12.5 }}>
            {vm.rateNote}
          </div>
        ) : null}

        {vm.originalAmount ? (
          <div style={{ marginTop: 16 }}>
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                fontSize: 11.5,
                color: "var(--muted)",
                marginBottom: 6,
              }}
            >
              <span>Pagado {Math.round(vm.progress * 100)}%</span>
              <span>{formatMoney(vm.originalAmount, currency)} original</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${vm.progress * 100}%`, background: "var(--pos)" }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Gráfica de saldo */}
      <div className="card card-pad">
        <div className="card-title">Saldo a lo largo del tiempo</div>
        <div style={{ marginTop: 8 }}>
          <PerformanceChart data={chartData} currency={currency} />
        </div>
      </div>

      {/* Pagos reportados (todos los orígenes: Control, Gastos, chat, conciliación) */}
      <PaymentsCard
        vm={vm}
        currency={currency}
        onEdit={(id) => setEditPayment(id)}
        onDelete={(id) => setDeletePayment(id)}
      />

      {/* Calculadora de escenarios */}
      <ScenarioCalculator input={input} currency={currency} />

      {/* Tabla de amortización */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Tabla de amortización</div>
            <div className="card-sub">{vm.schedule.length} cuota(s) proyectada(s)</div>
          </div>
        </div>
        <div style={{ overflow: "auto", maxHeight: 420 }}>
          <table className="amort-table">
            <thead>
              <tr>
                <th>Mes</th>
                <th>Fecha</th>
                <th>Cuota</th>
                <th>Capital</th>
                <th>Interés</th>
                {vm.insurance > 0 ? <th>Seguro</th> : null}
                <th>Saldo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vm.schedule.map((r) => (
                <tr
                  key={r.month}
                  style={
                    r.paid
                      ? {
                          background: "color-mix(in srgb, var(--pos) 7%, transparent)",
                          color: "var(--muted)",
                        }
                      : undefined
                  }
                >
                  <td className="tnum">
                    {r.paid ? (
                      <span
                        style={{ color: "var(--pos)", display: "inline-flex", alignItems: "center" }}
                        title="Cuota pagada"
                      >
                        <Icon name="check" width={3} style={{ width: 13, height: 13 }} />
                      </span>
                    ) : (
                      r.month
                    )}
                  </td>
                  <td>{fmtDate(r.date)}</td>
                  <td className="tnum">{formatMoney(r.payment, currency)}</td>
                  <td className="tnum">{formatMoney(r.principal, currency)}</td>
                  <td className="tnum" style={{ color: r.paid ? "var(--muted)" : "var(--neg)" }}>
                    {formatMoney(r.interest, currency)}
                  </td>
                  {vm.insurance > 0 ? (
                    <td className="tnum">{formatMoney(r.insurance, currency)}</td>
                  ) : null}
                  <td className="tnum">{formatMoney(r.balance, currency)}</td>
                  <td style={{ textAlign: "right" }}>
                    {r.paid ? (
                      <PaidRowAction
                        row={r}
                        onEdit={() => setEditPayment(r.paymentId)}
                        onDelete={() => setDeletePayment(r.paymentId)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "3px 9px", fontSize: 11 }}
                        onClick={() => setPay({ amount: r.payment, date: r.date ?? today })}
                      >
                        Pagar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pay ? (
        <ReportPaymentModal
          vm={vm}
          input={input}
          currency={currency}
          preset={pay}
          onClose={() => setPay(null)}
        />
      ) : null}

      {editing ? (
        <ReportPaymentModal
          vm={vm}
          input={input}
          currency={currency}
          editing={editing}
          onClose={() => setEditPayment(null)}
        />
      ) : null}

      {deleting ? (
        <DeletePaymentModal
          vm={vm}
          payment={deleting}
          currency={currency}
          onClose={() => setDeletePayment(null)}
        />
      ) : null}
    </div>
  );
}

/** Kebab (⋯) con Editar/Eliminar para un pago ya registrado. */
function PaymentMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="icon-btn"
        style={{ width: 30, height: 30 }}
        aria-label="Acciones del pago"
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
              onEdit();
            }}
          >
            Editar
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Eliminar
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Acción de una fila pagada en la tabla: kebab si tiene pago asociado. */
function PaidRowAction({
  row,
  onEdit,
  onDelete,
}: {
  row: { paymentId: string | null };
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!row.paymentId) {
    return (
      <span className="muted" style={{ fontSize: 11 }}>
        Pagado
      </span>
    );
  }
  return <PaymentMenu onEdit={onEdit} onDelete={onDelete} />;
}

/** Etiqueta discreta del origen del pago según el source de su transacción. */
const VIA_LABEL: Record<string, string> = {
  manual: "vía Gastos",
  chat: "vía Chat",
  receipt: "vía Recibo",
};

/**
 * Pagos reportados de la deuda, de cualquier origen (modal de Control,
 * composer de Gastos, chat IA, conciliación 1-tap). Con desglose cuota/extra
 * y la amortización estimada cuando hay tasa.
 */
function PaymentsCard({
  vm,
  currency,
  onEdit,
  onDelete,
}: {
  vm: DebtDetailVM;
  currency: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (vm.payments.length === 0) return null;
  const sorted = [...vm.payments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Pagos reportados</div>
          <div className="card-sub">
            {sorted.length} pago(s) · recalculan el saldo y la proyección
          </div>
        </div>
      </div>
      {sorted.map((p) => {
        const total = p.amount + p.extraAmount;
        const hasExtra = p.extraAmount > 0;
        const hasEstimate = p.principal != null && p.interest != null;
        return (
          <div key={p.id} className="list-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {fmtDay(p.paymentDate)}
                {p.viaSource && VIA_LABEL[p.viaSource] ? (
                  <span
                    className="chip"
                    style={{ fontSize: 10, background: "var(--chip)", color: "var(--muted)" }}
                  >
                    {VIA_LABEL[p.viaSource]}
                  </span>
                ) : null}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                {hasExtra ? (
                  hasEstimate ? (
                    <>
                      Cuota {formatMoney(p.amount, currency)} + Extra{" "}
                      {formatMoney(p.extraAmount, currency)} → amortizaste{" "}
                      <span style={{ color: "var(--pos)", fontWeight: 600 }}>
                        {formatMoney(p.extraAmount, currency)}
                      </span>{" "}
                      adicionales (capital total {formatMoney(p.principal!, currency)}, interés{" "}
                      {formatMoney(p.interest!, currency)})
                    </>
                  ) : (
                    <span
                      className="tip"
                      data-tip={
                        vm.apr > 0
                          ? "Pago registrado antes del desglose automático; los nuevos estiman capital e interés"
                          : "Agrega la tasa de interés para ver cuánto amortizas"
                      }
                    >
                      Cuota {formatMoney(p.amount, currency)} + Extra{" "}
                      {formatMoney(p.extraAmount, currency)} · sin estimación
                    </span>
                  )
                ) : hasEstimate ? (
                  <>
                    Capital {formatMoney(p.principal!, currency)} · interés{" "}
                    {formatMoney(p.interest!, currency)}
                  </>
                ) : (
                  <>Cuota del mes</>
                )}
              </div>
            </div>
            <span className="tnum" style={{ fontSize: 13.5, fontWeight: 500 }}>
              {formatMoney(total, currency)}
            </span>
            <PaymentMenu onEdit={() => onEdit(p.id)} onDelete={() => onDelete(p.id)} />
          </div>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  big,
}: {
  label: string;
  value: string;
  sub?: string;
  big?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{label}</div>
      <div
        className={big ? "num-xl" : ""}
        style={{ fontSize: big ? 24 : 15, fontWeight: big ? 400 : 600, marginTop: 4 }}
      >
        {value}
      </div>
      {sub ? (
        <div className="muted" style={{ fontSize: 11 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

// ── Calculadora de escenarios (bidireccional) ──────────────────────

function ScenarioCalculator({ input, currency }: { input: AmortizationInput; currency: string }) {
  const noDecimals = ["CRC", "COP", "MXN"].includes(currency);
  const [extra, setExtra] = useState(noDecimals ? 50000 : 100);
  const [years, setYears] = useState(5);
  const [targetYears, setTargetYears] = useState(10);

  const cmp = useMemo(() => compareExtra(input, extra, years), [input, extra, years]);
  const needed = useMemo(
    () => solveExtraForTarget(input, Math.round(targetYears * 12)),
    [input, targetYears],
  );

  return (
    <div className="card card-pad">
      <div className="card-title">Calculadora de escenarios</div>
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}
        className="scenario-grid"
      >
        {/* Modo A */}
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 10 }}>
            Si pago de más cada mes
          </div>
          <div className="fld-2">
            <div className="fld">
              <label className="fld-label">Extra mensual</label>
              <div className="inp-money">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={extra}
                  onChange={(e) => setExtra(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="fld">
              <label className="fld-label">Durante (años)</label>
              <input
                className="inp"
                type="number"
                min="1"
                max="40"
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.55 }}>
            Saldrías{" "}
            <strong style={{ color: "var(--pos)" }}>{monthsToText(cmp.monthsSaved)} antes</strong> y
            ahorrarías{" "}
            <strong style={{ color: "var(--pos)" }}>
              {formatMoney(cmp.interestSaved, currency)}
            </strong>{" "}
            en intereses.
            {cmp.newPayoffDate ? <> Nueva fecha: {fmtDate(cmp.newPayoffDate)}.</> : null}
          </div>
        </div>

        {/* Modo B */}
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 10 }}>
            Si quiero salir en…
          </div>
          <div className="fld">
            <label className="fld-label">Plazo objetivo (años)</label>
            <input
              className="inp"
              type="number"
              min="1"
              max="40"
              value={targetYears}
              onChange={(e) => setTargetYears(Number(e.target.value))}
            />
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.55 }}>
            {needed > 0 ? (
              <>
                Necesitas pagar{" "}
                <strong style={{ color: "var(--ink-2)" }}>
                  {formatMoney(needed, currency)} extra al mes
                </strong>{" "}
                para terminar en {targetYears} año(s).
              </>
            ) : (
              <>Ya terminarías en ese plazo (o antes) sin pagos extra.</>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reportar pago (tiempo vs cuota) ────────────────────────────────

function ReportPaymentModal({
  vm,
  input,
  currency,
  preset,
  editing,
  onClose,
}: {
  vm: DebtDetailVM;
  input: AmortizationInput;
  currency: string;
  preset?: { amount: number; date: string };
  /** Si se pasa, el modal edita ese pago en vez de crear uno nuevo. */
  editing?: DebtPayment;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  // Estado string para permitir vacío (no un "0" pegado imposible de borrar);
  // se coacciona a número solo al enviar (vacío → 0).
  const initAmount = editing?.amount ?? preset?.amount ?? vm.monthlyPayment ?? 0;
  const [amount, setAmount] = useState<string>(initAmount ? String(initAmount) : "");
  const [date, setDate] = useState(editing?.paymentDate ?? preset?.date ?? today);
  const [extra, setExtra] = useState<string>(editing?.extraAmount ? String(editing.extraAmount) : "");
  const [mode, setMode] = useState<"tiempo" | "cuota">(editing?.extraMode ?? "tiempo");
  const [pending, setPending] = useState(false);

  const amountNum = Number(amount) || 0;
  const extraNum = Number(extra) || 0;

  const comparison = useMemo(() => {
    if (extraNum <= 0) return null;
    return {
      tiempo: applyExtraDecision(input, extraNum, "tiempo"),
      cuota: applyExtraDecision(input, extraNum, "cuota"),
    };
  }, [input, extraNum]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const payload = {
      debtId: vm.id,
      paymentDate: date,
      amount: amountNum,
      extraAmount: extraNum,
      extraMode: extraNum > 0 ? mode : undefined,
    };
    const res = editing
      ? await updateDebtPaymentAction(editing.id, payload)
      : await reportPaymentAction(payload);
    setPending(false);
    if (res.ok) {
      toast(editing ? "Pago actualizado" : "Pago registrado");
      onClose();
      router.refresh();
    } else {
      toast(res.message ?? "No se pudo registrar");
    }
  };

  return (
    <Modal
      title={editing ? "Editar pago" : "Reportar pago"}
      sub="Tus pagos reales recalculan el saldo y la proyección."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="fld-2">
            <div className="fld">
              <label className="fld-label">Monto de la cuota</label>
              {/* La moneda es SIEMPRE la de la deuda (el modelo de pagos es de
                  una sola moneda por deuda); se muestra explícita como prefijo. */}
              <div className="inp-money">
                <span className="pre">{currencySymbol(currency)}</span>
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

          <div className="fld">
            <label className="fld-label">Pago extra (opcional)</label>
            <div className="inp-money">
              <span className="pre">{currencySymbol(currency)}</span>
              <input
                type="number"
                step="any"
                min="0"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {comparison ? (
            <div className="fld">
              <label className="fld-label">¿Qué reduce el pago extra?</label>
              <div className="seg" role="group" style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className={`seg-btn${mode === "tiempo" ? " on" : ""}`}
                  onClick={() => setMode("tiempo")}
                >
                  Reducir tiempo
                </button>
                <button
                  type="button"
                  className={`seg-btn${mode === "cuota" ? " on" : ""}`}
                  onClick={() => setMode("cuota")}
                >
                  Reducir cuota
                </button>
              </div>
              <div className="auth-msg" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
                <strong>Recomendado: reducir tiempo.</strong> Manteniendo la cuota ahorras{" "}
                <strong style={{ color: "var(--pos)" }}>
                  {formatMoney(
                    comparison.tiempo.interestSaved - comparison.cuota.interestSaved,
                    currency,
                  )}
                </strong>{" "}
                más en intereses y sales{" "}
                <strong>
                  {monthsToText(Math.max(0, comparison.cuota.months - comparison.tiempo.months))}{" "}
                  antes
                </strong>{" "}
                que si bajas la cuota (que pasaría a{" "}
                {formatMoney(comparison.cuota.monthlyPayment + vm.insurance, currency)}).
              </div>
            </div>
          ) : null}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Guardando…" : editing ? "Guardar cambios" : "Registrar pago"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Confirmación de borrado de un pago (revierte la transacción vinculada). */
function DeletePaymentModal({
  vm,
  payment,
  currency,
  onClose,
}: {
  vm: DebtDetailVM;
  payment: DebtPayment;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const total = payment.amount + payment.extraAmount;

  const confirm = async () => {
    setPending(true);
    const res = await deleteDebtPaymentAction(payment.id, vm.id);
    setPending(false);
    if (res.ok) {
      toast("Pago eliminado");
      onClose();
      router.refresh();
    } else {
      toast(res.message ?? "No se pudo eliminar");
    }
  };

  return (
    <Modal
      title="Eliminar pago"
      sub="Se revierte también el gasto vinculado del mes."
      onClose={onClose}
    >
      <div className="modal-body">
        <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          ¿Eliminar el pago de <strong>{formatMoney(total, currency)}</strong> del{" "}
          <strong>{fmtDay(payment.paymentDate)}</strong>? El saldo y la proyección se recalcularán.
        </p>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn btn-danger" disabled={pending} onClick={confirm}>
          {pending ? "Eliminando…" : "Eliminar"}
        </button>
      </div>
    </Modal>
  );
}
