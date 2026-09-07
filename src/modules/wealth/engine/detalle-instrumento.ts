/**
 * Lo que el usuario FIRMÓ, para la pantalla de detalle — motor puro.
 *
 * El wizard es donde se cargan los términos; el detalle es donde se los mira
 * meses después, cuando ya no se acuerda de qué compró. Hasta ahora el detalle
 * mostraba sólo los pagos anotados a mano: una nota con cupón configurado se
 * leía "Sin dividendos registrados aún", que es exactamente lo contrario de lo
 * que pasa. Este motor arma las tres cosas que faltaban, sin JSX, para que web
 * y móvil digan lo mismo:
 *
 *   · `filasDeNota`      — los términos, tal como se cargaron.
 *   · `terminosDeNota`   — adaptador al motor de `lecturaDeRiesgo`.
 *   · `payoutConfigurado`— el cupón/dividendo configurado (no el historial).
 *
 * NO evalúa ni proyecta mercado: describe. La base del rendimiento es la misma
 * que usan la proyección de ingreso pasivo (`dividend-service`) y la vista
 * previa del wizard —el valor manual manda, si no lo invertido—; si divergiera,
 * el detalle diría un número y el flujo del mes otro.
 */

import {
  calcularRendimiento,
  esFrecuenciaPago,
  proximaFechaPago,
  type Rendimiento,
} from "@/lib/finance/rendimiento-periodico";
import { etiquetaPayout } from "@/modules/wealth/constants";
import type { TerminosNota } from "@/modules/wealth/engine/nota-estructurada";
import type { AssetType } from "@/modules/wealth/types";

/** Subconjunto estructural de Holding: el motor no depende de la fila entera. */
export type InstrumentoDetalle = {
  assetType?: AssetType | string | null;
  quantity?: number | null;
  averageCost?: number | null;
  currentValueManual?: number | null;
  maturityDate?: string | null;
  payoutEnabled?: boolean;
  payoutMode?: "yield" | "manual" | null;
  payoutRatePct?: number | null;
  payoutAmount?: number | null;
  payoutFrequency?: string | null;
  payoutWithholdingPct?: number | null;
  payoutNextDate?: string | null;
  noteIssuer?: string | null;
  noteUnderlying?: string | null;
  noteCapitalProtectionPct?: number | null;
  noteBarrierPct?: number | null;
  noteAutocall?: boolean;
  noteAutocallDate?: string | null;
  noteParticipationPct?: number | null;
  noteIsin?: string | null;
};

export type FilaTermino = {
  etiqueta: string;
  valor: string;
  /** Texto del tooltip. Sólo donde el dato solo se malinterpreta. */
  ayuda?: string;
};

export type PayoutConfigurado = {
  /** "Cupón" / "Dividendo" / "Interés", derivado del tipo de activo. */
  singular: string;
  plural: string;
  rendimiento: Rendimiento;
  retencionPct: number;
  /** Grafía que se le muestra a la persona ('bimensual' → 'cada 2 meses'). */
  frecuencia: string;
  /** Próxima fecha de cobro ya proyectada hacia adelante; null si no se puede. */
  proximoCobro: string | null;
};

export function esNota(h: Pick<InstrumentoDetalle, "assetType">): boolean {
  return h.assetType === "nota_estructurada";
}

/** Base del rendimiento: el valor manual manda, si no lo invertido. */
export function basePayout(h: InstrumentoDetalle): number {
  const invertido = num(h.quantity) * num(h.averageCost);
  return num(h.currentValueManual) || invertido;
}

export function terminosDeNota(h: InstrumentoDetalle): TerminosNota {
  return {
    emisor: h.noteIssuer ?? null,
    subyacente: h.noteUnderlying ?? null,
    proteccionPct: h.noteCapitalProtectionPct ?? null,
    barreraPct: h.noteBarrierPct ?? null,
    autocall: h.noteAutocall ?? false,
    autocallDate: h.noteAutocallDate ?? null,
    participacionPct: h.noteParticipationPct ?? null,
    vencimiento: h.maturityDate ?? null,
  };
}

/**
 * Los términos cargados, en orden de lo que la persona pregunta primero.
 * Un campo vacío NO produce fila: mejor que falte a que diga "—" y parezca
 * que el término existe y vale cero.
 */
export function filasDeNota(h: InstrumentoDetalle): FilaTermino[] {
  const filas: FilaTermino[] = [];

  if (h.noteIssuer) {
    filas.push({
      etiqueta: "Emisor",
      valor: h.noteIssuer,
      ayuda: "La protección vale lo que vale quien la promete.",
    });
  }
  if (h.noteUnderlying) filas.push({ etiqueta: "Subyacente", valor: h.noteUnderlying });

  const proteccion = finito(h.noteCapitalProtectionPct);
  if (proteccion != null) {
    filas.push({ etiqueta: "Protección de capital", valor: pct(proteccion) });
  }

  const barrera = finito(h.noteBarrierPct);
  if (barrera != null) {
    filas.push({
      etiqueta: "Barrera",
      valor: pct(barrera),
      ayuda: "Si el subyacente cae por debajo de este nivel, la protección deja de aplicar.",
    });
  }

  const participacion = finito(h.noteParticipationPct);
  if (participacion != null) {
    filas.push({ etiqueta: "Participación", valor: pct(participacion) });
  }

  if (h.noteAutocall) {
    filas.push({
      etiqueta: "Autocall",
      valor: h.noteAutocallDate ? `Sí · observa el ${fecha(h.noteAutocallDate)}` : "Sí",
      ayuda: "El emisor puede cancelarla antes: el plazo real puede ser menor.",
    });
  }

  if (h.maturityDate) filas.push({ etiqueta: "Vencimiento", valor: fecha(h.maturityDate) });
  if (h.noteIsin) filas.push({ etiqueta: "ISIN", valor: h.noteIsin });

  return filas;
}

/**
 * El rendimiento CONFIGURADO (lo que va a cobrar), distinto del historial de lo
 * ya cobrado. Devuelve null si no hay nada configurado: sin config no hay nada
 * que prometer, y una tarjeta en cero se leería como "no paga".
 */
export function payoutConfigurado(h: InstrumentoDetalle, hoy: string): PayoutConfigurado | null {
  if (!h.payoutEnabled) return null;
  if (!esFrecuenciaPago(h.payoutFrequency)) return null;

  const retencionPct = num(h.payoutWithholdingPct);
  const rendimiento = calcularRendimiento(
    {
      modo: h.payoutMode === "manual" ? "manual" : "yield",
      yieldPct: h.payoutRatePct ?? 0,
      montoPorPago: h.payoutAmount ?? 0,
      frecuencia: h.payoutFrequency,
      retencionPct,
    },
    basePayout(h),
  );
  if (rendimiento.netoPorPago <= 0) return null;

  const { singular, plural } = etiquetaPayout(h.assetType as AssetType | null | undefined);
  return {
    singular,
    plural,
    rendimiento,
    retencionPct,
    frecuencia: nombreFrecuencia(h.payoutFrequency),
    proximoCobro: proximaFechaPago(h.payoutNextDate, h.payoutFrequency, hoy),
  };
}

/** 'bimensual' no se muestra crudo: se lee como "dos veces por mes" (#740). */
function nombreFrecuencia(f: string): string {
  return f === "bimensual" ? "cada 2 meses" : f;
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function finito(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pct(n: number): string {
  return `${Math.round(n * 100) / 100}%`;
}

export function fecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
