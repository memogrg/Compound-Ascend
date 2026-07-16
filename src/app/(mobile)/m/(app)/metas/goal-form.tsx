import { useEffect, useState } from "react";

import { addPolicyAction } from "@/modules/wealth/api/actions";
import {
  listExpenseCategoriesAction,
  type ExpenseCategoryGroup,
} from "@/modules/control/api/actions";

import {
  FormShell,
  TextField,
  MoneyField,
  DateField,
  Segmented,
  SheetSelect,
  CUR_OPTS,
  type ActionResult,
  type Opt,
} from "../../components/form-kit";

/**
 * Formulario de meta reutilizable por ALTA y EDICIÓN (mismo goalInputSchema), espejo de
 * Income/ExpenseForm. Agnóstico de la action (addGoalAction / editGoalAction ligada a id).
 * IMPORTANTE: arrastra `currentAmount` (no editable) para que editar NO lo resetee a 0
 * (el schema tiene default 0); el saldo se mueve solo con aportes/retiros.
 *
 * Toggle "Defensa": convierte el ahorro en una protección. Los dos FONDOS crean un
 * savings_goal etiquetado (goal_type=defensa:*) vía la `action` recibida; los dos SEGUROS
 * (gastos mayores / vida) crean una insurance_policy vía addPolicyAction (reutilizada de
 * Patrimonio, sin duplicar servicio) — el form ramifica a un FormShell de póliza.
 */

export type GoalValues = {
  name: string;
  kind?: string;
  targetAmount: number | null | undefined;
  currentAmount: number;
  monthlyContribution: number | undefined;
  currency: string;
  targetDate: string | undefined;
  priority: string;
  goalType?: string;
  recurrence?: string;
  periodAmount?: number;
  defaultCategoryId?: string | null;
};

