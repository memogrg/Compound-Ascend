"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  addDebtAction,
  editDebtAction,
  removeDebtAction,
  reportPaymentAction,
  updateDebtPaymentAction,
  deleteDebtPaymentAction,
} from "@/modules/control/api/actions";
import type { Debt, DebtVM, DebtPayment } from "@/modules/control";
import { formatMoney, formatPercent } from "@/lib/format";

import {
  Fab,
  BottomSheet,
  SwipeRow,
  ConfirmDialog,
  FormShell,
  MoneyField,
  DateField,
  Segmented,
  useToast,
  type ActionResult,
  type Opt,
} from "../../components/form-kit";
import { DebtForm, type DebtValues } from "./debt-form";

/**
 * Gestión completa de deudas en /m/deudas (molde de GoalManager + flujos vinculados).
 * Reutiliza las Server Actions de control:
 *  - FAB → alta; SwipeRow → Editar / Eliminar (ConfirmDialog + aviso si tiene pagos).
 *  - "Reportar pago" (reportPaymentAction) → crea transacción vinculada (linked_kind='debt');
 *    prefill con la cuota sugerida (vm.monthlyPayment || minPayment), como la web.
 *  - "Historial" → pagos por deuda con Editar (updateDebtPaymentAction) y Eliminar
 *    (deleteDebtPaymentAction, que revierte la transacción vinculada).
 * Montos en la moneda de visualización (igual que la web y los DebtVM ya normalizados).
 */

export interface DebtItem {
  vm: DebtVM;
  rank: number;
  months: number | null;
}

const KIND_OPTS: Opt[] = [
  { value: "ordinario", label: "Cuota" },
  { value: "extraordinario", label: "Abono a capital" },
];

