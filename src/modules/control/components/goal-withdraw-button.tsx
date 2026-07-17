"use client";

/**
 * Botón "Retirar" de una meta de ahorro (Fase 4.1 · flujos inversos).
 * Componente autocontenido para minimizar la superficie de conflicto en
 * control-dashboard (pantalla coordinada con su owner): el dashboard solo
 * agrega <GoalWithdrawButton goal={g} /> junto a editar/eliminar.
 *
 * El retiro baja current_amount y crea el ingreso vinculado
 * (linked_kind='goal') vía withdrawGoalAction (backend de Fase 4).
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatMoney, currencySymbol } from "@/lib/format";
import { withdrawGoalAction } from "@/modules/control/api/actions";
import type { SavingsGoal } from "@/modules/control/types";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function GoalWithdrawButton({ goal }: { goal: SavingsGoal }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amt = parseFloat(amount) || 0;
  const exceeds = amt > goal.currentAmount;

  const close = useCallback(() => {
    setOpen(false);
    setAmount("");
    setNote("");
    setError(null);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amt <= 0) return setError("Ingresa un monto válido.");
    if (exceeds) return setError("No puedes retirar más de lo acumulado en la meta.");
    setPending(true);
    setError(null);
    const res = await withdrawGoalAction({
      goalId: goal.id,
      amount: amt,
      withdrawalDate: date,
      note: note.trim() || undefined,
    });
    setPending(false);
    if (res.ok) {
      toast("Retiro registrado como ingreso vinculado");
      close();
      router.refresh();
    } else {
      setError(res.message ?? "No pudimos registrar el retiro.");
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ fontSize: 12, padding: "5px 10px" }}
        onClick={() => setOpen(true)}
      >
        Retirar
      </button>
      {open ? (
        <Modal
          title={`Retirar — ${goal.name}`}
          sub={`Acumulado: ${formatMoney(goal.currentAmount, goal.currency)}`}
          onClose={close}
        >
          <form onSubmit={submit}>
            <div className="modal-body">
              {error ? (
                <div className="auth-msg warn" role="alert">
                  {error}
                </div>
              ) : null}
              <div className="fld">
                <label className="fld-label">Monto a retirar</label>
                {/* El retiro es siempre en la moneda de la meta; se muestra
                    explícita como prefijo (no se captura en otra moneda). */}
                <div className="inp-money">
                  <span className="pre">{currencySymbol(goal.currency)}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={goal.currentAmount}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    autoFocus
                    required
                  />
                </div>
                {exceeds ? (
                  <p style={{ fontSize: 12, color: "var(--neg)", marginTop: 4 }}>
                    No puedes retirar más de {formatMoney(goal.currentAmount, goal.currency)}.
                  </p>
                ) : (
                  <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Entrará como ingreso vinculado a la meta y bajará su avance.
                  </p>
                )}
              </div>
              <div className="fld-2">
                <div className="fld">
                  <label className="fld-label">Fecha</label>
                  <input
                    className="inp"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="fld">
                  <label className="fld-label">Nota</label>
                  <input
                    className="inp"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={close}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={pending || exceeds}>
                {pending ? "Guardando…" : "Registrar retiro"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
