"use client";

/**
 * Edición del presupuesto de un sobre del período en curso. Dos caminos según la
 * VENTANA DE CONFIGURACIÓN (días 1-5 del mes, ver lib/rhythm/engine.ts):
 *
 *  · VENTANA ABIERTA → se edita directo, sin fricción. Es el momento previsto para
 *    configurar; poner un gate de tres checks acá sería castigar a quien lo hace bien.
 *
 *  · VENTANA CERRADA (vencida, o cerrada a mano por el hogar) → el candado se muestra
 *    cerrado, pero SE PUEDE abrir: los tres checks en cascada de siempre, más la línea
 *    de que la edición queda registrada. Nunca se bloquea del todo. La vida cambia a
 *    mitad de mes, y una app que le dice "no" a un cambio real de circunstancias enseña
 *    a mentirle a la app.
 *
 * El contador (`budget_late_edits`) es una SEÑAL para el asesor, no un castigo: un sobre
 * ajustado cuatro veces tarde no dice "sos indisciplinado", dice "este presupuesto está
 * mal calibrado". Por eso el copy lo enuncia sin dramatismo.
 *
 * Quién decide si la ventana está abierta es el SERVIDOR (setEnvelopeBudgetAction). Lo
 * que se lee acá es solo para pintar la pantalla correcta de entrada: si esta lectura
 * fallara y mostráramos el camino libre, la acción devolvería `needsConfirmation` y el
 * modal caería al gate igual.
 */
import { CURRENCY_SYMBOL, CURRENCY_OPTIONS } from "@/lib/format";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { setEnvelopeBudgetAction } from "@/modules/financial-base/api/v2-actions";
import { getRhythmStateAction } from "@/lib/rhythm/actions";
import { nombreMesCap, type VentanaEstado } from "@/lib/rhythm/engine";
import type { Period } from "@/modules/financial-base/types";

const CHECKS = [
  "Entiendo que este presupuesto debió estar configurado antes de iniciar el período.",
  "Entiendo que modificar el presupuesto afectará la precisión de mis métricas y análisis financieros.",
  "Entiendo que debería utilizar esta acción únicamente cuando exista un cambio real en mis circunstancias financieras.",
];

/** "cargando" hasta que se resuelve la ventana: evita pintar el camino equivocado y saltar. */
type Estado = "cargando" | VentanaEstado;

