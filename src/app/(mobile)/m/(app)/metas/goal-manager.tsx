"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  addGoalAction,
  editGoalAction,
  removeGoalAction,
  addGoalContributionAction,
  withdrawGoalAction,
} from "@/modules/control/api/actions";
import type { SavingsGoal } from "@/modules/control";
import { formatMoney } from "@/lib/format";

import {
  Fab,
  BottomSheet,
  SwipeRow,
  ConfirmDialog,
  FormShell,
  MoneyField,
  DateField,
  TextField,
  useToast,
} from "../../components/form-kit";
import { GoalForm, type GoalValues } from "./goal-form";

/**
 * Gestión completa de metas de ahorro en /m/metas (molde de Income/ExpenseManager +
 * flujos de transacciones vinculadas). Todo con el Form Kit y las Server Actions de
 * control (add/edit/removeGoalAction, addGoalContributionAction, withdrawGoalAction):
 *  - FAB → alta; SwipeRow → Editar / Eliminar (ConfirmDialog + aviso de dependencias si
 *    la meta tiene aportes).
 *  - "+ Aporte" → crea transacción vinculada (linked_kind='goal'); "Retirar" → crea
 *    ingreso vinculado (el backend valida que no exceda el saldo y devuelve el error).
 */

const STATUS_BADGE: Record<string, string> = {
  saludable: "up",
  atrasado: "neutral",
  no_viable: "down",
  revisar: "neutral",
};

