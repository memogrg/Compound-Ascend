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
 * El texto de la medida. UNA función para los dos canales: es lo que se pinta a la derecha
 * de la pista y, literal, lo que va en `aria-valuetext`. Tenerlo dos veces escrito es cómo
 * se acaba anunciando «43» mientras la pantalla dice «43 %».
 *
 * Espacio normal antes del «%», como `formatPct1`; que no parta de línea lo resuelve el CSS.
 */
export function textoMeter(valor: number, max: number): string {
  return max === 100 ? `${Math.round(valor)} %` : `${Math.round(valor)} / ${max}`;
}

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
  const texto = textoMeter(acotado, max);
  return (
    <div className="kpi-meter-fila">
      <div
        className="kpi-meter"
        role="meter"
        aria-valuenow={Math.round(acotado)}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={texto}
        aria-label={etiqueta}
        data-severidad={severidadMeter(valor, umbrales)}
      >
        <span className="kpi-meter-relleno" style={{ width: `${pct}%` }} />
      </div>
      {/* `aria-hidden` porque `aria-valuetext` ya dice exactamente esto: sin ocultarlo, un
          lector de pantalla leería la medida dos veces seguidas. */}
      <span className="kpi-meter-valor tnum" aria-hidden="true">
        {texto}
      </span>
    </div>
  );
}
