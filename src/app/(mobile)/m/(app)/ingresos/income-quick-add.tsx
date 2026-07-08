"use client";

import { useState } from "react";

import { addIncomeAction } from "@/modules/financial-base/api/actions";
import { CURRENCY_OPTIONS } from "@/lib/format";

import {
  Fab,
  BottomSheet,
  FormShell,
  TextField,
  MoneyField,
  Segmented,
  SheetSelect,
  type Opt,
} from "../../components/form-kit";

/**
 * Demo end-to-end del form kit sobre una acción real: alta de ingreso en /m/ingresos.
 * FAB → BottomSheet con los campos de incomeInputSchema → addIncomeAction (misma Server
 * Action de la web) → toast + router.refresh() (aparece en la lista). NO reimplementa la
 * validación ni el guardado: FormShell solo envuelve la action y muestra fieldErrors/toast.
 */

const TYPE_OPTS: Opt[] = [
  { value: "activo", label: "Activo" },
  { value: "pasivo", label: "Pasivo" },
  { value: "extraordinario", label: "Extraordinario" },
];

const FREQ_OPTS: Opt[] = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual", label: "Mensual" },
  { value: "bimensual", label: "Bimensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "cuatrimestral", label: "Cuatrimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
  { value: "unico", label: "Único" },
  { value: "variable", label: "Variable" },
];

const CUR_OPTS: Opt[] = CURRENCY_OPTIONS.map(({ code, symbol }) => ({
  value: code,
  label: `${code} · ${symbol}`,
}));

export function IncomeQuickAdd({ currency }: { currency: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [incomeType, setIncomeType] = useState("activo");
  const [frequency, setFrequency] = useState("mensual");
  const [cur, setCur] = useState(currency);

  const openSheet = () => {
    setName("");
    setAmount(undefined);
    setIncomeType("activo");
    setFrequency("mensual");
    setCur(currency);
    setOpen(true);
  };

  // Objeto que consume la action (la revalida con incomeInputSchema; los defaults del
  // schema —isFixed/ownerScope/includeInBudget— se rellenan solos si se omiten).
  const values = { name, amount, incomeType, frequency, currency: cur };

  return (
    <>
      <Fab onClick={openSheet} label="Agregar ingreso" />
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Nuevo ingreso">
        <FormShell
          action={addIncomeAction}
          values={values}
          submitLabel="Guardar ingreso"
          successMessage="Ingreso agregado"
          onSuccess={() => setOpen(false)}
        >
          <TextField
            name="name"
            label="Nombre"
            value={name}
            onChange={setName}
            placeholder="Salario, alquiler…"
            maxLength={120}
            autoFocus
          />
          <MoneyField name="amount" label="Monto" value={amount} onChange={setAmount} currency={cur} />
          <Segmented name="incomeType" label="Tipo de ingreso" value={incomeType} onChange={setIncomeType} options={TYPE_OPTS} />
          <SheetSelect name="frequency" label="Frecuencia" value={frequency} onChange={setFrequency} options={FREQ_OPTS} sheetTitle="Frecuencia" />
          <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />
        </FormShell>
      </BottomSheet>
    </>
  );
}