function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha límite";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GoalManager({ goals, currency }: { goals: SavingsGoal[]; currency: string }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [deleting, setDeleting] = useState<SavingsGoal | null>(null);
  const [contributing, setContributing] = useState<SavingsGoal | null>(null);
  const [withdrawing, setWithdrawing] = useState<SavingsGoal | null>(null);
  const [delPending, setDelPending] = useState(false);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelPending(true);
    const res = await removeGoalAction(deleting.id);
    setDelPending(false);
    if (res.ok) {
      toast.show("Meta eliminada", "success");
      setDeleting(null);
      router.refresh();
    } else {
      toast.show("No se pudo eliminar.", "error");
    }
  };

  return (
    <>
      {goals.length === 0 ? (
        <div className="card card-p">
          <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            Aún no tienes metas de ahorro. Toca el botón + para crear la primera.
          </div>
        </div>
      ) : (
        <div className="card">
          {goals.map((g) => {
            const pct = g.targetAmount > 0 ? Math.min(1, g.currentAmount / g.targetAmount) : 0;
            const pctInt = Math.round(pct * 100);
            const badgeCls = STATUS_BADGE[g.status] ?? "neutral";
            return (
              <SwipeRow key={g.id} onEdit={() => setEditing(g)} onDelete={() => setDeleting(g)}>
                <div style={{ padding: "14px 18px" }}>
                  <div className="gtop" style={{ marginBottom: 8 }}>
                    <span className="gemoji" style={{ background: "var(--accent-soft)", color: "var(--accent)" }} aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="4" />
                      </svg>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{g.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {fmtMonth(g.targetDate)}
                      </div>
                    </div>
                    <span className={`badge ${badgeCls}`}>{pctInt}%</span>
                  </div>
                  <div className="between" style={{ marginBottom: 8 }}>
                    <div className="display" style={{ fontSize: 20 }}>
                      {formatMoney(g.currentAmount, g.currency)}
                    </div>
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      de {formatMoney(g.targetAmount, g.currency)}
                    </div>
                  </div>
                  <div className="bar" style={{ height: 8 }}>
                    <i style={{ width: `${pctInt}%`, background: "linear-gradient(90deg, var(--s1), var(--s5))" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      className="m-btn m-btn-secondary"
                      style={{ flex: 1, minHeight: 42, fontSize: 13.5 }}
                      onClick={() => setContributing(g)}
                    >
                      + Aporte
                    </button>
                    <button
                      type="button"
                      className="m-btn m-btn-secondary"
                      style={{ flex: 1, minHeight: 42, fontSize: 13.5 }}
                      onClick={() => setWithdrawing(g)}
                    >
                      Retirar
                    </button>
                  </div>
                </div>
              </SwipeRow>
            );
          })}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Nueva meta" />

      {/* Alta */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Nueva meta">
        <GoalForm
          currency={currency}
          action={addGoalAction}
          submitLabel="Crear meta"
          successMessage="Meta creada"
          onSuccess={() => setAdding(false)}
        />
      </BottomSheet>

      {/* Edición */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title="Editar meta">
        {editing ? (
          <GoalForm
            currency={currency}
            initial={{
              name: editing.name,
              targetAmount: editing.targetAmount,
              currentAmount: editing.currentAmount,
              monthlyContribution: editing.monthlyContribution,
              currency: editing.currency,
              targetDate: editing.targetDate ?? undefined,
              priority: editing.priority ?? "media",
            }}
            action={(v: GoalValues) => editGoalAction(editing.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Meta actualizada"
            onSuccess={() => setEditing(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Aporte → transacción vinculada (linked_kind='goal') */}
      <BottomSheet open={!!contributing} onClose={() => setContributing(null)} title="Registrar aporte">
        {contributing ? (
          <ContributionForm goal={contributing} onSuccess={() => setContributing(null)} />
        ) : null}
      </BottomSheet>

      {/* Retiro → ingreso vinculado (el backend valida saldo) */}
      <BottomSheet open={!!withdrawing} onClose={() => setWithdrawing(null)} title="Retirar de la meta">
        {withdrawing ? (
          <WithdrawalForm goal={withdrawing} onSuccess={() => setWithdrawing(null)} />
        ) : null}
      </BottomSheet>

      {/* Eliminación (con aviso de dependencias si tiene aportes) */}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar meta"
        message={deleting ? `Se eliminará "${deleting.name}".` : undefined}
        confirmLabel="Eliminar"
        variant="danger"
        dependencies={
          deleting && deleting.currentAmount > 0
            ? [`Tiene ${formatMoney(deleting.currentAmount, deleting.currency)} en aportes acumulados; se perderá ese historial.`]
            : undefined
        }
        pending={delPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/** Aporte: monto + fecha → addGoalContributionAction (crea la transacción vinculada). */
function ContributionForm({ goal, onSuccess }: { goal: SavingsGoal; onSuccess: () => void }) {
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [date, setDate] = useState(todayISO());
  const values = { goalId: goal.id, amount, contributionDate: date };
  return (
    <FormShell
      action={addGoalContributionAction}
      values={values}
      submitLabel="Registrar aporte"
      successMessage="Aporte registrado"
      onSuccess={onSuccess}
    >
      <MoneyField name="amount" label="Monto del aporte" value={amount} onChange={setAmount} currency={goal.currency} />
      <DateField name="contributionDate" label="Fecha" value={date} onChange={setDate} />
    </FormShell>
  );
}

/** Retiro: monto + fecha + nota → withdrawGoalAction (el backend valida que no exceda el saldo). */
function WithdrawalForm({ goal, onSuccess }: { goal: SavingsGoal; onSuccess: () => void }) {
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const values = { goalId: goal.id, amount, withdrawalDate: date, note: note || undefined };
  return (
    <FormShell
      action={withdrawGoalAction}
      values={values}
      submitLabel="Retirar"
      successMessage="Retiro registrado"
      onSuccess={onSuccess}
    >
      <MoneyField name="amount" label="Monto a retirar" value={amount} onChange={setAmount} currency={goal.currency} />
      <DateField name="withdrawalDate" label="Fecha" value={date} onChange={setDate} />
      <TextField name="note" label="Nota (opcional)" value={note} onChange={setNote} placeholder="Motivo del retiro…" maxLength={280} />
    </FormShell>
  );
}
