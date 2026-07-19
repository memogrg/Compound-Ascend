"use client";

import { useState } from "react";

import { formatCompact } from "@/lib/format";

/**
 * Donut de distribución + leyenda, INTERACTIVA: al tocar/click un segmento (arco o ítem de la
 * leyenda) se resalta (más grosor + opacidad) y el centro muestra su etiqueta, valor y % de ese
 * segmento; sin selección → el total (centerValue/centerLabel). Reutilizada por /m/patrimonio
 * (Composición) e /m/inversiones (Distribución). Recibe porciones ya calculadas por los engines;
 * no computa datos de negocio. El valor de un segmento se muestra abreviado (formatCompact) con
 * la `currency` recibida (string serializable; no se pasan funciones desde el server).
 */
export type MSlice = { label: string; value: number; color: string };

export function MDonut({
  slices,
  centerValue,
  centerLabel,
  currency,
}: {
  slices: MSlice[];
  centerValue: string;
  centerLabel: string;
  /** Moneda para formatear el valor del segmento seleccionado en el centro. */
  currency: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const [sel, setSel] = useState<number | null>(null);

  let acc = 0;
  const segs = slices.map((s) => {
    const pct = (s.value / total) * 100;
    const seg = { color: s.color, len: pct, offset: 25 - acc };
    acc += pct;
    return seg;
  });

  const toggle = (i: number) => setSel((prev) => (prev === i ? null : i));

  // Reparto del texto, decidido midiendo: dentro del aro solo cabe algo muy corto, así que
  // el centro es el LECTOR DE LA SELECCIÓN (el % del segmento tocado, vacío en reposo) y el
  // pie de debajo dice siempre cuánto y de qué. "100% · Uso personal" medía 85px contra los
  // ~62 del hueco: no era cuestión de encoger la fuente, no cabía.
  const selected = sel != null ? slices[sel] : undefined;
  const centerBig = selected ? formatCompact(selected.value, currency) : centerValue;
  const centerSmall = selected ? `${Math.round((selected.value / total) * 100)}%` : "";

  return (
    <div className="card card-p">
      <div className="row" style={{ gap: 20 }}>
        {/* El valor va DEBAJO del anillo, no dentro. El agujero da ~63px de ancho útil y
            "₡347,6 M" mide 73px a 15px: aun bajándolo hasta que "cupiera", el screenshot
            mostraba el número pegado al aro. El hueco es sencillamente pequeño para un
            importe, así que dentro queda solo el dato corto (el %, o la etiqueta en reposo)
            y la cifra respira aquí abajo, donde además puede leerse a un tamaño decente. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div className="ring-wrap">
          <svg width="112" height="112" viewBox="0 0 42 42">
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--surface-2)" strokeWidth={5} />
            {segs.map((s, i) => {
              const isSel = sel === i;
              const dim = sel != null && !isSel;
              return (
                <circle
                  key={i}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="none"
                  stroke={s.color}
                  strokeWidth={isSel ? 7 : 5}
                  strokeDasharray={`${s.len} ${100 - s.len}`}
                  strokeDashoffset={s.offset}
                  opacity={dim ? 0.38 : 1}
                  style={{ cursor: "pointer", transition: "stroke-width 0.15s ease, opacity 0.15s ease" }}
                  onClick={() => toggle(i)}
                  role="button"
                  aria-label={`${slices[i]!.label}: ${Math.round((slices[i]!.value / total) * 100)}%`}
                />
              );
            })}
          </svg>
          {/* Dentro del aro, solo el dato corto: el % del segmento tocado, o la etiqueta
              del total en reposo ("activos"). Ambos rondan los 25-31px y sobra sitio. */}
          <div className="ring-center" style={{ pointerEvents: "none" }}>
            <div className="display" style={{ fontSize: 13 }}>
              {centerSmall}
            </div>
          </div>
        </div>

        {/* Pie del anillo: la cifra y, si hay segmento tocado, de qué es. Aquí no hay
            restricción de ancho, así que la etiqueta larga ("Uso personal") se lee entera. */}
        <div style={{ textAlign: "center" }}>
          <div className="mono" style={{ fontSize: 14, fontWeight: 700 }}>
            {centerBig}
          </div>
          <div className="muted" style={{ fontSize: 10.5, marginTop: 1 }}>
            {selected ? selected.label : centerLabel}
          </div>
        </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {slices.map((s, i) => {
            const isSel = sel === i;
            return (
              <button
                key={i}
                type="button"
                className="between"
                onClick={() => toggle(i)}
                style={{
                  background: isSel ? "var(--surface-2)" : "transparent",
                  border: "none",
                  borderRadius: 8,
                  padding: "3px 6px",
                  margin: "-3px -6px",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "calc(100% + 12px)",
                  opacity: sel != null && !isSel ? 0.55 : 1,
                }}
              >
                <span style={{ fontSize: 13 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 9,
                      height: 9,
                      borderRadius: 3,
                      background: s.color,
                      marginRight: 8,
                    }}
                  />
                  {s.label}
                </span>
                <span className="mono" style={{ fontSize: 12.5 }}>
                  {Math.round((s.value / total) * 100)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
