"use client";

/**
 * Candado de edición de presupuesto de un sobre del periodo en curso. Exige
 * aceptar, en orden, los 3 checks antes de habilitar "Continuar y modificar".
 * Tras continuar: editar el monto del sobre → mensaje de éxito. Texto literal
 * del diseño.
 */
import { CURRENCY_SYMBOL } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { setEnvelopeBudgetAction } from "@/modules/financial-base/api/v2-actions";
import type { Period } from "@/modules/financial-base/types";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const CHECKS = [
  "Entiendo que este presupuesto debió estar configurado antes de iniciar el período.",
  "Entiendo que modificar el presupuesto afectará la precisión de mis métricas y análisis financieros.",
  "Entiendo que debería utilizar esta acción únicamente cuando exista un cambio real en mis circunstancias financieras.",
];


export function BudgetWarningModal({
  envelope,
  period,
  currency,
  onClose,
}: {
  envelope: { id: string; name: string; budget: number };
  period: Period;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<boolean[]>([false, false, false]);
  const [phase, setPhase] = useState<"warning" | "edit" | "success">("warning");
  const [amount, setAmount] = useState(String(Math.round(envelope.budget) || ""));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = checked.every(Boolean);
  // "En orden": el check N solo se habilita cuando el N-1 ya está marcado.
  const isEnabled = (i: number) => i === 0 || checked.slice(0, i).every(Boolean);

  const periodLabel = `${MONTHS[period.month - 1] ?? ""} ${period.year}`;
  const sym = CURRENCY_SYMBOL[currency] ?? "";

  async function save() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) return setError("Ingresa un monto válido.");
    setPending(true);
    setError(null);
    const res = await setEnvelopeBudgetAction({
      categoryId: envelope.id,
      name: envelope.name,
      amount: amt,
      currency,
      periodMonth: period.month,
      periodYear: period.year,
    });
    setPending(false);
    if (res.ok) {
      setPhase("success");
      router.refresh();
    } else {
      setError(res.message ?? "No pudimos actualizar el presupuesto.");
    }
  }

  return (
    <Modal title="Modificar presupuesto del período actual" sub={`${periodLabel} · período en curso`} onClose={onClose}>
      <div className="modal-body">
        {phase === "warning" ? (
          <>
            <p style={{ fontSize: 14, marginBottom: 8 }}>
              Tu presupuesto idealmente debería estar definido <strong>antes de iniciar el período</strong>.
            </p>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Cuando modificas un presupuesto después de iniciado el mes, los reportes y análisis financieros
              pueden perder precisión, ya que los resultados dejarán de reflejar la planificación original.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CHECKS.map((text, i) => {
                const on = checked[i];
                const enabled = isEnabled(i);
                return (
                  <label
                    key={i}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: "12px 14px",
                      borderRadius: "var(--r-md)",
                      border: `1.5px solid ${on ? "var(--pos)" : "var(--line)"}`,
                      background: on ? "var(--pos-soft, rgba(60,140,90,.10))" : "transparent",
                      cursor: enabled ? "pointer" : "not-allowed",
                      opacity: enabled ? 1 : 0.5,
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!enabled}
                      onChange={(e) => setChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : j > i ? false : v)))}
                      style={{ marginTop: 1, flex: "none" }}
                    />
                    <span>{text}</span>
                  </label>
                );
              })}
            </div>
          </>
        ) : phase === "edit" ? (
          <div className="fld">
            <label className="fld-label">Nuevo presupuesto del sobre · {envelope.name}</label>
            {error ? <div className="auth-msg warn" role="alert" style={{ marginBottom: 8 }}>{error}</div> : null}
            <div className="inp-money" style={{ fontSize: 22 }}>
              <span className="pre" style={{ fontSize: 19 }}>{sym}</span>
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                style={{ fontSize: 22, fontWeight: 650 }}
              />
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 14, padding: "8px 0", lineHeight: 1.5 }}>
            Excelente. Lo importante no es ser perfecto, sino mantener un presupuesto que refleje tu realidad financiera.
          </p>
        )}
      </div>

      <div className="modal-foot">
        {phase === "warning" ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={!allChecked} onClick={() => setPhase("edit")}>
              Continuar y modificar
            </button>
          </>
        ) : phase === "edit" ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setPhase("warning")}>Atrás</button>
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void save()}>
              {pending ? "Guardando…" : "Guardar presupuesto"}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onClose} style={{ marginLeft: "auto" }}>
            Listo
          </button>
        )}
      </div>
    </Modal>
  );
}
