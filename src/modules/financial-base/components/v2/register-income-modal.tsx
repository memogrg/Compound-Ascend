"use client";

/**
 * Registro simplificado de una FUENTE de ingreso (tab Ingresos · Fase 1).
 * Una sola pantalla, 6 campos: Nombre · Moneda/Monto · Fecha · Categoría
 * (income_type) · Recurrente · Frecuencia (solo si recurrente). Sirve para alta
 * y edición. La fuente es una línea budget_items (income); si es recurrente se
 * crea/vincula una plantilla recurring_items copy-on-demand.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CURRENCY_SYMBOL } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import {
  registerIncomeSourceAction,
  updateIncomeSourceAction,
  registerPassiveIncomeWithStubAction,
} from "@/modules/financial-base/api/v2-actions";
import type { BudgetItem, IncomeType } from "@/modules/financial-base/types";

type PassiveSubtype = "" | "renta" | "dividendos";

const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  extraordinario: "Extraordinario",
};

// Frecuencias relevantes para una fuente recurrente (subconjunto del enum Zod).
const FREQUENCIES: { value: string; label: string }[] = [
  { value: "semanal", label: "Semanal" },
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual", label: "Mensual" },
  { value: "bimensual", label: "Bimensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

const RECURRENCE_TIP =
  "Las fuentes marcadas como recurrentes son las únicas que se copian cuando traes los ingresos del mes anterior al mes actual.";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RegisterIncomeModal({
  currency,
  item,
  onClose,
}: {
  currency: string;
  item?: BudgetItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(item);

  const [name, setName] = useState(item?.name ?? "");
  const [curr, setCurr] = useState(item?.currency ?? currency);
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [date, setDate] = useState(
    item ? `${item.periodYear}-${String(item.periodMonth).padStart(2, "0")}-01` : todayISO(),
  );
  const [incomeType, setIncomeType] = useState<IncomeType>(item?.incomeType ?? "activo");
  const [recurrent, setRecurrent] = useState(Boolean(item?.recurringItemId));
  const [frequency, setFrequency] = useState<string>(item?.frequency ?? "mensual");
  // Subtipo pasivo (Fase 3): renta de bienes raíces / dividendos → stub de inversión.
  const [subtype, setSubtype] = useState<PassiveSubtype>("");
  const [stubStep, setStubStep] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [baseValue, setBaseValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currencyOptions = Array.from(new Set([curr, ...Object.keys(CURRENCY_SYMBOL)]));

  const incomePayload = () => ({
    name: name.trim(),
    amount: Number(amount),
    currency: curr,
    occurredOn: date,
    incomeType,
    recurrent,
    frequency: recurrent ? frequency : "mensual",
  });

  // Un ingreso pasivo de renta/dividendos abre el sub-popup del stub (solo al
  // crear; en edición se actualiza la fuente sin tocar la inversión vinculada).
  const needsStub = !editing && incomeType === "pasivo" && subtype !== "";

  const finish = (res: { ok: boolean; message?: string }, okMsg: string) => {
    setPending(false);
    if (res.ok) {
      toast(okMsg);
      onClose();
      router.refresh();
    } else setError(res.message ?? "No pudimos guardar.");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!name.trim()) return setError("Ponle un nombre a la fuente.");
    if (!Number.isFinite(amt) || amt < 0) return setError("Ingresa un monto válido.");
    setError(null);
    if (needsStub) {
      setAssetName((v) => v || name.trim());
      setStubStep(true);
      return;
    }
    setPending(true);
    const res = editing
      ? await updateIncomeSourceAction(item!.id, incomePayload())
      : await registerIncomeSourceAction(incomePayload());
    finish(res, editing ? "Fuente actualizada" : "Ingreso registrado");
  };

  const onSubmitStub = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(baseValue);
    if (!assetName.trim()) return setError("Completa el nombre del activo.");
    if (!Number.isFinite(value) || value < 0) return setError("Ingresa un valor válido.");
    setError(null);
    setPending(true);
    const res = await registerPassiveIncomeWithStubAction({
      income: incomePayload(),
      subtype,
      assetName: assetName.trim(),
      baseValue: value,
    });
    finish(res, "Ingreso pasivo registrado · inversión por completar");
  };

  if (stubStep) {
    const isRental = subtype === "renta";
    return (
      <Modal
        title={isRental ? "Renta de bienes raíces" : "Dividendos"}
        sub="Vinculamos este ingreso a una inversión que podrás completar luego."
        onClose={onClose}
      >
        <form onSubmit={onSubmitStub}>
          <div className="modal-body">
            {error ? (
              <div className="auth-msg warn" role="alert">
                {error}
              </div>
            ) : null}
            <div className="fld">
              <label className="fld-label">{isRental ? "Nombre del bien" : "Ticker o nombre"}</label>
              <input
                autoFocus
                className="inp"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder={isRental ? "Apartamento centro…" : "AAPL, VOO…"}
                required
              />
            </div>
            <div className="fld">
              <label className="fld-label">
                {isRental ? "Valor de la casa / inmueble" : "Monto invertido"}
              </label>
              <div className="inp-money">
                <span className="pre">{CURRENCY_SYMBOL[curr] ?? ""}</span>
                <input
                  inputMode="decimal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={baseValue}
                  onChange={(e) => setBaseValue(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setStubStep(false)}>
              ← Atrás
            </button>
            <button type="submit" className="btn btn-secondary" disabled={pending}>
              {pending ? "Guardando…" : "Guardar ingreso"}
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal
      title={editing ? "Editar fuente de ingreso" : "Registrar ingreso"}
      sub="Una fuente del periodo; confírmala con “Recibido” cuando llegue."
      onClose={onClose}
    >
      <form onSubmit={onSubmit}>
        <div className="modal-body">
          {error ? (
            <div className="auth-msg warn" role="alert">
              {error}
            </div>
          ) : null}

          <div className="fld">
            <label className="fld-label">Nombre</label>
            <input
              autoFocus
              className="inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Salario, alquiler, comisión…"
              required
            />
          </div>

          <div className="fld-2">
            <div className="fld">
              <label className="fld-label">Moneda</label>
              <select className="sel" value={curr} onChange={(e) => setCurr(e.target.value)}>
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label className="fld-label">Monto</label>
              <div className="inp-money">
                <span className="pre">{CURRENCY_SYMBOL[curr] ?? ""}</span>
                <input
                  inputMode="decimal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
            </div>
          </div>

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
            <label className="fld-label">Categoría</label>
            <div className="seg" role="radiogroup" aria-label="Tipo de ingreso">
              {(Object.keys(INCOME_TYPE_LABEL) as IncomeType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={incomeType === t}
                  className={incomeType === t ? "seg-btn on" : "seg-btn"}
                  onClick={() => setIncomeType(t)}
                >
                  {INCOME_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {incomeType === "pasivo" && !editing ? (
            <div className="fld">
              <label className="fld-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Origen del ingreso pasivo
                <span
                  className="tip tip-wrap"
                  data-tip="Renta de bienes raíces y dividendos crean una inversión vinculada que podrás completar luego en Patrimonio."
                  style={{ display: "inline-flex", color: "var(--muted)", cursor: "help" }}
                >
                  <Icon name="info" />
                </span>
              </label>
              <select
                className="sel"
                value={subtype}
                onChange={(e) => setSubtype(e.target.value as PassiveSubtype)}
              >
                <option value="">Otro ingreso pasivo</option>
                <option value="renta">Renta de bienes raíces</option>
                <option value="dividendos">Dividendos</option>
              </select>
            </div>
          ) : null}

          <div className="fld">
            <label className="fld-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Recurrencia
              <span
                className="tip tip-wrap"
                data-tip={RECURRENCE_TIP}
                aria-label={RECURRENCE_TIP}
                style={{ display: "inline-flex", color: "var(--muted)", cursor: "help" }}
              >
                <Icon name="info" />
              </span>
            </label>
            <div className="seg" role="radiogroup" aria-label="Recurrencia">
              <button
                type="button"
                role="radio"
                aria-checked={!recurrent}
                className={!recurrent ? "seg-btn on" : "seg-btn"}
                onClick={() => setRecurrent(false)}
              >
                No recurrente
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={recurrent}
                className={recurrent ? "seg-btn on" : "seg-btn"}
                onClick={() => setRecurrent(true)}
              >
                Recurrente
              </button>
            </div>
          </div>

          {recurrent ? (
            <div className="fld">
              <label className="fld-label">Frecuencia</label>
              <select
                className="sel"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-secondary" disabled={pending}>
            {pending
              ? "Guardando…"
              : needsStub
                ? "Siguiente →"
                : editing
                  ? "Guardar cambios"
                  : "Guardar ingreso"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
