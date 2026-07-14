"use client";

/**
 * Botón "Gastar" de una meta de ahorro (Delta B · gastar del frasco).
 * Autocontenido igual que GoalWithdrawButton para minimizar la superficie de
 * conflicto en control-dashboard: el dashboard solo agrega <GoalSpendButton />.
 *
 * "Gastar" ≠ "Retirar":
 *   · Retirar → devuelve la plata a tu cuenta (INGRESO vinculado).
 *   · Gastar  → consumiste el frasco en una compra real: GASTO con categoría,
 *               OFF-BUDGET (no toca el presupuesto del mes, ya se contó al
 *               aportar) que baja el acumulado Y la meta por el mismo monto.
 *
 * La categoría se elige por gasto (el frasco no la fija). Las categorías se
 * cargan de forma perezosa al abrir el modal (misma fuente que el composer).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatMoney, currencySymbol } from "@/lib/format";
import {
  spendFromGoalAction,
  listExpenseCategoriesAction,
  type ExpenseCategoryGroup,
} from "@/modules/control/api/actions";
import type { SavingsGoal } from "@/modules/control/types";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function GoalSpendButton({ goal }: { goal: SavingsGoal }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [cats, setCats] = useState<ExpenseCategoryGroup[]>([]);
  const [catsLoaded, setCatsLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amt = parseFloat(amount) || 0;
  const exceeds = amt > goal.currentAmount;

  const openModal = async () => {
    setOpen(true);
    if (!catsLoaded) {
      const groups = await listExpenseCategoriesAction();
      setCats(groups);
      setCatsLoaded(true);
    }
  };

  const close = () => {
    setOpen(false);
    setAmount("");
    setNote("");
    setCategoryId("");
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amt <= 0) return setError("Ingresa un monto válido.");
    if (exceeds) return setError("No puedes gastar más de lo acumulado en la meta.");
    setPending(true);
    setError(null);
    const res = await spendFromGoalAction({
      goalId: goal.id,
      amount: amt,
      spendDate: date,
      categoryId: categoryId || null,
      note: note.trim() || undefined,
    });
    setPending(false);
    if (res.ok) {
      toast("Gasto del frasco registrado (no toca tu presupuesto del mes)");
      close();
      router.refresh();
    } else {
      setError(res.message ?? "No pudimos registrar el gasto.");
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary tip"
        data-tip="Consumiste el frasco en una compra: gasto con categoría que NO toca tu presupuesto del mes y reduce la meta"
        style={{ fontSize: 12, padding: "5px 10px" }}
        onClick={() => void openModal()}
      >
        Gastar
      </button>
      {open ? (
        <Modal
          title={`Gastar del frasco — ${goal.name}`}
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
                <label className="fld-label">Monto a gastar</label>
                {/* Siempre en la moneda de la meta (prefijo explícito). */}
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
                    No puedes gastar más de {formatMoney(goal.currentAmount, goal.currency)}.
                  </p>
                ) : (
                  <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Se registra como gasto con categoría, off-budget. Baja el acumulado y la meta;
                    tu presupuesto del mes no cambia.
                  </p>
                )}
              </div>
              <div className="fld">
                <label className="fld-label">Categoría</label>
                <select
                  className="sel"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">{catsLoaded ? "Sin categoría" : "Cargando…"}</option>
                  {cats.map((g) => (
                    <optgroup key={g.groupName} label={g.groupName}>
                      {g.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
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
                {pending ? "Guardando…" : "Registrar gasto"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
