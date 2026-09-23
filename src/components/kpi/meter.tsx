"use client";

/**
 * Una barra de progreso con SIGNIFICADO: `role="meter"` y no `progressbar`.
 *
 * `progressbar` dice «esto va por la mitad y terminará»; `meter` dice «esta medida está en
 * este punto de su rango», que es lo que significa un 43 % de ahorro o un 78 % de presupuesto
 * gastado. El rol cambia lo que anuncia el lector de pantalla, no solo el nombre.
 */
export type UmbralesMeter = {
  /** A partir de acá, atención. */
  aviso: number;
  /** A partir de acá, mal. */
  peligro: number;
};

export type SeveridadMeter = "ok" | "aviso" | "peligro";

/**
 * Pura. Los umbrales son INCLUSIVOS por arriba: con `aviso: 80`, un 80 exacto ya avisa —
 * quien fija el umbral en 80 quiere enterarse AL llegar, no al pasarse.
 */
export function severidadMeter(valor: number, umbrales: UmbralesMeter): SeveridadMeter {
  if (!Number.isFinite(valor)) return "ok";
  if (valor >= umbrales.peligro) return "peligro";
  if (valor >= umbrales.aviso) return "aviso";
  return "ok";
}

export function Meter({
  valor,
  min = 0,
  max = 100,
  etiqueta,
  umbrales = { aviso: 80, peligro: 100 },
}: {
  valor: number;
  min?: number;
  max?: number;
  /** Lo que mide, en palabras. Sin él, el lector anuncia un número sin sujeto. */
  etiqueta: string;
  umbrales?: UmbralesMeter;
}) {
  const acotado = Math.max(min, Math.min(max, Number.isFinite(valor) ? valor : min));
  const pct = max === min ? 0 : ((acotado - min) / (max - min)) * 100;
  return (
    <div
      className="kpi-meter"
      role="meter"
      aria-valuenow={Math.round(acotado)}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={etiqueta}
      data-severidad={severidadMeter(valor, umbrales)}
    >
      <span className="kpi-meter-relleno" style={{ width: `${pct}%` }} />
    </div>
  );
}
