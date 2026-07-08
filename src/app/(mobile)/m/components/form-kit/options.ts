import { CURRENCY_OPTIONS } from "@/lib/format";

import type { Opt } from "./fields";

/**
 * Opciones de formulario compartidas por los managers (ingresos, gastos, …). Son datos
 * de presentación (no lógica): frecuencia y moneda, iguales para toda entidad con
 * `frequency`/`currency` en su schema. Se extraen aquí para no duplicarlos por pantalla.
 */

export const FREQ_OPTS: Opt[] = [
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

export const CUR_OPTS: Opt[] = CURRENCY_OPTIONS.map(({ code, symbol }) => ({
  value: code,
  label: `${code} · ${symbol}`,
}));
