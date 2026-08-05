"use client";

/**
 * Botón + modal del PAGO VINCULADO, uno solo para los dos tipos y los dos lugares:
 *
 *   · meta  → "Aportar", en Ahorro y en el frasco "Ahorro a largo plazo" del tab de Gastos.
 *   · deuda → "Pagar",   en el frasco "Deudas" del tab de Gastos.
 *
 * Un solo componente a propósito. Los dos gestos son el mismo —un gasto del mes atado a una
 * entidad que sube o baja su saldo— y tenerlos separados fue exactamente lo que dejó al frasco de
 * Deudas en "solo lectura" mientras el de Ahorro ganaba su botón.
 *
 * Carga su propio contexto en vez de recibirlo por props porque los llamadores tienen datos
 * distintos: Ahorro/Deudas tienen la entidad entera (nativa), pero el frasco de Gastos tiene un
 * `JarItem` con los importes convertidos a la moneda de VISUALIZACIÓN. Precargar desde ahí
 * guardaría un importe multiplicado por el tipo de cambio — y en deuda es peor, porque
 * `debt_payments` no tiene columna de moneda donde se note.
 *
 * UNA SOLA FUENTE DE ESCRITURA por tipo, la canónica de cada módulo:
 *   · meta  → `addGoalContributionAction`
 *   · deuda → `reportPaymentAction`, el mismo que usa el tab de Deudas. Va por la RPC atómica
 *     `record_debt_payment` (gasto + debt_payment en una transacción de BD) y recibe el split ya
 *     resuelto. La otra ruta que existe —`propagateLinkedTransaction`, la del composer— deriva el
 *     split sola y escribe en dos pasos; usarla acá habría creado un segundo camino que se
 *     desincroniza del primero.
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useCaptureToday } from "@/components/tz/timezone-context";
import { formatMoney, currencySymbol, CURRENCY_OPTIONS } from "@/lib/format";
import {
  addGoalContributionAction,
  reportPaymentAction,
  getPagoContextAction,
} from "@/modules/control/api/actions";
import {
  montoSugerido,
  textoAvanceMes,
  avanceMes,
  desglosePago,
  validarPago,
  type PagoContext,
  type PagoKind,
} from "@/modules/control/engine/pago-vinculado";

const COPY: Record<PagoKind, { cta: string; title: string; submit: string; ok: string; tip: string }> = {
  meta: {
    cta: "Aportar",
    title: "Aportar",
    submit: "Registrar aporte",
    ok: "Aporte registrado · cuenta como gasto del mes",
    tip: "Registra el aporte: cuenta como gasto del mes y sube el acumulado de la meta",
  },
  deuda: {
    cta: "Pagar",
    title: "Pagar",
    submit: "Registrar pago",
    ok: "Pago registrado · cuenta como gasto del mes",
    tip: "Registra el pago: cuenta como gasto del mes, baja el saldo y queda en el historial de la deuda",
  },
};

export function PagoVinculadoButton({
  kind,
  id,
  name,
  /** "primary" = acción principal (Ahorro/Deudas); "compact" = dentro de una lista (Gastos). */
  tone = "primary",
  onDone,
}: {
  kind: PagoKind;
  id: string;
  name: string;
  tone?: "primary" | "compact";
  onDone?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const hoy = useCaptureToday();
  const copy = COPY[kind];
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<PagoContext | null>(null);
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
    const c = await getPagoContextAction(kind, id);
    if (!c) {
      setError(kind === "deuda" ? "No pudimos leer la deuda." : "No pudimos leer la meta.");
      return;
    }
    setCtx(c);
    setCurrency(c.currency);
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

  const crudo = amount.trim() === "" ? null : Number(amount.replace(",", "."));
  const monto = crudo !== null && Number.isFinite(crudo) ? crudo : null;
  const errs = ctx
    ? validarPago({ monto, moneda: currency, fecha: date, ctx, hoy: hoy() })
    : {};
  const hayError = Object.keys(errs).length > 0;
  const avance = ctx ? avanceMes(ctx) : null;
  // Desglose EN VIVO: lo que el servidor va a aplicar igual, dicho antes de confirmar.
  const desglose = ctx && monto !== null && monto > 0 ? desglosePago(ctx, monto) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntento(true);
    if (!ctx || hayError || monto === null) return;
    setPending(true);
    setError(null);
    const res =
      kind === "meta"
        ? await addGoalContributionAction({
            goalId: id,
            amount: monto,
            contributionDate: date,
            currency,
          })
        : await reportPaymentAction({
            debtId: id,
            paymentDate: date,
            // El split va RESUELTO, igual que desde el tab de Deudas: `amount` es la cuota y
            // `extraAmount` el excedente que amortiza capital. Es el mismo desglose que se
            // mostró arriba, así que lo que se guarda es lo que el usuario vio.
            amount: desglose?.cuota ?? monto,
            extraAmount: desglose?.extra ?? 0,
            kind: "ordinario",
            currency,
          });
    setPending(false);
    if (res.ok) {
      toast(copy.ok);
      cerrar();
      onDone?.();
      router.refresh();
    } else {
      setError(res.message ?? "No pudimos registrar el movimiento.");
    }
  };

  return (
    <>
      <button
        type="button"
        className={tone === "primary" ? "btn btn-primary tip" : "btn btn-secondary tip"}
        data-tip={copy.tip}
        style={{ fontSize: 12, padding: "5px 10px" }}
        onClick={() => void abrir()}
      >
        {copy.cta}
      </button>
      {open ? (
        <Modal
          title={`${copy.title} — ${name}`}
          sub={ctx ? textoAvanceMes(ctx, formatMoney) : "Cargando…"}
          onClose={cerrar}
        >
          <form onSubmit={submit}>
            <div className="modal-body">
              {error ? (
                <div className="auth-msg warn" role="alert">
                  {error}
                </div>
              ) : null}

              {ctx && avance && ctx.compromisoMensual > 0 ? (
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
                      ? kind === "deuda"
                        ? "La cuota de este mes ya está cubierta; podés abonar de más igual."
                        : "El aporte de este mes ya está cubierto; podés aportar de más igual."
                      : `Faltan ${formatMoney(ctx.compromisoMensual - ctx.hechoMes, ctx.currency)} para ${kind === "deuda" ? "la cuota" : "el plan"} del mes.`}
                  </p>
                </div>
              ) : null}

              <div className="fld-2">
                <div className="fld">
                  <label className="fld-label">
                    {kind === "deuda" ? "Monto a pagar" : "Monto del aporte"}
                  </label>
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
                  {/* El aviso sale al ELEGIRLA, no al enviar: el servicio la rechaza igual. */}
                  {errs.moneda ? (
                    <p style={{ fontSize: 12, color: "var(--neg)", marginTop: 4 }}>{errs.moneda}</p>
                  ) : null}
                </div>
              </div>

              {/* Desglose en vivo: qué parte es cuota y qué parte amortiza capital. */}
              {kind === "deuda" && desglose && desglose.extra > 0 ? (
                <div className="auth-msg" style={{ fontSize: 12 }}>
                  Cuota {formatMoney(desglose.cuota, ctx!.currency)} + abono extra{" "}
                  {formatMoney(desglose.extra, ctx!.currency)} a capital
                  {desglose.mesesAdelantados
                    ? ` · adelantás ${desglose.mesesAdelantados} ${desglose.mesesAdelantados === 1 ? "mes" : "meses"}`
                    : ""}
                  .
                </div>
              ) : null}

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
                {kind === "deuda"
                  ? "Se registra como gasto del mes, baja el saldo y queda en el historial de la deuda."
                  : "Se registra como gasto del mes (vinculado a la meta) y sube su acumulado."}
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
                {pending ? "Guardando…" : copy.submit}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
