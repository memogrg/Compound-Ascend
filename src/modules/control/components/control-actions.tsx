"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { focusFirstError } from "@/lib/forms";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import {
  addGoalAction,
  addDebtAction,
  editGoalAction,
  editDebtAction,
} from "@/modules/control/api/actions";
import { pmt } from "@/modules/control/engine/amortization";
import type { SavingsGoal, Debt } from "@/modules/control/types";

type Kind = "goal" | "debt";

/** Botón de alta (objetivo / deuda) que abre su propio diálogo. Reutilizable
 * en la toolbar y en los estados vacíos accionables. */
export function AddControlButton({
  kind,
  currency,
  label,
  variant = "btn-primary",
  indexRates,
}: {
  kind: Kind;
  currency: string;
  label?: string;
  variant?: "btn-primary" | "btn-secondary";
  indexRates?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn ${variant}`} onClick={() => setOpen(true)}>
        <Icon name={kind === "goal" ? "savings" : "debt"} width={2} />{" "}
        {label ?? (kind === "goal" ? "Agregar objetivo" : "Agregar deuda")}
      </button>
      {open ? (
        <ControlDialog kind={kind} currency={currency} indexRates={indexRates} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function ControlActions({
  currency = "CRC",
}: {
  currency?: string;
  /** Aceptado por compatibilidad con la página; las deudas viven en /deudas. */
  indexRates?: Record<string, number>;
}) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <AddControlButton kind="goal" currency={currency} variant="btn-primary" />
    </div>
  );
}

/** Botón de editar (objetivo / deuda). */
export function EditControlButton({
  kind,
  item,
  currency,
  indexRates,
}: {
  kind: Kind;
  item: SavingsGoal | Debt;
  currency: string;
  indexRates?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-btn"
        style={{ width: 30, height: 30 }}
        aria-label="Editar"
        title="Editar"
        onClick={() => setOpen(true)}
      >
        <Icon name="edit" />
      </button>
      {open ? (
        <ControlDialog kind={kind} currency={currency} item={item} indexRates={indexRates} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function ControlDialog({
  kind,
  currency,
  item,
  indexRates,
  onClose,
}: {
  kind: Kind;
  currency: string;
  item?: SavingsGoal | Debt;
  indexRates?: Record<string, number>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(item);
  const done = () => {
    toast(editing ? "Cambios guardados" : "Agregado");
    onClose();
    router.refresh();
  };
  const title = editing
    ? kind === "goal"
      ? "Editar objetivo"
      : "Editar deuda"
    : kind === "goal"
      ? "Agregar objetivo"
      : "Agregar deuda";
  return (
    <Modal
      title={title}
      sub={
        kind === "goal"
          ? "¿Para qué estás apartando dinero?"
          : "No es para juzgarte; es para liberarte de presión financiera."
      }
      onClose={onClose}
    >
      {kind === "goal" ? (
        <GoalForm currency={currency} onDone={done} onCancel={onClose} item={item as SavingsGoal | undefined} />
      ) : (
        <DebtForm currency={currency} onDone={done} onCancel={onClose} item={item as Debt | undefined} indexRates={indexRates} />
      )}
    </Modal>
  );
}

function useFormSubmit(action: (raw: unknown) => Promise<{ ok: boolean; fieldErrors?: Record<string, string>; message?: string }>) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const run = async (payload: unknown, onOk: () => void, form?: HTMLFormElement) => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const res = await action(payload);
    setPending(false);
    if (res.ok) onOk();
    else {
      if (res.fieldErrors) {
        setErrors(res.fieldErrors);
        focusFirstError(form, res.fieldErrors);
      }
      if (res.message) setMessage(res.message);
    }
  };
  return { pending, errors, message, run };
}

function GoalForm({ currency, onDone, onCancel, item }: { currency: string; onDone: () => void; onCancel: () => void; item?: SavingsGoal }) {
  const action = item ? (raw: unknown) => editGoalAction(item.id, raw) : addGoalAction;
  const { pending, errors, message, run } = useFormSubmit(action);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    run(
      {
        name: String(fd.get("name") ?? ""),
        targetAmount: Number(fd.get("targetAmount") ?? 0),
        currentAmount: Number(fd.get("currentAmount") ?? 0),
        monthlyContribution: Number(fd.get("monthlyContribution") ?? 0),
        currency: String(fd.get("currency") ?? currency),
        targetDate: String(fd.get("targetDate") ?? "") || undefined,
        priority: String(fd.get("priority") ?? "media"),
      },
      onDone,
      form,
    );
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? (
          <div className="auth-msg warn" role="alert">
            {message}
          </div>
        ) : null}
        <div className="fld">
          <label className="fld-label">Nombre del objetivo</label>
          <input className="inp" name="name" defaultValue={item?.name ?? ""} placeholder="Fondo de emergencia, viaje…" required aria-invalid={errors.name ? true : undefined} />
          {errors.name ? (
            <span className="auth-err" role="alert">
              {errors.name}
            </span>
          ) : null}
        </div>
        <div className="fld-2">
          <Money label="Monto meta" name="targetAmount" currency={currency} error={errors.targetAmount} defaultValue={item?.targetAmount} />
          <Money label="Acumulado" name="currentAmount" currency={currency} defaultValue={item?.currentAmount} />
        </div>
        <div className="fld-2">
          <Money label="Aporte mensual" name="monthlyContribution" currency={currency} defaultValue={item?.monthlyContribution} />
          <div className="fld">
            <label className="fld-label">Fecha objetivo</label>
            <input className="inp" name="targetDate" type="date" defaultValue={item?.targetDate ?? ""} />
          </div>
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Moneda</label>
            <select className="sel" name="currency" defaultValue={item?.currency ?? currency}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Prioridad</label>
            <select className="sel" name="priority" defaultValue={item?.priority ?? "media"}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>
        </div>
      </div>
      <Foot pending={pending} onCancel={onCancel} />
    </form>
  );
}

const DEBT_TYPES = [
  { value: "tarjeta", label: "Tarjeta de crédito" },
  { value: "personal", label: "Préstamo personal" },
  { value: "estudiantil", label: "Estudiantil" },
  { value: "auto", label: "Automóvil" },
  { value: "hipoteca", label: "Hipoteca" },
  { value: "otro", label: "Otro" },
];

function DebtForm({
  currency,
  onDone,
  onCancel,
  item,
  indexRates,
}: {
  currency: string;
  onDone: () => void;
  onCancel: () => void;
  item?: Debt;
  indexRates?: Record<string, number>;
}) {
  const action = item ? (raw: unknown) => editDebtAction(item.id, raw) : addDebtAction;
  const { pending, errors, message, run } = useFormSubmit(action);
  const [rateType, setRateType] = useState<"fija" | "variable">(item?.rateType ?? "fija");

  const totalTerm = item?.termMonths ?? 0;
  // Estado controlado de los campos que alimentan la cuota sugerida / TAE en vivo.
  const [balance, setBalance] = useState<string>(item?.balance != null ? String(item.balance) : "");
  const [apr, setApr] = useState<string>(item?.apr != null ? String(item.apr) : "");
  const [rateIndex, setRateIndex] = useState<string>(item?.rateIndex ?? "prime");
  const [rateSpread, setRateSpread] = useState<string>(item?.rateSpread != null ? String(item.rateSpread) : "");
  const [introMonths, setIntroMonths] = useState<string>(item?.introFixedMonths != null ? String(item.introFixedMonths) : "");
  const [introApr, setIntroApr] = useState<string>(item?.introApr != null ? String(item.introApr) : "");
  const [termYears, setTermYears] = useState<string>(totalTerm ? String(Math.floor(totalTerm / 12)) : "");
  const [termMonths, setTermMonths] = useState<string>(totalTerm % 12 ? String(totalTerm % 12) : "");
  const [currentPayment, setCurrentPayment] = useState<string>(item?.currentPayment != null ? String(item.currentPayment) : "");

  // Valor actual del índice y TAE efectiva en vivo (Punto 1.4).
  const idxVal = rateType === "variable" ? indexRates?.[rateIndex] : undefined;
  const effectiveTae = idxVal != null ? idxVal + (Number(rateSpread) || 0) : null;

  // Cuota sugerida con la fórmula de amortización (Punto 1.2).
  const termTotal = (Number(termYears) || 0) * 12 + (Number(termMonths) || 0);
  const rateForCalc = rateType === "variable" ? (effectiveTae ?? (Number(apr) || 0)) : (Number(apr) || 0);
  const bal = Number(balance) || 0;
  const suggested =
    bal > 0 && termTotal > 0 && rateForCalc >= 0 ? pmt(bal, rateForCalc / 100 / 12, termTotal) : 0;
  const sym = { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[currency] ?? "";

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const term = (Number(termYears) || 0) * 12 + (Number(termMonths) || 0);
    run(
      {
        name: String(fd.get("name") ?? ""),
        debtType: String(fd.get("debtType") ?? "otro"),
        bank: String(fd.get("bank") ?? "") || undefined,
        originalAmount: fd.get("originalAmount") ? Number(fd.get("originalAmount")) : undefined,
        balance: Number(balance) || 0,
        currency: String(fd.get("currency") ?? currency),
        rateType,
        rateIndex: rateType === "variable" ? rateIndex : undefined,
        rateSpread: rateType === "variable" && rateSpread ? Number(rateSpread) : undefined,
        introFixedMonths: rateType === "variable" && introMonths ? Number(introMonths) : undefined,
        introApr: rateType === "variable" && introApr ? Number(introApr) : undefined,
        apr: apr ? Number(apr) : undefined,
        termMonths: term > 0 ? term : undefined,
        startDate: String(fd.get("startDate") ?? "") || undefined,
        minPayment: Number(fd.get("minPayment") ?? 0),
        currentPayment: Number(currentPayment) || 0,
        extraMonthly: fd.get("extraMonthly") ? Number(fd.get("extraMonthly")) : undefined,
        insurance: fd.get("insurance") ? Number(fd.get("insurance")) : undefined,
        delinquency: String(fd.get("delinquency") ?? "no"),
        stress: Number(fd.get("stress") ?? 5),
        notes: String(fd.get("notes") ?? "") || undefined,
      },
      onDone,
      form,
    );
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? (
          <div className="auth-msg warn" role="alert">
            {message}
          </div>
        ) : null}
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Nombre de la deuda</label>
            <input className="inp" name="name" defaultValue={item?.name ?? ""} placeholder="Tarjeta, préstamo…" required aria-invalid={errors.name ? true : undefined} />
            {errors.name ? <span className="auth-err" role="alert">{errors.name}</span> : null}
          </div>
          <div className="fld">
            <label className="fld-label">Banco (opcional)</label>
            <input className="inp" name="bank" defaultValue={item?.bank ?? ""} maxLength={80} placeholder="BAC, BCR, Scotiabank…" />
          </div>
        </div>

        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Categoría</label>
            <select className="sel" name="debtType" defaultValue={item?.debtType ?? "tarjeta"}>
              {DEBT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Moneda</label>
            <select className="sel" name="currency" defaultValue={item?.currency ?? currency}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="fld-2">
          <Money label="Monto original" name="originalAmount" currency={currency} defaultValue={item?.originalAmount ?? undefined} />
          <Money label="Saldo actual" name="balance" currency={currency} error={errors.balance} value={balance} onChange={setBalance} />
        </div>

        {/* Tasa: fija o variable */}
        <div className="fld">
          <label className="fld-label">Tipo de tasa</label>
          <div className="seg" role="group" aria-label="Tipo de tasa">
            <button type="button" className={`seg-btn${rateType === "fija" ? " on" : ""}`} onClick={() => setRateType("fija")}>Manual (fija)</button>
            <button type="button" className={`seg-btn${rateType === "variable" ? " on" : ""}`} onClick={() => setRateType("variable")}>Variable (índice)</button>
          </div>
        </div>

        {rateType === "variable" ? (
          <>
            <div className="fld-2">
              <div className="fld">
                <label className="fld-label">Índice de referencia</label>
                <select className="sel" name="rateIndex" value={rateIndex} onChange={(e) => setRateIndex(e.target.value)}>
                  <option value="prime">Prime (EE. UU.)</option>
                  <option value="tbp">TBP (Costa Rica)</option>
                  <option value="tri">TRI (Costa Rica)</option>
                </select>
              </div>
              <div className="fld">
                <label className="fld-label">Margen / piso (%)</label>
                <input className="inp" name="rateSpread" type="number" step="0.1" min="0" value={rateSpread} onChange={(e) => setRateSpread(e.target.value)} placeholder="Ej. 3" />
              </div>
            </div>
            {effectiveTae != null ? (
              <div className="auth-msg" style={{ margin: "0 0 14px", fontSize: 12.5 }}>
                {rateIndex.toUpperCase()} {idxVal!.toFixed(2)}% + {Number(rateSpread) || 0}% ={" "}
                <strong>TAE efectiva {effectiveTae.toFixed(2)}%</strong>
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 11.5, margin: "0 0 14px" }}>
                Sin valor del índice todavía; ingresa la TAE efectiva manualmente abajo.
              </div>
            )}
            {/* Tasa introductoria fija → luego variable (Punto 1.3) */}
            <div className="fld-2">
              <div className="fld">
                <label className="fld-label">Meses a tasa fija inicial (opcional)</label>
                <input className="inp" type="number" min="0" value={introMonths} onChange={(e) => setIntroMonths(e.target.value)} placeholder="Ej. 36" />
              </div>
              <div className="fld">
                <label className="fld-label">TAE fija inicial (%) (opcional)</label>
                <input className="inp" type="number" step="0.1" min="0" value={introApr} onChange={(e) => setIntroApr(e.target.value)} placeholder="Ej. 6.5" />
              </div>
            </div>
          </>
        ) : null}

        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">{rateType === "variable" ? "TAE efectiva actual (%)" : "Tasa anual (%)"}</label>
            <input className="inp" name="apr" type="number" step="0.1" min="0" value={apr} onChange={(e) => setApr(e.target.value)} placeholder="Ej. 38" />
          </div>
          <div className="fld">
            <label className="fld-label">Fecha de inicio</label>
            <input className="inp" name="startDate" type="date" defaultValue={item?.startDate ?? ""} />
          </div>
        </div>

        {/* Plazo en años + meses */}
        <div className="fld">
          <label className="fld-label">Plazo total</label>
          <div className="fld-2">
            <div className="inp-money">
              <input name="termYears" type="number" min="0" value={termYears} onChange={(e) => setTermYears(e.target.value)} placeholder="0" />
              <span className="pre" style={{ left: "auto", right: 12 }}>años</span>
            </div>
            <div className="inp-money">
              <input name="termMonths" type="number" min="0" max="11" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} placeholder="0" />
              <span className="pre" style={{ left: "auto", right: 12 }}>meses</span>
            </div>
          </div>
        </div>

        <div className="fld-2">
          <Money label="Cuota mensual" name="currentPayment" currency={currency} value={currentPayment} onChange={setCurrentPayment} />
          <Money label="Pago mínimo" name="minPayment" currency={currency} defaultValue={item?.minPayment} />
        </div>

        {suggested > 0 ? (
          <div className="row" style={{ gap: 10, flexWrap: "wrap", margin: "-4px 0 14px", fontSize: 12.5 }}>
            <span className="muted">
              Cuota sugerida: <strong style={{ color: "var(--ink-2)" }}>{sym}{Math.round(suggested).toLocaleString("es-CR")}</strong>
            </span>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 11px", fontSize: 12 }} onClick={() => setCurrentPayment(String(Math.round(suggested)))}>
              Usar
            </button>
          </div>
        ) : null}

        <div className="fld-2">
          <Money label="Pago extra mensual (opcional)" name="extraMonthly" currency={currency} defaultValue={item?.extraMonthly ?? undefined} />
          <Money label="Seguro mensual (opcional)" name="insurance" currency={currency} defaultValue={item?.insurance ?? undefined} />
        </div>

        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">¿Atraso?</label>
            <select className="sel" name="delinquency" defaultValue={item?.delinquency ?? "no"}>
              <option value="no">Al día</option>
              <option value="1_30">1 a 30 días</option>
              <option value="31_60">31 a 60 días</option>
              <option value="60_mas">Más de 60 días</option>
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Nivel de estrés (1-10)</label>
            <input className="inp" name="stress" type="number" min="1" max="10" defaultValue={item?.stress ?? 5} />
          </div>
        </div>

        <div className="fld">
          <label className="fld-label">Notas (opcional)</label>
          <textarea className="inp" name="notes" rows={2} defaultValue={item?.notes ?? ""} placeholder="Banco, condiciones, recordatorios…" />
        </div>
      </div>
      <Foot pending={pending} onCancel={onCancel} />
    </form>
  );
}

function Money({
  label,
  name,
  currency,
  error,
  defaultValue,
  value,
  onChange,
}: {
  label: string;
  name: string;
  currency: string;
  error?: string;
  defaultValue?: number;
  /** Modo controlado (para cálculo en vivo); si se omite, usa defaultValue. */
  value?: string;
  onChange?: (v: string) => void;
}) {
  const sym = { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[currency] ?? "";
  const controlled = value !== undefined && onChange !== undefined;
  return (
    <div className="fld">
      <label className="fld-label">{label}</label>
      <div className="inp-money">
        <span className="pre">{sym}</span>
        <input
          name={name}
          type="number"
          step="0.01"
          min="0"
          placeholder="0"
          aria-invalid={error ? true : undefined}
          {...(controlled
            ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) }
            : { defaultValue })}
        />
      </div>
      {error ? (
        <span className="auth-err" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function Foot({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="modal-foot">
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancelar
      </button>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}