const PRIORITY_OPTS: Opt[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

const RECUR_OPTS: Opt[] = [
  { value: "ninguna", label: "Ninguna" },
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

// Tipo de ahorro: Meta / Defensa / Sobre (acumulador).
const MODE_OPTS: Opt[] = [
  { value: "meta", label: "Meta" },
  { value: "defensa", label: "Defensa" },
  { value: "sobre", label: "Sobre" },
];

// Las 4 protecciones. Los dos primeros valores (defensa:*) crean un fondo (goal);
// los dos seguros (seguro:*) crean una póliza.
const DEFENSE_OPTS: Opt[] = [
  { value: "defensa:fondo_emergencia", label: "Fondo de emergencia" },
  { value: "defensa:fondo_paz", label: "Fondo de paz" },
  { value: "seguro:gastos_mayores", label: "Seguro de gastos mayores" },
  { value: "seguro:vida", label: "Seguro de vida" },
];

const FREQ_OPTS: Opt[] = [
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

export function GoalForm({
  initial,
  currency,
  action,
  submitLabel,
  successMessage,
  onSuccess,
}: {
  initial?: Partial<GoalValues>;
  currency: string;
  action: (raw: GoalValues) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [targetAmount, setTargetAmount] = useState<number | undefined>(
    initial?.targetAmount ?? undefined,
  );
  const [monthlyContribution, setMonthly] = useState<number | undefined>(initial?.monthlyContribution);
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "media");
  const [recurrence, setRecurrence] = useState(initial?.recurrence ?? "ninguna");
  const [cur, setCur] = useState(initial?.currency ?? currency);
  const isRecurring = recurrence !== "ninguna";
  // Categoría por defecto del frasco (se precarga al gastar). Opciones planas
  // "Grupo · Hoja" para el SheetSelect, cargadas al montar.
  const [defaultCategoryId, setDefaultCategoryId] = useState(initial?.defaultCategoryId ?? "");
  const [catOptions, setCatOptions] = useState<Opt[]>([]);
  useEffect(() => {
    let alive = true;
    void listExpenseCategoriesAction().then((groups: ExpenseCategoryGroup[]) => {
      if (!alive) return;
      const flat = groups.flatMap((g) =>
        g.options.map((o) => ({ value: o.id, label: `${g.groupName} · ${o.name}` })),
      );
      setCatOptions([{ value: "", label: "Sin categoría" }, ...flat]);
    });
    return () => {
      alive = false;
    };
  }, []);
  const initialDefense = (initial?.goalType ?? "").startsWith("defensa:");
  const [mode, setMode] = useState(
    initialDefense ? "defensa" : initial?.kind === "sobre" ? "sobre" : "meta",
  );
  const [defenseKind, setDefenseKind] = useState(
    initialDefense ? initial!.goalType! : "defensa:fondo_emergencia",
  );
  // Campos de póliza (solo se usan en modo seguro).
  const [provider, setProvider] = useState("");
  const [coverage, setCoverage] = useState<number | undefined>(undefined);
  const [premium, setPremium] = useState<number | undefined>(undefined);
  const [premiumFrequency, setPremiumFrequency] = useState("mensual");

  const isDefense = mode === "defensa";
  const isSobre = mode === "sobre";
  const isSeguro = isDefense && defenseKind.startsWith("seguro:");

  // El toggle (Normal/Defensa + selector de protección) va en ambas ramas.
  const toggle = (
    <>
      <Segmented name="mode" label="Tipo de ahorro" value={mode} onChange={setMode} options={MODE_OPTS} />
      {isDefense ? (
        <SheetSelect
          name="defenseKind"
          label="Protección"
          value={defenseKind}
          onChange={setDefenseKind}
          options={DEFENSE_OPTS}
          sheetTitle="Protección"
        />
      ) : null}
    </>
  );

  // ── Modo seguro: crea una póliza (gastos mayores / vida) ──
  if (isSeguro) {
    const policyValues = {
      policyType: defenseKind === "seguro:vida" ? "vida" : "gastos_mayores",
      provider: provider.trim() || undefined,
      coverage,
      premium,
      premiumFrequency,
      currency: cur,
    };
    return (
      <FormShell
        action={addPolicyAction}
        values={policyValues}
        submitLabel="Guardar seguro"
        successMessage="Seguro agregado"
        onSuccess={onSuccess}
      >
        {toggle}
        <TextField
          name="provider"
          label="Aseguradora (opcional)"
          value={provider}
          onChange={setProvider}
          placeholder="Nombre"
          maxLength={80}
        />
        <MoneyField name="coverage" label="Suma asegurada" value={coverage} onChange={setCoverage} currency={cur} />
        <MoneyField name="premium" label="Prima" value={premium} onChange={setPremium} currency={cur} />
        <SheetSelect
          name="premiumFrequency"
          label="Frecuencia de prima"
          value={premiumFrequency}
          onChange={setPremiumFrequency}
          options={FREQ_OPTS}
          sheetTitle="Frecuencia de prima"
        />
        <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />
      </FormShell>
    );
  }

  // ── Modo fondo (o Defensa OFF): crea/edita un savings_goal ──
  // Fondo de defensa sin nombre → se prefija (sin pisar lo que el usuario puso).
  const effectiveName =
    isDefense && !name.trim()
      ? defenseKind === "defensa:fondo_paz"
        ? "Fondo de paz"
        : "Fondo de emergencia"
      : name;

  const values: GoalValues = {
    name: effectiveName,
    // Un sobre es acumulador puro: sin meta, sin recurrencia, sin categoría.
    kind: isSobre ? "sobre" : "meta",
    targetAmount: isSobre ? null : targetAmount,
    currentAmount: initial?.currentAmount ?? 0, // se preserva en edición; 0 al crear
    monthlyContribution,
    currency: cur,
    targetDate: isSobre ? undefined : targetDate === "" ? undefined : targetDate,
    priority,
    goalType: isDefense ? defenseKind : undefined,
    // Recurrencia solo en frascos "meta" (no defensa ni sobre).
    recurrence: isDefense || isSobre ? "ninguna" : recurrence,
    periodAmount: !isDefense && !isSobre && isRecurring ? targetAmount : undefined,
    defaultCategoryId: isSobre ? null : defaultCategoryId || null,
  };

  return (
    <FormShell
      action={action}
      values={values}
      submitLabel={submitLabel}
      successMessage={successMessage}
      onSuccess={onSuccess}
    >
      {toggle}
      <TextField
        name="name"
        label={isDefense ? "Nombre (opcional)" : "Nombre"}
        value={name}
        onChange={setName}
        placeholder={
          isDefense
            ? defenseKind === "defensa:fondo_paz"
              ? "Fondo de paz"
              : "Fondo de emergencia"
            : "Fondo de emergencia, viaje…"
        }
        maxLength={120}
        autoFocus
      />
      {!isSobre ? (
        <MoneyField name="targetAmount" label={isRecurring ? "Monto por período" : "Objetivo"} value={targetAmount} onChange={setTargetAmount} currency={cur} />
      ) : null}
      <MoneyField name="monthlyContribution" label="Aporte mensual" value={monthlyContribution} onChange={setMonthly} currency={cur} />
      {!isSobre ? (
        <DateField name="targetDate" label={isRecurring ? "Primer reinicio (opcional)" : "Fecha límite (opcional)"} value={targetDate} onChange={setTargetDate} />
      ) : null}
      {!isDefense && !isSobre ? (
        <SheetSelect name="recurrence" label="Recurrencia" value={recurrence} onChange={setRecurrence} options={RECUR_OPTS} sheetTitle="Recurrencia del frasco" />
      ) : null}
      {!isSobre ? (
        <SheetSelect
          name="defaultCategoryId"
          label="Categoría (opcional)"
          value={defaultCategoryId}
          onChange={setDefaultCategoryId}
          options={catOptions}
          placeholder="Sin categoría"
          sheetTitle="Categoría por defecto del frasco"
        />
      ) : null}
      <Segmented name="priority" label="Prioridad" value={priority} onChange={setPriority} options={PRIORITY_OPTS} />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />
    </FormShell>
  );
}