const MODE_OPTS: Opt[] = [
  { value: "tiempo", label: "Reducir plazo" },
  { value: "cuota", label: "Reducir cuota" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

function viaLabel(source: string | null | undefined): string {
  switch (source) {
    case "chat":
      return " · vía Chat";
    case "receipt":
      return " · vía Recibo";
    default:
      return "";
  }
}

/** Debt (crudo) → DebtValues para precargar el form de edición (null → undefined). */
function toValues(d: Debt): DebtValues {
  return {
    name: d.name,
    debtType: d.debtType ?? undefined,
    bank: d.bank ?? undefined,
    balance: d.balance,
    originalAmount: d.originalAmount ?? undefined,
    currentPayment: d.currentPayment,
    minPayment: d.minPayment,
    apr: d.apr ?? undefined,
    termMonths: d.termMonths ?? undefined,
    currency: d.currency,
    delinquency: d.delinquency ?? undefined,
    stress: d.stress ?? undefined,
    rateType: d.rateType ?? undefined,
    rateIndex: d.rateIndex ?? undefined,
    rateSpread: d.rateSpread ?? undefined,
    introFixedMonths: d.introFixedMonths ?? undefined,
    introApr: d.introApr ?? undefined,
    startDate: d.startDate ?? undefined,
    extraMonthly: d.extraMonthly ?? undefined,
    insurance: d.insurance ?? undefined,
    notes: d.notes ?? undefined,
  };
}

export function DebtManager({
  items,
  raw,
  paymentsByDebt,
  currency,
}: {
  items: DebtItem[];
  raw: Debt[];
  paymentsByDebt: Record<string, DebtPayment[]>;
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const rawById = new Map(raw.map((d) => [d.id, d]));

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [deleting, setDeleting] = useState<DebtVM | null>(null);
  const [delPending, setDelPending] = useState(false);
  const [reporting, setReporting] = useState<DebtVM | null>(null);
  const [history, setHistory] = useState<DebtVM | null>(null);
  const [editingPayment, setEditingPayment] = useState<{ vm: DebtVM; payment: DebtPayment } | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<{ debtId: string; payment: DebtPayment } | null>(null);
  const [payDelPending, setPayDelPending] = useState(false);

  const confirmDeleteDebt = async () => {
    if (!deleting) return;
    setDelPending(true);
    const res = await removeDebtAction(deleting.id);
    setDelPending(false);
    if (res.ok) {
      toast.show("Deuda eliminada", "success");
      setDeleting(null);
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo eliminar.", "error");
    }
  };

  const confirmDeletePayment = async () => {
    if (!deletingPayment) return;
    setPayDelPending(true);
    const res = await deleteDebtPaymentAction(deletingPayment.payment.id, deletingPayment.debtId);
    setPayDelPending(false);
    if (res.ok) {
      toast.show("Pago eliminado (transacción revertida)", "success");
      setDeletingPayment(null);
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo eliminar el pago.", "error");
    }
  };

  const deletingPayments = deleting ? (paymentsByDebt[deleting.id] ?? []) : [];
  const historyPayments = history ? (paymentsByDebt[history.id] ?? []) : [];

  return (
    <>
      {items.length === 0 ? (
        <div className="card card-p">
          <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            No tienes deudas cargadas. Toca el botón + para agregar la primera y armar tu plan de pago.
          </div>
        </div>
      ) : (
        items.map(({ vm, rank, months }) => {
          const pct = vm.originalAmount && vm.originalAmount > 0 ? Math.min(1, vm.balance / vm.originalAmount) : 1;
          const cuota = vm.monthlyPayment || vm.minPayment;
          const barColor = rank === 1 ? "var(--danger)" : "var(--warning)";
          const nPay = paymentsByDebt[vm.id]?.length ?? 0;
          const debtRaw = rawById.get(vm.id);
          return (
            <SwipeRow
              key={vm.id}
              onEdit={debtRaw ? () => setEditing(debtRaw) : undefined}
              onDelete={() => setDeleting(vm)}
            >
              <div className="card card-p" style={{ marginBottom: 12 }}>
                <div className="between" style={{ marginBottom: 12 }}>
                  <div className="row" style={{ gap: 11 }}>
                    <span
                      className="lic"
                      style={rank === 1 ? { background: "var(--danger-soft)", color: "var(--danger)" } : undefined}
                    >
                      {rank}
                    </span>
                    <div>
                      <div className="lname">{vm.name}</div>
                      <div className="lsub">
                        {vm.debtType ?? "Deuda"} · {formatPercent(vm.apr / 100, 1)}
                      </div>
                    </div>
                  </div>
                  <div className="jar-amt">
                    <div className="a neg">{formatMoney(vm.balance, currency)}</div>
                    {vm.originalAmount ? <div className="b">de {formatMoney(vm.originalAmount, currency)}</div> : null}
                  </div>
                </div>
                <div className="bar" style={{ height: 7 }}>
                  <i style={{ width: `${Math.round(pct * 100)}%`, background: barColor }} />
                </div>
                <div className="between" style={{ marginTop: 9 }}>
                  <span className="muted" style={{ fontSize: 11 }}>
                    Cuota {formatMoney(cuota, currency)}/mes
                  </span>
                  {months != null && (
                    <span className="mono" style={{ fontSize: 11 }}>
                      ≈ {months} {months === 1 ? "mes" : "meses"}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    className="m-btn m-btn-secondary"
                    style={{ flex: 1, minHeight: 42, fontSize: 13.5 }}
                    onClick={() => setReporting(vm)}
                  >
                    Reportar pago
                  </button>
                  <button
                    type="button"
                    className="m-btn m-btn-secondary"
                    style={{ flex: 1, minHeight: 42, fontSize: 13.5 }}
                    onClick={() => setHistory(vm)}
                  >
                    Historial{nPay > 0 ? ` (${nPay})` : ""}
                  </button>
                </div>
              </div>
            </SwipeRow>
          );
        })
      )}

      <Fab onClick={() => setAdding(true)} label="Nueva deuda" />

      {/* Alta */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Nueva deuda">
        <DebtForm
          currency={currency}
          action={addDebtAction}
          submitLabel="Agregar deuda"
          successMessage="Deuda agregada"
          onSuccess={() => setAdding(false)}
        />
      </BottomSheet>

      {/* Edición (arrastra todos los campos crudos para no borrar la deuda) */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title="Editar deuda">
        {editing ? (
          <DebtForm
            currency={currency}
            initial={toValues(editing)}
            action={(v: DebtValues) => editDebtAction(editing.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Deuda actualizada"
            onSuccess={() => setEditing(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Reportar pago → transacción vinculada (linked_kind='debt') */}
      <BottomSheet open={!!reporting} onClose={() => setReporting(null)} title="Reportar pago">
        {reporting ? (
          <PaymentForm
            debtId={reporting.id}
            currency={currency}
            cuota={reporting.monthlyPayment || reporting.minPayment}
            action={reportPaymentAction}
            submitLabel="Registrar pago"
            successMessage="Pago registrado"
            onSuccess={() => setReporting(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Historial de pagos */}
      <BottomSheet open={!!history} onClose={() => setHistory(null)} title={history ? `Pagos · ${history.name}` : "Pagos"}>
        {history ? (
          historyPayments.length === 0 ? (
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5, padding: "4px 2px 8px" }}>
              Aún no hay pagos registrados en esta deuda.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {historyPayments.map((p) => (
                <div key={p.id} className="row between" style={{ gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 14.5 }}>
                      {formatMoney(p.amount + p.extraAmount, currency)}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {fmtDate(p.paymentDate)} · {p.kind === "extraordinario" ? "Abono a capital" : "Cuota"}
                      {p.extraAmount > 0 ? ` · +${formatMoney(p.extraAmount, currency)} extra` : ""}
                      {viaLabel(p.viaSource)}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6, flex: "none" }}>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Editar pago"
                      onClick={() => setEditingPayment({ vm: history, payment: p })}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Eliminar pago"
                      onClick={() => setDeletingPayment({ debtId: history.id, payment: p })}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </BottomSheet>

      {/* Editar pago (encima del historial) */}
      <BottomSheet open={!!editingPayment} onClose={() => setEditingPayment(null)} title="Editar pago">
        {editingPayment ? (
          <PaymentForm
            debtId={editingPayment.vm.id}
            currency={currency}
            initial={editingPayment.payment}
            action={(v) => updateDebtPaymentAction(editingPayment.payment.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Pago actualizado"
            onSuccess={() => setEditingPayment(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Eliminar deuda (con aviso si tiene pagos) */}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar deuda"
        message={deleting ? `Se eliminará "${deleting.name}".` : undefined}
        confirmLabel="Eliminar"
        variant="danger"
        dependencies={
          deleting && deletingPayments.length > 0
            ? [
                `Tiene ${deletingPayments.length} ${deletingPayments.length === 1 ? "pago registrado" : "pagos registrados"}; también se borrará su historial.`,
              ]
            : undefined
        }
        pending={delPending}
        onConfirm={confirmDeleteDebt}
        onCancel={() => setDeleting(null)}
      />

      {/* Eliminar pago (revierte la transacción vinculada) */}
      <ConfirmDialog
        open={!!deletingPayment}
        title="Eliminar pago"
        message={
          deletingPayment
            ? `Se eliminará el pago de ${formatMoney(deletingPayment.payment.amount + deletingPayment.payment.extraAmount, currency)}.`
            : undefined
        }
        confirmLabel="Eliminar"
        variant="danger"
        dependencies={["Se revertirá la transacción vinculada (el gasto de ese mes desaparece)."]}
        pending={payDelPending}
        onConfirm={confirmDeletePayment}
        onCancel={() => setDeletingPayment(null)}
      />
    </>
  );
}

/**
 * Form de pago reutilizable por REPORTAR (nuevo) y EDITAR (updateDebtPaymentAction).
 *  - Reportar: toggle Cuota/Abono a capital + cuota sugerida (prefill).
 *  - Editar: el tipo (kind) es fijo (el RPC de update no lo cambia); sin toggle.
 * Espejo de la lógica de la web (ordinario: cuota + extra opcional + modo; extraordinario:
 * abono directo a capital, sin extra).
 */
function PaymentForm({
  debtId,
  currency,
  cuota,
  initial,
  action,
  submitLabel,
  successMessage,
  onSuccess,
}: {
  debtId: string;
  currency: string;
  cuota?: number;
  initial?: DebtPayment;
  action: (raw: {
    debtId: string;
    paymentDate: string;
    amount: number | undefined;
    extraAmount: number;
    extraMode?: string;
    kind: string;
  }) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
}) {
  const isEdit = !!initial;
  const [kind, setKind] = useState<string>(initial?.kind ?? "ordinario");
  const [amount, setAmount] = useState<number | undefined>(initial ? initial.amount : cuota || undefined);
  const [extra, setExtra] = useState<number | undefined>(initial?.extraAmount || undefined);
  const [mode, setMode] = useState<string>(initial?.extraMode ?? "tiempo");
  const [date, setDate] = useState(initial?.paymentDate ?? todayISO());

  const isExtra = kind === "extraordinario";
  const extraNum = extra ?? 0;

  const values = {
    debtId,
    paymentDate: date,
    amount,
    extraAmount: isExtra ? 0 : extraNum,
    extraMode: !isExtra && extraNum > 0 ? mode : undefined,
    kind,
  };

  return (
    <FormShell
      action={action}
      values={values}
      submitLabel={submitLabel}
      successMessage={successMessage}
      onSuccess={onSuccess}
    >
      {!isEdit ? (
        <Segmented name="kind" label="Tipo de pago" value={kind} onChange={setKind} options={KIND_OPTS} />
      ) : null}
      <MoneyField
        name="amount"
        label={isExtra ? "Monto del abono a capital" : "Monto de la cuota"}
        value={amount}
        onChange={setAmount}
        currency={currency}
      />
      {!isExtra ? (
        <MoneyField
          name="extraAmount"
          label="Pago extra a capital (opcional)"
          value={extra}
          onChange={setExtra}
          currency={currency}
        />
      ) : null}
      {!isExtra && extraNum > 0 ? (
        <Segmented name="extraMode" label="¿Qué reduce el pago extra?" value={mode} onChange={setMode} options={MODE_OPTS} />
      ) : null}
      <DateField name="paymentDate" label="Fecha" value={date} onChange={setDate} />
      {isExtra ? (
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: -2 }}>
          Abono directo a capital: reduce el saldo sin pagar intereses y no cuenta como la cuota del mes.
        </div>
      ) : !isEdit && cuota ? (
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: -2 }}>
          Cuota sugerida: {formatMoney(cuota, currency)}
        </div>
      ) : null}
    </FormShell>
  );
}
