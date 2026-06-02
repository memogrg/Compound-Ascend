"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import { addGoalAction, addDebtAction } from "@/modules/control/api/actions";

type Kind = "goal" | "debt" | null;

export function ControlActions({ currency = "CRC" }: { currency?: string }) {
  const [open, setOpen] = useState<Kind>(null);
  const router = useRouter();
  const close = () => setOpen(null);
  const done = () => {
    close();
    router.refresh();
  };

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => setOpen("goal")}>
          <Icon name="savings" width={2} /> Agregar objetivo
        </button>
        <button className="btn btn-secondary" onClick={() => setOpen("debt")}>
          <Icon name="debt" width={2} /> Agregar deuda
        </button>
      </div>

      {open && (
        <div className="modal-scrim open" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="modal" role="dialog">
            <div className="modal-head">
              <div>
                <div className="modal-title">
                  {open === "goal" ? "Agregar objetivo" : "Agregar deuda"}
                </div>
                <div className="modal-sub">
                  {open === "goal"
                    ? "¿Para qué estás apartando dinero?"
                    : "No es para juzgarte; es para liberarte de presión financiera."}
                </div>
              </div>
              <button className="modal-x" aria-label="Cerrar" onClick={close}>
                <Icon name="x" width={2} />
              </button>
            </div>
            {open === "goal" ? (
              <GoalForm currency={currency} onDone={done} />
            ) : (
              <DebtForm currency={currency} onDone={done} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function useFormSubmit(action: (raw: unknown) => Promise<{ ok: boolean; fieldErrors?: Record<string, string>; message?: string }>) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const run = async (payload: unknown, onOk: () => void) => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const res = await action(payload);
    setPending(false);
    if (res.ok) onOk();
    else {
      if (res.fieldErrors) setErrors(res.fieldErrors);
      if (res.message) setMessage(res.message);
    }
  };
  return { pending, errors, message, run };
}

function GoalForm({ currency, onDone }: { currency: string; onDone: () => void }) {
  const { pending, errors, message, run } = useFormSubmit(addGoalAction);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
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
    );
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? <div className="auth-msg warn">{message}</div> : null}
        <div className="fld">
          <label className="fld-label">Nombre del objetivo</label>
          <input className="inp" name="name" placeholder="Fondo de emergencia, viaje…" required />
          {errors.name ? <span className="auth-err">{errors.name}</span> : null}
        </div>
        <div className="fld-2">
          <Money label="Monto meta" name="targetAmount" currency={currency} error={errors.targetAmount} />
          <Money label="Acumulado" name="currentAmount" currency={currency} />
        </div>
        <div className="fld-2">
          <Money label="Aporte mensual" name="monthlyContribution" currency={currency} />
          <div className="fld">
            <label className="fld-label">Fecha objetivo</label>
            <input className="inp" name="targetDate" type="date" />
          </div>
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Moneda</label>
            <select className="sel" name="currency" defaultValue={currency}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Prioridad</label>
            <select className="sel" name="priority" defaultValue="media">
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>
        </div>
      </div>
      <Foot pending={pending} onCancel={onDone} />
    </form>
  );
}

function DebtForm({ currency, onDone }: { currency: string; onDone: () => void }) {
  const { pending, errors, message, run } = useFormSubmit(addDebtAction);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const aprRaw = fd.get("apr");
    run(
      {
        name: String(fd.get("name") ?? ""),
        balance: Number(fd.get("balance") ?? 0),
        minPayment: Number(fd.get("minPayment") ?? 0),
        currentPayment: Number(fd.get("currentPayment") ?? 0),
        apr: aprRaw ? Number(aprRaw) : undefined,
        currency: String(fd.get("currency") ?? currency),
        delinquency: String(fd.get("delinquency") ?? "no"),
        stress: Number(fd.get("stress") ?? 5),
      },
      onDone,
    );
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? <div className="auth-msg warn">{message}</div> : null}
        <div className="fld">
          <label className="fld-label">Nombre de la deuda</label>
          <input className="inp" name="name" placeholder="Tarjeta, préstamo…" required />
          {errors.name ? <span className="auth-err">{errors.name}</span> : null}
        </div>
        <div className="fld-2">
          <Money label="Saldo actual" name="balance" currency={currency} error={errors.balance} />
          <div className="fld">
            <label className="fld-label">Tasa anual (%)</label>
            <input className="inp" name="apr" type="number" step="0.1" min="0" placeholder="Ej. 38" />
          </div>
        </div>
        <div className="fld-2">
          <Money label="Pago mínimo" name="minPayment" currency={currency} />
          <Money label="Pago actual" name="currentPayment" currency={currency} />
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">¿Atraso?</label>
            <select className="sel" name="delinquency" defaultValue="no">
              <option value="no">Al día</option>
              <option value="1_30">1 a 30 días</option>
              <option value="31_60">31 a 60 días</option>
              <option value="60_mas">Más de 60 días</option>
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Nivel de estrés (1-10)</label>
            <input className="inp" name="stress" type="number" min="1" max="10" defaultValue={5} />
          </div>
        </div>
      </div>
      <Foot pending={pending} onCancel={onDone} />
    </form>
  );
}

function Money({
  label,
  name,
  currency,
  error,
}: {
  label: string;
  name: string;
  currency: string;
  error?: string;
}) {
  const sym = { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[currency] ?? "";
  return (
    <div className="fld">
      <label className="fld-label">{label}</label>
      <div className="inp-money">
        <span className="pre">{sym}</span>
        <input name={name} type="number" step="0.01" min="0" placeholder="0" />
      </div>
      {error ? <span className="auth-err">{error}</span> : null}
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
