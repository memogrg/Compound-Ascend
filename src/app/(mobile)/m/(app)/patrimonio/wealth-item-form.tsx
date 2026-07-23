import { useState } from "react";
import { useCaptureCurrency } from "@/components/layout/currency-context";

import {
  FormShell,
  TextField,
  MoneyField,
  SheetSelect,
  Toggle,
  CUR_OPTS,
  type ActionResult,
  type Opt,
} from "../../components/form-kit";

/**
 * Formulario de un ACTIVO o PASIVO del patrimonio (espejo del modal web `Form` de
 * rich-actions.tsx: mismos campos de assetInputSchema / liabilityInputSchema). El
 * `kind` decide los campos; reutiliza add/edit{Asset,Liability}Action vía la prop
 * `action` (sin duplicar validación/persistencia). es-MX, tema claro.
 */
export type AssetValues = {
  name: string;
  assetClass: string;
  value: number;
  currency: string;
  generatesIncome: boolean;
};
export type LiabilityValues = {
  name: string;
  liabilityClass: string;
  balance: number;
  currency: string;
};

/** Estado inicial común (para precargar en edición), agnóstico de activo/pasivo. */
export type WealthItemInitial = {
  name: string;
  cls: string;
  amount: number | undefined;
  currency: string;
  generatesIncome: boolean;
};

const ASSET_CLASS_OPTS: Opt[] = [
  { value: "liquido", label: "Líquido (efectivo, ahorro)" },
  { value: "inversion", label: "Inversión" },
  { value: "productivo", label: "Productivo (genera ingreso)" },
  { value: "uso_personal", label: "Uso personal" },
  { value: "especial", label: "Especial" },
];
const LIAB_CLASS_OPTS: Opt[] = [
  { value: "consumo", label: "Consumo" },
  { value: "patrimonial", label: "Patrimonial" },
  { value: "productivo", label: "Productivo" },
  { value: "critico", label: "Crítico" },
];

export function WealthItemForm({
  kind,
  initial,
  action,
  submitLabel,
  successMessage,
  onSuccess,
}: {
  kind: "asset" | "liability";
  initial?: WealthItemInitial;
  action: (raw: AssetValues | LiabilityValues) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
}) {
  const isAsset = kind === "asset";
  const defaultCls = isAsset ? "liquido" : "consumo";

  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState<number | undefined>(initial?.amount);
  const [cls, setCls] = useState(initial?.cls ?? defaultCls);
  // ALTA: la PRINCIPAL del contexto (importe libre); edición: la nativa del ítem. Antes
  // caía a `currency`, la de visualización del topbar — la siembra equivocada.
  const captureCurrency = useCaptureCurrency();
  const [cur, setCur] = useState(initial?.currency ?? captureCurrency);
  const [generatesIncome, setGeneratesIncome] = useState(initial?.generatesIncome ?? false);

  const values: AssetValues | LiabilityValues = isAsset
    ? { name: name.trim(), assetClass: cls, value: amount ?? 0, currency: cur, generatesIncome }
    : { name: name.trim(), liabilityClass: cls, balance: amount ?? 0, currency: cur };

  return (
    <FormShell
      action={action}
      values={values}
      submitLabel={submitLabel}
      successMessage={successMessage}
      onSuccess={onSuccess}
    >
      <TextField
        name="name"
        label="Nombre"
        value={name}
        onChange={setName}
        placeholder={isAsset ? "Casa, carro, inversión…" : "Hipoteca, préstamo…"}
        maxLength={120}
        autoFocus
      />
      <MoneyField
        name={isAsset ? "value" : "balance"}
        label={isAsset ? "Valor estimado" : "Saldo"}
        value={amount}
        onChange={setAmount}
        currency={cur}
      />
      <SheetSelect
        name={isAsset ? "assetClass" : "liabilityClass"}
        label="Tipo"
        value={cls}
        onChange={setCls}
        options={isAsset ? ASSET_CLASS_OPTS : LIAB_CLASS_OPTS}
        sheetTitle="Tipo"
      />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />
      {isAsset ? (
        <Toggle
          name="generatesIncome"
          label="Genera ingreso"
          value={generatesIncome}
          onChange={setGeneratesIncome}
          hint="Marca si este activo te produce renta (alquiler, dividendos…)."
        />
      ) : null}
    </FormShell>
  );
}
