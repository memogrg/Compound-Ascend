import { useState } from "react";

import {
  FormShell,
  TextField,
  MoneyField,
  SheetSelect,
  CUR_OPTS,
  type ActionResult,
  type Opt,
} from "../../components/form-kit";

/**
 * Formulario de una PÓLIZA (espejo del modal web `PolicyForm` de wealth-actions.tsx:
 * mismos campos del `policyInputSchema`). Reutiliza add/editPolicyAction vía la prop
 * `action`; sin duplicar validación/persistencia. Se omiten `renewalDate` (que el modal
 * web tampoco captura) y el tipo `empresarial` (fuera del dropdown web). es-MX, tema claro.
 */
export type PolicyValues = {
  policyType: string;
  provider?: string;
  coverage?: number;
  premium?: number;
  premiumFrequency: string;
  currency: string;
};

// Mismo listado (y orden) que POLICY_TYPES del modal web.
const POLICY_TYPE_OPTS: Opt[] = [
  { value: "medico", label: "Médico" },
  { value: "vida", label: "Vida" },
  { value: "incapacidad", label: "Incapacidad / ingresos" },
  { value: "hogar", label: "Hogar" },
  { value: "vehiculo", label: "Vehículo" },
  { value: "patrimonial", label: "Patrimonial" },
  { value: "familiar", label: "Familiar" },
  { value: "otro", label: "Otro" },
];

const PREMIUM_FREQ_OPTS: Opt[] = [
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

export function PolicyForm({
  initial,
  currency,
  action,
  submitLabel,
  successMessage,
  onSuccess,
}: {
  initial?: PolicyValues;
  currency: string;
  action: (raw: PolicyValues) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
}) {
  const [policyType, setPolicyType] = useState(initial?.policyType ?? "medico");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [coverage, setCoverage] = useState<number | undefined>(initial?.coverage);
  const [premium, setPremium] = useState<number | undefined>(initial?.premium);
  const [premiumFrequency, setPremiumFrequency] = useState(initial?.premiumFrequency ?? "mensual");
  const [cur, setCur] = useState(initial?.currency ?? currency);

  const values: PolicyValues = {
    policyType,
    provider: provider.trim() || undefined,
    coverage,
    premium,
    premiumFrequency,
    currency: cur,
  };

  return (
    <FormShell
      action={action}
      values={values}
      submitLabel={submitLabel}
      successMessage={successMessage}
      onSuccess={onSuccess}
    >
      <SheetSelect
        name="policyType"
        label="Tipo de cobertura"
        value={policyType}
        onChange={setPolicyType}
        options={POLICY_TYPE_OPTS}
        sheetTitle="Tipo de cobertura"
      />
      <TextField
        name="provider"
        label="Aseguradora (opcional)"
        value={provider}
        onChange={setProvider}
        placeholder="Nombre"
        maxLength={80}
      />
      <MoneyField
        name="coverage"
        label="Suma asegurada (opcional)"
        value={coverage}
        onChange={setCoverage}
        currency={cur}
      />
      <MoneyField name="premium" label="Prima (opcional)" value={premium} onChange={setPremium} currency={cur} />
      <SheetSelect
        name="premiumFrequency"
        label="Frecuencia de la prima"
        value={premiumFrequency}
        onChange={setPremiumFrequency}
        options={PREMIUM_FREQ_OPTS}
        sheetTitle="Frecuencia de la prima"
      />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />
    </FormShell>
  );
}
