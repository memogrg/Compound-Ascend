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
import {
  MContentCard,
  MDataRow,
  MProgress,
  MEmptyState,
  mAmount,
  mAmountScale,
} from "../../components/content-kit";
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

/**
 * Subtítulo de una deuda. El rank del Priority Engine se dice con PALABRAS ("Págala
 * primero") en vez del "1" que iba en un círculo: el número no explicaba por qué. El
 * saldo NO va aquí — es el valor de la fila, a la derecha.
 *
 * Medido a 375px (caja de 158px), recortando por orden de menos a más informativo:
 *   "Préstamo personal · 8.0% APR · ≈36 meses"  → cortado 81px (el tipo ya lo dice el
 *                                                  nombre: "Préstamo personal BN")
 *   "8.0% APR · libre en ≈36 meses"             → cortado 7px ("libre en" lo dice ya la
 *                                                  métrica global)
 *   "8.0% APR · ≈36 meses"                      → holgura 36px ✓
 * El peor caso real ("45.9% APR · ≈240 meses") deja 21px. Queda la tasa —que es por lo
 * que se ordenan— y cuándo se liquida.
 */
function debtSubtitle(args: { rank: number; apr: number; months: number | null }): string {
  const { rank, apr, months } = args;
  const tasa = `${formatPercent(apr / 100, 1)} APR`;
  if (rank === 1) return `Págala primero · ${tasa}`;
  if (months != null) return `${tasa} · ≈${months} ${months === 1 ? "mes" : "meses"}`;
  return tasa;
}

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
  // Escala compartida de la columna de saldos (ver nota en la fila): se calcula una vez
  // con TODOS los saldos, así todos se abrevian o ninguno.
  const balanceFmt = mAmountScale(
    items.map(({ vm }) => vm.balance),
    currency,
    10,
  );

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
        <MEmptyState
          icon="debt"
          title="Sin deudas registradas"
          description="Si no debes nada, disfrútalo. Y si tienes una tarjeta o un préstamo, anótalo: la app te arma el plan y te dice cuál atacar primero."
          actionLabel="Registrar una deuda"
          onAction={() => setAdding(true)}
        />
      ) : (
        // padding 0: la fila va a sangre para que el gesto revele Editar/Eliminar; el aire
        // lateral lo pone la regla puente .m-swipe-content .m-drow.
        <MContentCard style={{ padding: 0, overflow: "hidden" }}>
        {items.map(({ vm, rank, months }) => {
          // El saldo se formatea con la escala de TODA la columna, no celda a celda: si
          // se decide por celda, la lista mezcla "₡18,2 M" con "₡4.540.188" y deja de
          // poder compararse de un vistazo (era el caso real de esta pantalla).
          // La barra mide lo PAGADO, no lo que debes: antes era balance/originalAmount y se
          // llenaba cuanto MÁS debías (una deuda recién pedida salía al 100%). Sin
          // originalAmount no hay forma de saber qué se pagó → no se pinta barra, en vez de
          // inventar un 100% como hacía el `: 1` de antes.
          const conOriginal = Boolean(vm.originalAmount && vm.originalAmount > 0);
          const pagado = conOriginal ? Math.max(0, (vm.originalAmount ?? 0) - vm.balance) : 0;
          const pct = conOriginal ? Math.min(1, pagado / (vm.originalAmount ?? 1)) : 0;
          const cuota = vm.monthlyPayment || vm.minPayment;
          const nPay = paymentsByDebt[vm.id]?.length ?? 0;
          const debtRaw = rawById.get(vm.id);
          return (
            <SwipeRow
              key={vm.id}
              onEdit={debtRaw ? () => setEditing(debtRaw) : undefined}
              onDelete={() => setDeleting(vm)}
            >
              {/* Los botones NO van en `trailing`: estrecharía toda la columna de texto, el
                  subtítulo incluido (Ingresos/Ahorro). Van en el slot, con el padding
                  lateral reducido — .m-btn reserva 40px que parten la etiqueta. */}
              <MDataRow
                icon="debt"
                iconTone={rank === 1 ? "danger" : "neutral"}
                title={vm.name}
                subtitle={debtSubtitle({ rank, apr: vm.apr, months })}
                value={balanceFmt(vm.balance)}
                valueTone="danger"
                slot={
                  <>
                    {conOriginal ? (
                      <MProgress value={pct} tone={rank === 1 ? "warning" : "success"} height={7} />
                    ) : null}
                    <div className="between" style={{ marginTop: conOriginal ? 9 : 0 }}>
                      <span className="muted" style={{ fontSize: 11 }}>
                        Cuota {mAmount(cuota, currency)}/mes
                      </span>
                      {conOriginal ? (
                        <span className="mono muted" style={{ fontSize: 11 }}>
                          {Math.round(pct * 100)}% pagado
                        </span>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button
                        type="button"
                        className="m-btn m-btn-secondary"
                        style={{ flex: 1, minHeight: 42, fontSize: 13.5, padding: "0 8px" }}
                        onClick={() => setReporting(vm)}
                      >
                        Reportar pago
                      </button>
                      <button
                        type="button"
                        className="m-btn m-btn-secondary"
                        style={{ flex: 1, minHeight: 42, fontSize: 13.5, padding: "0 8px" }}
                        onClick={() => setHistory(vm)}
                      >
                        Historial{nPay > 0 ? ` (${nPay})` : ""}
                      </button>
                    </div>
                  </>
                }
              />
            </SwipeRow>
          );
        })}
        </MContentCard>
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
