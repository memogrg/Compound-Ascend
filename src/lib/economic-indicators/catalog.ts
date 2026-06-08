/**
 * Catálogo de indicadores económicos: única fuente de verdad de QUÉ se ingiere
 * y CÓMO se presenta. El cron itera este catálogo; la UI lo usa para agrupar.
 *
 * `externalId` es el identificador en la fuente:
 *  - BCCR: código interno del indicador (param "Indicador" del web service).
 *  - FRED: series_id (p. ej. "DPRIME").
 *
 * `enabled: false` = scaffolding presente pero sin ingerir todavía (Fase 2).
 */

export type IndicatorSource = "BCCR" | "FRED";
export type IndicatorUnit = "percent" | "currency" | "index";
export type IndicatorGroup = "Costa Rica" | "Estados Unidos";

export interface IndicatorDef {
  /** Código interno estable usado como `indicator_code` en BD y en la UI. */
  code: string;
  source: IndicatorSource;
  /** Identificador en la fuente externa (código BCCR o series_id FRED). */
  externalId: string;
  unit: IndicatorUnit;
  /** Etiqueta corta en español para tarjetas. */
  label: string;
  /** Descripción breve en español. */
  description: string;
  group: IndicatorGroup;
  enabled: boolean;
}

export const INDICATORS: readonly IndicatorDef[] = [
  // ── Costa Rica (BCCR/SDDE) — códigos verificados contra el SDDE (jun-2026) ──
  {
    code: "TBP",
    source: "BCCR",
    externalId: "423",
    unit: "percent",
    label: "Tasa Básica Pasiva",
    description: "Referencia del costo del dinero en colones (revisión semanal).",
    group: "Costa Rica",
    enabled: true,
  },
  {
    code: "TPM",
    source: "BCCR",
    externalId: "3541",
    unit: "percent",
    label: "Tasa de Política Monetaria",
    description: "Instrumento principal de política monetaria del BCCR.",
    group: "Costa Rica",
    enabled: true,
  },
  {
    code: "USDCRC_COMPRA",
    source: "BCCR",
    externalId: "317",
    unit: "currency",
    label: "Dólar — compra",
    description: "Tipo de cambio de referencia, compra (colones por USD).",
    group: "Costa Rica",
    enabled: true,
  },
  {
    code: "USDCRC_VENTA",
    source: "BCCR",
    externalId: "318",
    unit: "currency",
    label: "Dólar — venta",
    description: "Tipo de cambio de referencia, venta (colones por USD).",
    group: "Costa Rica",
    enabled: true,
  },
  {
    code: "TRI",
    source: "BCCR",
    externalId: "90765",
    unit: "percent",
    label: "Tasa Interbancaria (1 día, ₡)",
    description: "Tasa interbancaria garantizada a 1 día plazo en colones (TRI).",
    group: "Costa Rica",
    enabled: true,
  },
  {
    code: "IPC",
    source: "BCCR",
    externalId: "89638",
    unit: "percent",
    label: "Inflación (IPC interanual)",
    description: "Variación interanual del índice de precios al consumidor (base dic-2020).",
    group: "Costa Rica",
    enabled: true,
  },

  // ── Estados Unidos (FRED) — Fase 2 (activado; requiere FRED_API_KEY) ──
  {
    code: "FED_PRIME",
    source: "FRED",
    externalId: "DPRIME",
    unit: "percent",
    label: "Prime Rate",
    description: "Tasa preferencial bancaria en EE. UU.",
    group: "Estados Unidos",
    enabled: true,
  },
  {
    code: "FED_FUNDS",
    source: "FRED",
    externalId: "FEDFUNDS",
    unit: "percent",
    label: "Federal Funds",
    description: "Tasa efectiva de fondos federales.",
    group: "Estados Unidos",
    enabled: true,
  },
  {
    code: "SOFR",
    source: "FRED",
    externalId: "SOFR",
    unit: "percent",
    label: "SOFR",
    description: "Secured Overnight Financing Rate.",
    group: "Estados Unidos",
    enabled: true,
  },
  {
    code: "US_TREASURY_10Y",
    source: "FRED",
    externalId: "GS10",
    unit: "percent",
    label: "Tesoro 10 años",
    description: "Rendimiento del bono del Tesoro de EE. UU. a 10 años.",
    group: "Estados Unidos",
    enabled: true,
  },
  {
    code: "US_CPI",
    source: "FRED",
    externalId: "CPIAUCSL",
    unit: "index",
    label: "CPI (índice)",
    description: "Índice de precios al consumidor de EE. UU.",
    group: "Estados Unidos",
    enabled: true,
  },
] as const;

/** Indicadores que el cron debe ingerir (los activados). */
export function enabledIndicators(): IndicatorDef[] {
  return INDICATORS.filter((i) => i.enabled);
}

/** Busca la definición por su código interno. */
export function findIndicator(code: string): IndicatorDef | undefined {
  return INDICATORS.find((i) => i.code === code);
}