export function BudgetWarningModal({
  envelope,
  period,
  currency,
  onClose,
}: {
  envelope: { id: string; name: string; budget: number; nativeBudget: number; currency: string };
  period: Period;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("cargando");
  const [diasRestantes, setDiasRestantes] = useState(0);
  const [checked, setChecked] = useState<boolean[]>([false, false, false]);
  const [phase, setPhase] = useState<"warning" | "edit" | "success">("warning");
  const [cur, setCur] = useState(envelope.currency || currency);
  const [amount, setAmount] = useState(
    String(Math.round(envelope.nativeBudget ?? envelope.budget) || ""),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getRhythmStateAction()
      .then((snap) => {
        if (!vivo) return;
        const v = snap.state?.ventana;
        // Sin estado (sin sesión, error): se asume lo CONSERVADOR —cerrada—, que es el
        // camino con confirmación. Nunca al revés: saltarse el gate por un fallo de
        // lectura dejaría ediciones tardías sin registrar.
        setEstado(v?.estado ?? "vencida");
        setDiasRestantes(v?.diasRestantes ?? 0);
        // Ventana abierta: derecho al editor, sin gate.
        if (v?.abierta) setPhase("edit");
      })
      .catch(() => {
        if (vivo) setEstado("vencida");
      });
    return () => {
      vivo = false;
    };
  }, []);

  const abierta = estado === "abierta";
  const allChecked = checked.every(Boolean);
  // "En orden": el check N solo se habilita cuando el N-1 ya está marcado.
  const isEnabled = (i: number) => i === 0 || checked.slice(0, i).every(Boolean);

  const periodLabel = `${nombreMesCap(period.month)} ${period.year}`;
  const sym = CURRENCY_SYMBOL[cur] ?? cur;

  async function save() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) return setError("Ingresa un monto válido.");
    setPending(true);
    setError(null);
    const res = await setEnvelopeBudgetAction({
      categoryId: envelope.id,
      name: envelope.name,
      amount: amt,
      currency: cur,
      periodMonth: period.month,
      periodYear: period.year,
      // Llegar al editor con la ventana cerrada implica haber pasado el gate.
      confirmedOutsideWindow: !abierta,
    });
    setPending(false);
    if (res.ok) {
      setPhase("success");
      router.refresh();
      return;
    }
    // El servidor manda: si dice que hace falta confirmar, se vuelve al gate. Pasa si la
    // ventana se venció entre que se abrió el modal y se guardó (medianoche del día 5).
    if (res.needsConfirmation) {
      setEstado("vencida");
      setPhase("warning");
      setChecked([false, false, false]);
      setError(res.message ?? null);
      return;
    }
    setError(res.message ?? "No pudimos actualizar el presupuesto.");
  }

  const subtitulo = abierta
    ? `${periodLabel} · ventana de configuración abierta`
    : estado === "cerrada_por_el_usuario"
      ? `${periodLabel} · ya cerraste la configuración del mes`
      : `${periodLabel} · fuera de la ventana de configuración`;

  return (
    <Modal
      title={
        abierta ? "Ajustar el presupuesto del sobre" : "Modificar presupuesto fuera de ventana"
      }
      sub={estado === "cargando" ? periodLabel : subtitulo}
      onClose={onClose}
    >
      <div className="modal-body">
        {estado === "cargando" ? (
          <p className="muted" style={{ fontSize: 13, padding: "8px 0" }}>
            Cargando…
          </p>
        ) : phase === "warning" ? (
          <>
            <p style={{ fontSize: 14, marginBottom: 8 }}>
              {estado === "cerrada_por_el_usuario"
                ? "Ya diste por cerrada la configuración de este mes."
                : "La ventana para configurar este mes fue del día 1 al 5."}{" "}
              Podés modificarlo igual — <strong>esto queda registrado</strong>.
            </p>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              No es un castigo: llevamos la cuenta de los ajustes fuera de ventana para distinguir
              un cambio real en tus circunstancias de un sobre que quedó mal calibrado desde el
              principio. Si un sobre se ajusta seguido, el problema es el monto, no vos.
            </p>
            {error ? (
              <div className="auth-msg warn" role="alert" style={{ marginBottom: 10 }}>
                {error}
              </div>
            ) : null}
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
                      onChange={(e) =>
                        setChecked((prev) =>
                          prev.map((v, j) => (j === i ? e.target.checked : j > i ? false : v)),
                        )
                      }
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
            {abierta ? (
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
                Estás dentro de la ventana de configuración
                {diasRestantes > 0
                  ? diasRestantes === 1
                    ? " (hoy es el último día)"
                    : ` (te quedan ${diasRestantes} días)`
                  : ""}
                : ajustá lo que necesités, sin registro.
              </p>
            ) : null}
            <label className="fld-label">Nuevo presupuesto del sobre · {envelope.name}</label>
            {error ? (
              <div className="auth-msg warn" role="alert" style={{ marginBottom: 8 }}>
                {error}
              </div>
            ) : null}
            <div className="inp-money" style={{ fontSize: 22 }}>
              <span className="pre" style={{ fontSize: 19 }}>
                {sym}
              </span>
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
            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)" }}>
                Moneda del sobre
              </span>
              <select
                className="inp"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                style={{ fontSize: 14 }}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.symbol}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p style={{ fontSize: 14, padding: "8px 0", lineHeight: 1.5 }}>
            {abierta
              ? "Listo. Mientras la ventana esté abierta podés seguir acomodando tus sobres las veces que haga falta."
              : "Excelente. Lo importante no es ser perfecto, sino mantener un presupuesto que refleje tu realidad financiera."}
          </p>
        )}
      </div>

      <div className="modal-foot">
        {estado === "cargando" ? null : phase === "warning" ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!allChecked}
              onClick={() => setPhase("edit")}
            >
              Continuar y modificar
            </button>
          </>
        ) : phase === "edit" ? (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => (abierta ? onClose() : setPhase("warning"))}
            >
              {abierta ? "Cancelar" : "Atrás"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() => void save()}
            >
              {pending ? "Guardando…" : "Guardar presupuesto"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            style={{ marginLeft: "auto" }}
          >
            Listo
          </button>
        )}
      </div>
    </Modal>
  );
}
