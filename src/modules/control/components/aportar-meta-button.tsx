"use client";

/**
 * Botón "Aportar" de una meta/sobre de ahorro — UNO SOLO para los dos lugares donde se aporta en
 * web: la fila de la meta en Ahorro y el sobre de ahorro dentro del frasco "Ahorro a largo plazo"
 * del tab de Gastos.
 *
 * Por qué carga su propio contexto en vez de recibirlo por props. Los dos llamadores tienen datos
 * distintos: Ahorro tiene el `SavingsGoal` entero (nativo), pero Gastos tiene un `JarItem` cuyos
 * importes están convertidos a la moneda de VISUALIZACIÓN. Precargar el sugerido desde ahí
 * guardaría un importe multiplicado por el tipo de cambio en una meta que no esté en la moneda de
 * display. Pidiendo `getGoalContributionContextAction(goalId)` al abrir, el modal trabaja siempre
 * en la moneda de la meta, que es la única en la que el aporte se puede guardar.
 *
 * El registro va por `addGoalContributionAction`: crea la transacción vinculada
 * (`linked_kind='goal'`, gasto budget-aware) y sube `current_amount`. Determinista, sin LLM.
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useCaptureToday } from "@/components/tz/timezone-context";
import { formatMoney, currencySymbol, CURRENCY_OPTIONS } from "@/lib/format";
import {
  addGoalContributionAction,
  getGoalContributionContextAction,
} from "@/modules/control/api/actions";
import {
  montoSugerido,
  textoAvanceMes,
  avanceMes,
  validarAporte,
  type AporteContext,
} from "@/modules/control/engine/aporte-meta";

export function AportarMetaButton({
  goalId,
  goalName,
  /** "primary" = acción principal (Ahorro); "compact" = dentro de una lista (Gastos). */
  tone = "primary",
  onDone,
}: {
  goalId: string;
  goalName: string;
  tone?: "primary" | "compact";
  onDone?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const hoy = useCaptureToday();
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<AporteContext | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [date, setDate] = useState(hoy());
  const [pending, setPending] = useState(false);
  const [intento, setIntento] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = async () => {
    setOpen(true);
    setIntento(false);
    setError(null);
    setDate(hoy());
    const c = await getGoalContributionContextAction(goalId);
    if (!c) {
      setError("No pudimos leer la meta.");
      return;
    }
    setCtx(c);
    setCurrency(c.currency);
    // Se precarga lo que FALTA del mes, no el aporte entero: quien aporta en dos partes no
    // tiene que borrar un número que duplicaría su mes.
    const sug = montoSugerido(c);
    setAmount(sug > 0 ? String(sug) : "");
  };

  const cerrar = useCallback(() => {
    setOpen(false);
    setCtx(null);
    setAmount("");
    setIntento(false);
    setError(null);
  }, []);

  const monto = amount.trim() === "" ? null : Number(amount.replace(",", "."));
  const montoNum = monto !== null && Number.isFinite(monto) ? monto : null;
  const errs = ctx
    ? validarAporte({ monto: montoNum, moneda: currency, fecha: date, ctx, hoy: hoy() })
    : {};
  const hayError = Object.keys(errs).length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntento(true);
    if (!ctx || hayError || montoNum === null) return;
    setPending(true);
    setError(null);
    const res = await addGoalContributionAction({
      goalId,
      amount: montoNum,
      contributionDate: date,
      currency,
    });
    setPending(false);
    if (res.ok) {
      toast("Aporte registrado · cuenta como gasto del mes");
      cerrar();
      onDone?.();
      // Refresca el avance del mes, el acumulado de la meta y el gasto del mes de una vez: la
      // acción ya revalida /control-financiero, /transacciones y /mi-base-financiera.
      router.refresh();
    } else {
      setError(res.message ?? "No pudimos registrar el aporte.");
    }
  };

  const avance = ctx ? avanceMes(ctx) : null;

  return (
    <>
      <button
        type="button"
        className={tone === "primary" ? "btn btn-primary tip" : "btn btn-secondary tip"}
        data-tip="Registra el aporte: cuenta como gasto del mes y sube el acumulado de la meta"
        style={{ fontSize: 12, padding: "5px 10px" }}
        onClick={() => void abrir()}
      >
        Aportar
      </button>
      {open ? (
        <Modal
          title={`Aportar — ${goalName}`}
          sub={
            ctx
              ? `${textoAvanceMes(ctx, formatMoney)} · acumulado ${formatMoney(ctx.currentAmount, ctx.currency)}`
              : "Cargando…"
          }
          onClose={cerrar}
        >
          <form onSubmit={submit}>
            <div className="modal-body">
              {error ? (
                <div className="auth-msg warn" role="alert">
                  {error}
                </div>
              ) : null}

              {ctx && avance && ctx.monthlyContribution > 0 ? (
                <div className="fld">
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.round(avance.progreso * 100)}%`,
                        background: avance.cubierto ? "var(--pos)" : "var(--accent)",
                      }}
                    />
                  </div>
                  <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {avance.cubierto
                      ? "El aporte de este mes ya está cubierto; podés aportar de más igual."
                      : `Te faltan ${formatMoney(ctx.monthlyContribution - ctx.aportadoMes, ctx.currency)} para el plan del mes.`}
                  </p>
                </div>
              ) : null}

              <div className="fld-2">
                <div className="fld">
                  <label className="fld-label">Monto del aporte</label>
                  <div className="inp-money">
                    <span className="pre">{currencySymbol(currency || "CRC")}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      autoFocus
                      disabled={!ctx || pending}
                    />
                  </div>
                  {intento && errs.monto ? (
                    <p style={{ fontSize: 12, color: "var(--neg)", marginTop: 4 }}>{errs.monto}</p>
                  ) : null}
                </div>
                <div className="fld">
                  <label className="fld-label">Moneda</label>
                  <select
                    className="sel"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    disabled={!ctx || pending}
                  >
                    {CURRENCY_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.code}
                      </option>
                    ))}
                  </select>
                  {/* El aviso sale al ELEGIRLA, no al enviar: el servicio la rechaza igual, y
                      enterarse recién tras el viaje de ida y vuelta no aporta nada. */}
                  {errs.moneda ? (
                    <p style={{ fontSize: 12, color: "var(--neg)", marginTop: 4 }}>{errs.moneda}</p>
                  ) : null}
                </div>
              </div>

              <div className="fld">
                <label className="fld-label">Fecha</label>
                <input
                  className="inp"
                  type="date"
                  value={date}
                  max={hoy()}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={!ctx || pending}
                />
                {intento && errs.fecha ? (
                  <p style={{ fontSize: 12, color: "var(--neg)", marginTop: 4 }}>{errs.fecha}</p>
                ) : null}
              </div>

              <p className="muted" style={{ fontSize: 12 }}>
                Se registra como gasto del mes (vinculado a la meta) y sube su acumulado.
              </p>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={cerrar}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={pending || !ctx || !!errs.moneda}
              >
                {pending ? "Guardando…" : "Registrar aporte"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
