"use client";

/**
 * Botón "Movimientos" de una meta de ahorro (Delta C · trazabilidad).
 * Autocontenido como el resto de los botones de la tarjeta. Abre un modal que
 * carga de forma perezosa el detalle del frasco (getGoalDetailAction) y lista
 * sus movimientos —aportes (+), gastos (−) y retiros (−)— con saldo corrido,
 * más el resumen acumulado / meta / brecha.
 */
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/format";
import { getGoalDetailAction } from "@/modules/control/api/actions";
import type { GoalDetailVM, GoalMovementType } from "@/modules/control/services/goal-detail-service";
import type { SavingsGoal } from "@/modules/control/types";

const TYPE_LABEL: Record<GoalMovementType, string> = {
  inicial: "Saldo inicial",
  aporte: "Aporte",
  gasto: "Gasto",
  retiro: "Retiro",
};

const TYPE_TIP: Record<GoalMovementType, string> = {
  inicial: "Acumulado con el que se creó el frasco",
  aporte: "Metiste plata al frasco (cuenta como ahorro del mes)",
  gasto: "Consumiste el frasco en una compra (off-budget: no toca tu presupuesto del mes)",
  retiro: "Devolviste la plata a tu cuenta (ingreso)",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export function GoalDetailButton({ goal }: { goal: SavingsGoal }) {
  const [open, setOpen] = useState(false);
  const [vm, setVm] = useState<GoalDetailVM | null>(null);
  const [loaded, setLoaded] = useState(false);

  const openModal = async () => {
    setOpen(true);
    if (!loaded) {
      const detail = await getGoalDetailAction(goal.id);
      setVm(detail);
      setLoaded(true);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost tip"
        data-tip="Ver el historial de aportes, gastos y retiros del frasco con su saldo"
        style={{ fontSize: 12, padding: "5px 10px" }}
        onClick={() => void openModal()}
      >
        Movimientos
      </button>
      {open ? (
        <Modal
          title={`Movimientos — ${goal.name}`}
          sub="Aportes, gastos y retiros del frasco con su saldo"
          onClose={() => setOpen(false)}
        >
          <div className="modal-body">
            {!loaded ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Cargando movimientos…
              </p>
            ) : !vm ? (
              <div className="auth-msg warn" role="alert">
                No pudimos cargar el detalle del frasco.
              </div>
            ) : (
              <>
                <div className="between" style={{ gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
                  <Stat label="Acumulado" value={formatMoney(vm.currentAmount, vm.currency)} />
                  <Stat label="Meta" value={formatMoney(vm.targetAmount, vm.currency)} />
                  <Stat
                    label="Brecha"
                    value={formatMoney(vm.gap, vm.currency)}
                    tip="Lo que falta para la meta (meta − acumulado)"
                  />
                </div>
                {vm.movements.length === 0 ? (
                  <p className="muted" style={{ fontSize: 13 }}>
                    Este frasco aún no tiene movimientos. Registra un aporte para empezar.
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="amort-table">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Tipo</th>
                          <th>Categoría</th>
                          <th>Monto</th>
                          <th>Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vm.movements.map((m) => (
                          <tr key={m.id}>
                            <td>{fmtDate(m.date)}</td>
                            <td>
                              <span className="tip" data-tip={TYPE_TIP[m.type]}>
                                {TYPE_LABEL[m.type]}
                                {m.offBudget ? " ·" : ""}
                              </span>
                              {m.offBudget ? (
                                <span
                                  className="tip"
                                  data-tip="Off-budget: no cuenta en tu presupuesto del mes"
                                  style={{ fontSize: 11, color: "var(--muted)" }}
                                >
                                  {" "}
                                  sin presupuesto
                                </span>
                              ) : null}
                              {m.note ? (
                                <div className="muted" style={{ fontSize: 11 }}>
                                  {m.note}
                                </div>
                              ) : null}
                            </td>
                            <td>{m.categoryLabel ?? "—"}</td>
                            <td
                              className="tnum"
                              style={{ color: m.amount >= 0 ? "var(--pos)" : "var(--neg)" }}
                            >
                              {m.amount >= 0 ? "+" : "−"}
                              {formatMoney(Math.abs(m.amount), vm.currency)}
                            </td>
                            <td className="tnum">{formatMoney(m.balance, vm.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Stat({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <div>
      <div
        className={`muted ${tip ? "tip" : ""}`}
        data-tip={tip}
        style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}
      >
        {label}
      </div>
      <div className="display" style={{ fontSize: 18 }}>
        {value}
      </div>
    </div>
  );
}
