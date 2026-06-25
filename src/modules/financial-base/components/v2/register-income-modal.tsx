"use client";

/**
 * Registro simplificado de una FUENTE de ingreso (tab Ingresos).
 * Campos: Nombre · Moneda/Monto · Fecha · Categoría (tipo + subcategoría) ·
 * Recurrente · Frecuencia. La subcategoría son las hojas del grupo del tipo
 * (activo/pasivo/extraordinario); "Otro" crea una nueva bajo ese grupo. Si bajo
 * Pasivo se elige "Alquileres" o "Dividendos", se dispara el sub-popup de stub
 * de inversión (camino único; sin el viejo <select> de subtype).
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
  addCategoryAction,
  editCategoryAction,
} from "@/modules/financial-base/api/v2-actions";
import type { BudgetItem, IncomeType } from "@/modules/financial-base/types";
import type { CategoryNode, Category } from "@/modules/financial-base/services/categories-service";

type PassiveSubtype = "" | "renta" | "dividendos";

const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  extraordinario: "Extraordinario",
};

// Tipo → key del grupo de sistema (migración 20260615000004).
const GROUP_KEY_BY_TYPE: Record<IncomeType, string> = {
  activo: "inc_activo",
  pasivo: "inc_pasivo",
  extraordinario: "inc_extra",
};

const FREQUENCIES: { value: string; label: string }[] = [
  { value: "semanal", label: "Semanal" },
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual", label: "Mensual" },
  { value: "bimensual", label: "Cada 2 meses" },
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

type Leaf = Pick<Category, "id" | "name" | "parentId" | "isSystem">;

export function RegisterIncomeModal({
  currency,
  incomeTree,
  item,
  onClose,
}: {
  currency: string;
  incomeTree: CategoryNode[];
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
  const [incomeType, setIncomeTypeRaw] = useState<IncomeType>(item?.incomeType ?? "activo");
  const [categoryId, setCategoryId] = useState<string>(item?.categoryId ?? "");
  const [recurrent, setRecurrent] = useState(Boolean(item?.recurringItemId));
  const [frequency, setFrequency] = useState<string>(item?.frequency ?? "mensual");
  // Subcategorías creadas en esta sesión (se ven al instante; router.refresh las persiste).
  const [extraLeaves, setExtraLeaves] = useState<Leaf[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [stubStep, setStubStep] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [baseValue, setBaseValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currencyOptions = Array.from(new Set([curr, ...Object.keys(CURRENCY_SYMBOL)]));

  // Hojas del grupo del tipo seleccionado (sistema + creadas en sesión).
  const incomeRoot = incomeTree.find((r) => r.key === "g_ingresos") ?? incomeTree[0];
  const group = incomeRoot?.children.find((c) => c.key === GROUP_KEY_BY_TYPE[incomeType]);
  const groupId = group?.id ?? null;
  const leaves: Leaf[] = groupId
    ? [
        ...(incomeRoot?.children.filter((c) => c.parentId === groupId) ?? []),
        ...extraLeaves.filter((l) => l.parentId === groupId),
      ]
    : [];
  const selectedLeaf = leaves.find((l) => l.id === categoryId) ?? null;

  // Camino único de inversión: elegir Alquileres/Dividendos bajo Pasivo dispara el stub.
  const subtype: PassiveSubtype =
    incomeType === "pasivo" && selectedLeaf
      ? selectedLeaf.name === "Alquileres"
        ? "renta"
        : selectedLeaf.name === "Dividendos"
          ? "dividendos"
          : ""
      : "";
  const needsStub = !editing && subtype !== "";

  const setIncomeType = (t: IncomeType) => {
    setIncomeTypeRaw(t);
    setCategoryId(""); // las subcategorías cambian con el tipo
    setCreating(false);
    setRenaming(false);
  };

  const incomePayload = () => ({
    name: name.trim(),
    amount: Number(amount),
    currency: curr,
    occurredOn: date,
    incomeType,
    recurrent,
    frequency: recurrent ? frequency : "mensual",
    categoryId: categoryId || null,
  });

  const finish = (res: { ok: boolean; message?: string }, okMsg: string) => {
    setPending(false);
    if (res.ok) {
      toast(okMsg);
      onClose();
      router.refresh();
    } else setError(res.message ?? "No pudimos guardar.");
  };

  const onCreateSub = async () => {
    if (!newName.trim() || !groupId) return;
    setError(null);
    const res = await addCategoryAction({
      name: newName.trim(),
      parentId: groupId,
      categoryType: "income",
    });
    if (res.ok && res.id) {
      setExtraLeaves((prev) => [
        ...prev,
        { id: res.id!, name: newName.trim(), parentId: groupId, isSystem: false },
      ]);
      setCategoryId(res.id);
      setCreating(false);
      setNewName("");
      router.refresh();
    } else setError(res.message ?? "No pudimos crear la subcategoría.");
  };

  const onRenameSub = async () => {
    if (!renameName.trim() || !categoryId) return;
    setError(null);
    const res = await editCategoryAction(categoryId, { name: renameName.trim() });
    if (res.ok) {
      setExtraLeaves((prev) =>
        prev.map((l) => (l.id === categoryId ? { ...l, name: renameName.trim() } : l)),
      );
      setRenaming(false);
      router.refresh();
    } else setError(res.message ?? "No pudimos renombrar.");
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
      subtype: subtype === "renta" ? "renta" : "dividendos",
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

          <div className="fld">
            <label className="fld-label">Subcategoría</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {leaves.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={categoryId === l.id ? "seg-btn on" : "seg-btn"}
                  style={{ borderRadius: 999 }}
                  onClick={() => {
                    setCategoryId(l.id);
                    setRenaming(false);
                  }}
                >
                  {l.name}
                </button>
              ))}
              <button
                type="button"
                className="seg-btn"
                style={{ borderRadius: 999 }}
                onClick={() => {
                  setCreating(true);
                  setNewName("");
                }}
              >
                + Otro
              </button>
            </div>

            {creating ? (
              <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
                <input
                  autoFocus
                  className="inp"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombra la subcategoría…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void onCreateSub();
                    }
                  }}
                />
                <button type="button" className="btn btn-secondary" style={{ padding: "7px 12px" }} onClick={() => void onCreateSub()}>
                  Crear
                </button>
                <button type="button" className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Cancelar" onClick={() => setCreating(false)}>
                  <Icon name="x" width={2} />
                </button>
              </div>
            ) : null}

            {/* Renombrar solo subcategorías propias (no de sistema). */}
            {selectedLeaf && !selectedLeaf.isSystem ? (
              renaming ? (
                <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
                  <input
                    autoFocus
                    className="inp"
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void onRenameSub();
                      }
                    }}
                  />
                  <button type="button" className="btn btn-secondary" style={{ padding: "7px 12px" }} onClick={() => void onRenameSub()}>
                    Guardar
                  </button>
                  <button type="button" className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Cancelar" onClick={() => setRenaming(false)}>
                    <Icon name="x" width={2} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ alignSelf: "flex-start", padding: "4px 0", marginTop: 6, color: "var(--info)" }}
                  onClick={() => {
                    setRenameName(selectedLeaf.name);
                    setRenaming(true);
                  }}
                >
                  Renombrar “{selectedLeaf.name}”
                </button>
              )
            ) : null}

            {subtype !== "" ? (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                Crearás una inversión vinculada que podrás completar luego en Patrimonio.
              </div>
            ) : null}
          </div>

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
