"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { focusFirstError } from "@/lib/forms";
import { convertCurrency, FX_PER_USD } from "@/lib/fx";
import { formatMoney } from "@/lib/format";
import { useDeepLinkModal } from "@/lib/hooks/use-deep-link-modal";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import {
  addGoalAction,
  addDebtAction,
  addDefensePolicyAction,
  editGoalAction,
  editDebtAction,
  listExpenseCategoriesAction,
  createSobreCategoryAction,
  type ExpenseCategoryGroup,
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
  fxRates,
  deepLinkKey,
}: {
  kind: Kind;
  currency: string;
  label?: string;
  variant?: "btn-primary" | "btn-secondary";
  indexRates?: Record<string, number>;
  fxRates?: Record<string, number>;
  deepLinkKey?: string;
}) {
  const [open, setOpen] = useState(false);
  useDeepLinkModal(deepLinkKey, () => setOpen(true));
  return (
    <>
      <button className={`btn ${variant}`} onClick={() => setOpen(true)}>
        <Icon name={kind === "goal" ? "savings" : "debt"} width={2} />{" "}
        {label ?? (kind === "goal" ? "Agregar objetivo" : "Agregar deuda")}
      </button>
      {open ? (
        <ControlDialog
          kind={kind}
          currency={currency}
          indexRates={indexRates}
          fxRates={fxRates}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function ControlActions({
  currency = "CRC",
  fxRates,
}: {
  currency?: string;
  /** Aceptado por compatibilidad con la página; las deudas viven en /deudas. */
  indexRates?: Record<string, number>;
  /** Tasas en vivo para mostrar el equivalente al capturar en otra moneda. */
  fxRates?: Record<string, number>;
}) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <AddControlButton kind="goal" currency={currency} fxRates={fxRates} variant="btn-primary" />
    </div>
  );
}

/** Botón de editar (objetivo / deuda). */
export function EditControlButton({
  kind,
  item,
  currency,
  indexRates,
  fxRates,
}: {
  kind: Kind;
  item: SavingsGoal | Debt;
  currency: string;
  indexRates?: Record<string, number>;
  fxRates?: Record<string, number>;
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
        <ControlDialog
          kind={kind}
          currency={currency}
          item={item}
          indexRates={indexRates}
          fxRates={fxRates}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function ControlDialog({
  kind,
  currency,
  item,
  indexRates,
  fxRates,
  onClose,
}: {
  kind: Kind;
  currency: string;
  item?: SavingsGoal | Debt;
  indexRates?: Record<string, number>;
  fxRates?: Record<string, number>;
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
        <GoalForm
          currency={currency}
          onDone={done}
          onCancel={onClose}
          item={item as SavingsGoal | undefined}
          fxRates={fxRates}
        />
      ) : (
        <DebtForm
          currency={currency}
          onDone={done}
          onCancel={onClose}
          item={item as Debt | undefined}
          indexRates={indexRates}
          fxRates={fxRates}
        />
      )}
    </Modal>
  );
}

function useFormSubmit(
  action: (
    raw: unknown,
  ) => Promise<{ ok: boolean; fieldErrors?: Record<string, string>; message?: string }>,
) {
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

function GoalForm({
  currency,
  onDone,
  onCancel,
  item,
  fxRates,
}: {
  currency: string;
  onDone: () => void;
  onCancel: () => void;
  item?: SavingsGoal;
  fxRates?: Record<string, number>;
}) {
  // Modo Defensa: si se activa, el ahorro se convierte en una protección. Los
  // dos FONDOS crean un savings_goal etiquetado (goal_type=defensa:*); los dos
  // SEGUROS crean una insurance_policy vía addPolicyAction (reutilizada).
  // Tipo de ahorro: Meta (con objetivo) / Defensa (protección) / Sobre (acumulador).
  const initialMode: "meta" | "defensa" | "sobre" = (item?.goalType ?? "").startsWith("defensa:")
    ? "defensa"
    : item?.kind === "sobre"
      ? "sobre"
      : "meta";
  const [mode, setMode] = useState<"meta" | "defensa" | "sobre">(initialMode);
  const isDefense = mode === "defensa";
  const isSobre = mode === "sobre";
  const [defenseKind, setDefenseKind] = useState<string>(
    (item?.goalType ?? "").startsWith("defensa:") ? item!.goalType! : "defensa:fondo_emergencia",
  );
  const isSeguro = isDefense && defenseKind.startsWith("seguro:");

  // La acción se elige al vuelo: en modo seguro creamos una póliza, si no un goal.
  const action = (raw: unknown) =>
    isSeguro
      ? addDefensePolicyAction(raw)
      : item
        ? editGoalAction(item.id, raw)
        : addGoalAction(raw);
  const { pending, errors, message, run } = useFormSubmit(action);
  const [cur, setCur] = useState<string>(item?.currency ?? currency);
  // Controlado para poder mostrar el equivalente en vivo (Punto FX).
  const [targetAmount, setTargetAmount] = useState<string>(
    item?.targetAmount != null ? String(item.targetAmount) : "",
  );
  // Recurrencia (frascos que se reinician por período). Controlada: cambia la
  // etiqueta del monto ("Monto por período") y se envía en onSubmit.
  const [recurrence, setRecurrence] = useState<string>(item?.recurrence ?? "ninguna");
  const isRecurring = recurrence !== "ninguna";
  // Categoría por defecto del frasco: se precarga al gastar. Se cargan las
  // categorías de gasto de forma perezosa (mismo action que el modal Gastar).
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>(item?.defaultCategoryId ?? "");
  const [catGroups, setCatGroups] = useState<ExpenseCategoryGroup[]>([]);
  useEffect(() => {
    let alive = true;
    void listExpenseCategoriesAction().then((groups) => {
      if (alive) setCatGroups(groups);
    });
    return () => {
      alive = false;
    };
  }, []);
  // Crear un frasco (categoría) nuevo desde el sobre, sin salir del form.
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatPending, setNewCatPending] = useState(false);
  // Categorías creadas al vuelo (optimista, hasta que refresque la lista).
  const [extraCats, setExtraCats] = useState<{ id: string; name: string }[]>([]);

  async function createInlineCategory() {
    const n = newCatName.trim();
    if (!n) return;
    setNewCatPending(true);
    const res = await createSobreCategoryAction({ name: n });
    setNewCatPending(false);
    if (res.ok && res.id) {
      setExtraCats((prev) => [...prev, { id: res.id!, name: n }]);
      setDefaultCategoryId(res.id);
      setNewCatOpen(false);
      setNewCatName("");
    }
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (isSeguro) {
      run(
        {
          policyType: defenseKind === "seguro:vida" ? "vida" : "gastos_mayores",
          provider: String(fd.get("provider") ?? "") || undefined,
          coverage: Number(fd.get("coverage") ?? 0) || undefined,
          premium: Number(fd.get("premium") ?? 0) || undefined,
          premiumFrequency: String(fd.get("premiumFrequency") ?? "mensual"),
          currency: cur,
        },
        onDone,
        form,
      );
      return;
    }
    // Fondo (o Defensa OFF): si es fondo y el nombre está vacío, lo prefijamos
    // con el nombre de la protección (sin sobreescribir lo que el usuario puso).
    let name = String(fd.get("name") ?? "").trim();
    if (isDefense && !name) {
      name = defenseKind === "defensa:fondo_paz" ? "Fondo de paz" : "Fondo de emergencia";
    }
    run(
      {
        name,
        currentAmount: Number(fd.get("currentAmount") ?? 0),
        monthlyContribution: Number(fd.get("monthlyContribution") ?? 0),
        currency: cur,
        targetDate: isSobre ? undefined : String(fd.get("targetDate") ?? "") || undefined,
        priority: String(fd.get("priority") ?? "media"),
        goalType: isDefense ? defenseKind : undefined,
        // Sobre: acumulador puro (sin meta, sin recurrencia). La CATEGORÍA es
        // cosa del sobre; Meta/Defensa son ahorro puro sin categoría.
        kind: isSobre ? "sobre" : "meta",
        targetAmount: isSobre ? null : Number(targetAmount) || 0,
        recurrence: isSobre ? "ninguna" : recurrence,
        // En un frasco recurrente el "Monto por período" ES el plan pleno.
        periodAmount: !isSobre && isRecurring ? Number(targetAmount) || 0 : undefined,
        defaultCategoryId: isSobre ? defaultCategoryId || null : null,
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

        {/* Toggle tipo de ahorro: Meta / Defensa / Sobre. */}
        <div className="fld">
          <label
            className="fld-label"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            Tipo de ahorro
            <span
              className="tip tip-wrap"
              data-tip="Meta: ahorro con objetivo. Defensa: una protección (fondo o seguro). Sobre: acumulador sin meta (le metés y sacás plata; ideal para gastos periódicos)."
              aria-label="Qué tipo de ahorro elegir"
              style={{ display: "inline-flex", cursor: "help" }}
            >
              <Icon name="info" />
            </span>
          </label>
          <div className="seg" role="group" aria-label="Tipo de ahorro">
            <button
              type="button"
              className={`seg-btn${mode === "meta" ? " on" : ""}`}
              onClick={() => setMode("meta")}
            >
              Meta
            </button>
            <button
              type="button"
              className={`seg-btn${isDefense ? " on" : ""}`}
              onClick={() => setMode("defensa")}
            >
              Defensa
            </button>
            <button
              type="button"
              className={`seg-btn${isSobre ? " on" : ""}`}
              onClick={() => setMode("sobre")}
            >
              Sobre
            </button>
          </div>
        </div>

        {isDefense ? (
          <div className="fld">
            <label className="fld-label">Protección</label>
            <select
              className="sel"
              value={defenseKind}
              onChange={(e) => setDefenseKind(e.target.value)}
            >
              <option value="defensa:fondo_emergencia">Fondo de emergencia</option>
              <option value="defensa:fondo_paz">Fondo de paz</option>
              <option value="seguro:gastos_mayores">Seguro de gastos mayores</option>
              <option value="seguro:vida">Seguro de vida</option>
            </select>
          </div>
        ) : null}

        {/* Nombre: obligatorio para un ahorro normal; opcional para un fondo de
            defensa (se prefija solo); oculto para un seguro (la póliza no lo usa). */}
        {!isSeguro ? (
          <div className="fld">
            <label className="fld-label">
              {isDefense ? "Nombre del objetivo (opcional)" : "Nombre del objetivo"}
            </label>
            <input
              className="inp"
              name="name"
              defaultValue={item?.name ?? ""}
              placeholder={
                isDefense
                  ? defenseKind === "defensa:fondo_paz"
                    ? "Fondo de paz"
                    : "Fondo de emergencia"
                  : "Fondo de emergencia, viaje…"
              }
              required={!isDefense}
              aria-invalid={errors.name ? true : undefined}
            />
            {errors.name ? (
              <span className="auth-err" role="alert">
                {errors.name}
              </span>
            ) : null}
          </div>
        ) : null}

        {isSeguro ? (
          <>
            <div className="fld-2">
              <div className="fld">
                <label className="fld-label">Aseguradora (opcional)</label>
                <input className="inp" name="provider" maxLength={80} placeholder="Nombre" />
              </div>
              <div className="fld">
                <label className="fld-label">Frecuencia de prima</label>
                <select className="sel" name="premiumFrequency" defaultValue="mensual">
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
            </div>
            <div className="fld-2">
              <Money label="Suma asegurada" name="coverage" currency={cur} />
              <Money label="Prima" name="premium" currency={cur} />
            </div>
            <div className="fld">
              <label className="fld-label">Moneda</label>
              <select
                className="sel"
                name="currency"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div className="fld-2">
              {!isSobre ? (
                <Money
                  label={isRecurring ? "Monto por período" : "Monto meta"}
                  name="targetAmount"
                  currency={cur}
                  error={errors.targetAmount}
                  value={targetAmount}
                  onChange={setTargetAmount}
                />
              ) : null}
              <Money
                label={isSobre ? "Acumulado (aporte inicial)" : "Acumulado"}
                name="currentAmount"
                currency={cur}
                defaultValue={item?.currentAmount}
              />
            </div>
            <div className="fld-2">
              <Money
                label="Aporte mensual"
                name="monthlyContribution"
                currency={cur}
                defaultValue={item?.monthlyContribution}
              />
              {!isSobre ? (
                <div className="fld">
                  <label className="fld-label">Fecha objetivo</label>
                  <input
                    className="inp"
                    name="targetDate"
                    type="date"
                    defaultValue={item?.targetDate ?? ""}
                  />
                </div>
              ) : null}
            </div>
            <div className="fld-2">
              <div className="fld">
                <label className="fld-label">Moneda</label>
                <select
                  className="sel"
                  name="currency"
                  value={cur}
                  onChange={(e) => setCur(e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <FxEquivalent
                  amount={Number(targetAmount) || 0}
                  from={cur}
                  to={currency}
                  rates={fxRates}
                />
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
            {isSobre ? (
              <>
                <p className="muted" style={{ fontSize: 12, marginTop: -2 }}>
                  Un <strong>sobre</strong> acumula sin meta: le metés (desde Gastos) y sacás/gastás
                  (desde acá) cuando quieras. Sin objetivo ni recurrencia.
                </p>
                <div className="fld">
                  <label
                    className="fld-label"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    Categoría (frasco)
                    <span
                      className="tip tip-wrap"
                      data-tip="El frasco al que pertenece el sobre (ej.: Maquillaje → Estilo de vida). Al gastar del sobre, esta categoría viene precargada."
                      aria-label="Qué es la categoría del sobre"
                      style={{ display: "inline-flex", cursor: "help" }}
                    >
                      <Icon name="info" />
                    </span>
                  </label>
                  <select
                    className="sel"
                    value={defaultCategoryId}
                    onChange={(e) => setDefaultCategoryId(e.target.value)}
                  >
                    <option value="">Sin categoría</option>
                    {extraCats.length > 0 ? (
                      <optgroup label="Nuevas">
                        {extraCats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {catGroups.map((grp) => (
                      <optgroup key={grp.groupName} label={grp.groupName}>
                        {grp.options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {newCatOpen ? (
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <input
                        className="inp"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        placeholder="Nombre del frasco nuevo…"
                        maxLength={60}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void createInlineCategory();
                          }
                          if (e.key === "Escape") setNewCatOpen(false);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: "6px 12px" }}
                        disabled={newCatPending || !newCatName.trim()}
                        onClick={() => void createInlineCategory()}
                      >
                        {newCatPending ? "…" : "Crear"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: "4px 8px", marginTop: 6, color: "var(--muted)" }}
                      onClick={() => setNewCatOpen(true)}
                    >
                      <Icon name="plus" width={2} /> Crear frasco nuevo
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="fld-2">
                <div className="fld">
                  <label
                    className="fld-label"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    Recurrencia
                    <span
                      className="tip tip-wrap"
                      data-tip="Para gastos que se repiten (marchamo anual, ropa del año). Al terminar el período, la meta se restaura sola y lo que no gastaste se arrastra."
                      aria-label="Qué es la recurrencia de un frasco"
                      style={{ display: "inline-flex", cursor: "help" }}
                    >
                      <Icon name="info" />
                    </span>
                  </label>
                  <select
                    className="sel"
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value)}
                  >
                    <option value="ninguna">Ninguna</option>
                    <option value="mensual">Mensual</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="semestral">Semestral</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
                {isRecurring ? (
                  <div className="fld" style={{ display: "flex", alignItems: "flex-end" }}>
                    <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                      La <strong>Fecha objetivo</strong> marca el primer reinicio; si la dejas vacía,
                      se reinicia una cadencia después de hoy.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
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
  fxRates,
}: {
  currency: string;
  onDone: () => void;
  onCancel: () => void;
  item?: Debt;
  indexRates?: Record<string, number>;
  fxRates?: Record<string, number>;
}) {
  const action = item ? (raw: unknown) => editDebtAction(item.id, raw) : addDebtAction;
  const { pending, errors, message, run } = useFormSubmit(action);
  const [cur, setCur] = useState<string>(item?.currency ?? currency);
  const [rateType, setRateType] = useState<"fija" | "variable">(item?.rateType ?? "fija");

  const totalTerm = item?.termMonths ?? 0;
  // Estado controlado de los campos que alimentan la cuota sugerida / TAE en vivo.
  const [balance, setBalance] = useState<string>(item?.balance != null ? String(item.balance) : "");
  const [apr, setApr] = useState<string>(item?.apr != null ? String(item.apr) : "");
  const [rateIndex, setRateIndex] = useState<string>(item?.rateIndex ?? "prime");
  const [rateSpread, setRateSpread] = useState<string>(
    item?.rateSpread != null ? String(item.rateSpread) : "",
  );
  const [introMonths, setIntroMonths] = useState<string>(
    item?.introFixedMonths != null ? String(item.introFixedMonths) : "",
  );
  const [introApr, setIntroApr] = useState<string>(
    item?.introApr != null ? String(item.introApr) : "",
  );
  const [termYears, setTermYears] = useState<string>(
    totalTerm ? String(Math.floor(totalTerm / 12)) : "",
  );
  const [termMonths, setTermMonths] = useState<string>(
    totalTerm % 12 ? String(totalTerm % 12) : "",
  );
  const [currentPayment, setCurrentPayment] = useState<string>(
    item?.currentPayment != null ? String(item.currentPayment) : "",
  );

  // Valor actual del índice y TAE efectiva en vivo (Punto 1.4).
  const idxVal = rateType === "variable" ? indexRates?.[rateIndex] : undefined;
  const effectiveTae = idxVal != null ? idxVal + (Number(rateSpread) || 0) : null;

  // Cuota sugerida con la fórmula de amortización (Punto 1.2).
  const termTotal = (Number(termYears) || 0) * 12 + (Number(termMonths) || 0);
  const rateForCalc =
    rateType === "variable" ? (effectiveTae ?? (Number(apr) || 0)) : Number(apr) || 0;
  const bal = Number(balance) || 0;
  const suggested =
    bal > 0 && termTotal > 0 && rateForCalc >= 0 ? pmt(bal, rateForCalc / 100 / 12, termTotal) : 0;
  const sym = { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[cur] ?? "";

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
        currency: cur,
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
            <input
              className="inp"
              name="name"
              defaultValue={item?.name ?? ""}
              placeholder="Tarjeta, préstamo…"
              required
              aria-invalid={errors.name ? true : undefined}
            />
            {errors.name ? (
              <span className="auth-err" role="alert">
                {errors.name}
              </span>
            ) : null}
          </div>
          <div className="fld">
            <label className="fld-label">Banco (opcional)</label>
            <input
              className="inp"
              name="bank"
              defaultValue={item?.bank ?? ""}
              maxLength={80}
              placeholder="BAC, BCR, Scotiabank…"
            />
          </div>
        </div>

        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Categoría</label>
            <select className="sel" name="debtType" defaultValue={item?.debtType ?? "tarjeta"}>
              {DEBT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Moneda</label>
            <select
              className="sel"
              name="currency"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <FxEquivalent amount={bal} from={cur} to={currency} rates={fxRates} />
          </div>
        </div>

        <div className="fld-2">
          <Money
            label="Monto original"
            name="originalAmount"
            currency={cur}
            defaultValue={item?.originalAmount ?? undefined}
          />
          <Money
            label="Saldo actual"
            name="balance"
            currency={cur}
            error={errors.balance}
            value={balance}
            onChange={setBalance}
          />
        </div>

        {/* Tasa: fija o variable */}
        <div className="fld">
          <label className="fld-label">Tipo de tasa</label>
          <div className="seg" role="group" aria-label="Tipo de tasa">
            <button
              type="button"
              className={`seg-btn${rateType === "fija" ? " on" : ""}`}
              onClick={() => setRateType("fija")}
            >
              Manual (fija)
            </button>
            <button
              type="button"
              className={`seg-btn${rateType === "variable" ? " on" : ""}`}
              onClick={() => setRateType("variable")}
            >
              Variable (índice)
            </button>
          </div>
        </div>

        {rateType === "variable" ? (
          <>
            <div className="fld-2">
              <div className="fld">
                <label className="fld-label">Índice de referencia</label>
                <select
                  className="sel"
                  name="rateIndex"
                  value={rateIndex}
                  onChange={(e) => setRateIndex(e.target.value)}
                >
                  <option value="prime">Prime (EE. UU.)</option>
                  <option value="tbp">TBP (Costa Rica)</option>
                  <option value="tri">TRI (Costa Rica)</option>
                </select>
              </div>
              <div className="fld">
                <label className="fld-label">Margen / piso (%)</label>
                <input
                  className="inp"
                  name="rateSpread"
                  type="number"
                  step="0.1"
                  min="0"
                  value={rateSpread}
                  onChange={(e) => setRateSpread(e.target.value)}
                  placeholder="Ej. 3"
                />
              </div>
            </div>
            {effectiveTae != null ? (
              <div className="auth-msg" style={{ margin: "0 0 14px", fontSize: 12.5 }}>
                {rateIndex.toUpperCase()} {idxVal!.toFixed(2)}% + {Number(rateSpread) || 0}% ={" "}
                <strong>Tasa Anual Equivalente efectiva {effectiveTae.toFixed(2)}%</strong>
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 11.5, margin: "0 0 14px" }}>
                Sin valor del índice todavía; ingresa la Tasa Anual Equivalente efectiva manualmente
                abajo.
              </div>
            )}
            {/* Tasa introductoria fija → luego variable (Punto 1.3) */}
            <div className="fld-2">
              <div className="fld">
                <label className="fld-label">Meses a tasa fija inicial (opcional)</label>
                <input
                  className="inp"
                  type="number"
                  min="0"
                  value={introMonths}
                  onChange={(e) => setIntroMonths(e.target.value)}
                  placeholder="Ej. 36"
                />
              </div>
              <div className="fld">
                <label className="fld-label">Tasa Anual Equivalente fija inicial (%) (opcional)</label>
                <input
                  className="inp"
                  type="number"
                  step="0.1"
                  min="0"
                  value={introApr}
                  onChange={(e) => setIntroApr(e.target.value)}
                  placeholder="Ej. 6.5"
                />
              </div>
            </div>
          </>
        ) : null}

        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">
              {rateType === "variable" ? "Tasa Anual Equivalente efectiva actual (%)" : "Tasa anual (%)"}
            </label>
            <input
              className="inp"
              name="apr"
              type="number"
              step="0.1"
              min="0"
              value={apr}
              onChange={(e) => setApr(e.target.value)}
              placeholder="Ej. 38"
            />
          </div>
          <div className="fld">
            <label className="fld-label">Fecha de inicio</label>
            <input
              className="inp"
              name="startDate"
              type="date"
              defaultValue={item?.startDate ?? ""}
            />
          </div>
        </div>

        {/* Plazo en años + meses */}
        <div className="fld">
          <label className="fld-label">Plazo total</label>
          <div className="fld-2">
            <div className="inp-money">
              <input
                name="termYears"
                type="number"
                min="0"
                value={termYears}
                onChange={(e) => setTermYears(e.target.value)}
                placeholder="0"
              />
              <span className="pre" style={{ left: "auto", right: 12 }}>
                años
              </span>
            </div>
            <div className="inp-money">
              <input
                name="termMonths"
                type="number"
                min="0"
                max="11"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
                placeholder="0"
              />
              <span className="pre" style={{ left: "auto", right: 12 }}>
                meses
              </span>
            </div>
          </div>
        </div>

        <div className="fld-2">
          <Money
            label="Cuota mensual"
            name="currentPayment"
            currency={cur}
            value={currentPayment}
            onChange={setCurrentPayment}
          />
          <Money
            label="Pago mínimo"
            name="minPayment"
            currency={cur}
            defaultValue={item?.minPayment}
          />
        </div>

        {suggested > 0 ? (
          <div
            className="row"
            style={{ gap: 10, flexWrap: "wrap", margin: "-4px 0 14px", fontSize: 12.5 }}
          >
            <span className="muted">
              Cuota sugerida:{" "}
              <strong style={{ color: "var(--ink-2)" }}>
                {sym}
                {Math.round(suggested).toLocaleString("es-CR")}
              </strong>
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "5px 11px", fontSize: 12 }}
              onClick={() => setCurrentPayment(String(Math.round(suggested)))}
            >
              Usar
            </button>
          </div>
        ) : null}

        <div className="fld-2">
          <Money
            label="Pago extra mensual (opcional)"
            name="extraMonthly"
            currency={cur}
            defaultValue={item?.extraMonthly ?? undefined}
          />
          <Money
            label="Seguro mensual (opcional)"
            name="insurance"
            currency={cur}
            defaultValue={item?.insurance ?? undefined}
          />
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
            <input
              className="inp"
              name="stress"
              type="number"
              min="1"
              max="10"
              defaultValue={item?.stress ?? 5}
            />
          </div>
        </div>

        <div className="fld">
          <label className="fld-label">Notas (opcional)</label>
          <textarea
            className="inp"
            name="notes"
            rows={2}
            defaultValue={item?.notes ?? ""}
            placeholder="Banco, condiciones, recordatorios…"
          />
        </div>
      </div>
      <Foot pending={pending} onCancel={onCancel} />
    </form>
  );
}

/**
 * Muestra el equivalente convertido cuando el monto se captura en una moneda
 * distinta a la base del usuario. Los montos se guardan en su moneda original;
 * la conversión es solo para agregados. Usa tasas en vivo si el caller las pasa;
 * si no, el respaldo estático FX_PER_USD.
 */
function FxEquivalent({
  amount,
  from,
  to,
  rates,
}: {
  amount: number;
  from: string;
  to: string;
  rates?: Record<string, number>;
}) {
  if (from === to || !(amount > 0)) return null;
  const table = rates ?? FX_PER_USD;
  const eq = convertCurrency(amount, from, to, table);
  const perUsd = Math.round(table.CRC ?? FX_PER_USD.CRC ?? 510);
  return (
    <div
      className="muted"
      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, marginTop: 6 }}
    >
      <span>
        ≈ {formatMoney(eq, to)} {to}
      </span>
      <span
        className="tip tip-wrap"
        data-tip={`Tasa aproximada (1 USD = ₡${perUsd}…). Los montos se guardan en su moneda; la conversión es solo para agregados.`}
        aria-label="Cómo se calcula el equivalente"
        style={{ display: "inline-flex", cursor: "help" }}
      >
        <Icon name="info" />
      </span>
    </div>
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
            ? {
                value,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
              }
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
