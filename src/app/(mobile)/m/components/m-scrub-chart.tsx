"use client";

import { useMemo, useRef } from "react";

import { formatMoney } from "@/lib/format";

/**
 * Gráfico de línea/área con SCRUB táctil (sin librerías de charts): al arrastrar el dedo (o el
 * ratón) sobre la línea, un crosshair + punto siguen el valor más cercano y un tooltip de
 * CRISTAL (.m-glass) muestra el valor (Space Mono tabular) y la fecha/etiqueta del punto.
 *
 * - Pointer Events + touch-action:none → no hace scroll al scrubbing; setPointerCapture mantiene
 *   el gesto. El crosshair/punto/tooltip se actualizan por REF (sin re-render) → fluido con
 *   listas largas. El tooltip se mueve por transform (barato; NADA anima backdrop-filter).
 * - Degrada: con <2 puntos no interactúa (línea plana estática). Respeta el layout responsivo
 *   (SVG 100% ancho, stroke no escalado). Sin datos inventados: recibe la historia real.
 */
export type MPoint = { label: string; value: number };

const W = 320;
const PL = 8;
const PR = 8;
const PT = 12;
const PB = 16;

export function MScrubChart({
  points,
  currency,
  color = "var(--accent)",
  height = 148,
}: {
  points: MPoint[];
  currency: string;
  color?: string;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const crossRef = useRef<SVGLineElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipValRef = useRef<HTMLDivElement>(null);
  const tipLblRef = useRef<HTMLDivElement>(null);

  const H = height;

  const geo = useMemo(() => {
    const n = points.length;
    if (n === 0) return null;
    const vals = points.map((p) => p.value);
    const vmin = Math.min(...vals);
    const vmax = Math.max(...vals);
    const span = vmax - vmin || 1;
    const xs = (i: number) => (n === 1 ? W / 2 : PL + (i * (W - PL - PR)) / (n - 1));
    const ys = (v: number) => PT + (1 - (v - vmin) / span) * (H - PT - PB);
    let d = "";
    points.forEach((p, i) => {
      d += `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(p.value).toFixed(1)} `;
    });
    const area = `${d}L${xs(n - 1).toFixed(1)} ${H - PB} L${xs(0).toFixed(1)} ${H - PB} Z`;
    return { n, xs, ys, line: d.trim(), area };
  }, [points, H]);

  if (!geo || geo.n < 2) {
    // Estático legible (sin interacción) cuando no hay suficiente historia.
    return (
      <div style={{ position: "relative", width: "100%" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden>
          <line
            x1={PL}
            x2={W - PR}
            y1={H - PB}
            y2={H - PB}
            stroke="var(--border)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="muted" style={{ fontSize: 11.5, textAlign: "center", marginTop: 4 }}>
          Aún no hay suficiente historia para el gráfico.
        </div>
      </div>
    );
  }

  const { xs, ys, line, area } = geo;

  const end = () => {
    if (crossRef.current) crossRef.current.style.opacity = "0";
    if (dotRef.current) dotRef.current.style.opacity = "0";
    if (tipRef.current) tipRef.current.style.opacity = "0";
  };

  const scrub = (clientX: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    if (r.width === 0) return;
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const i = Math.round(f * (geo.n - 1));
    const p = points[i]!;
    const vx = xs(i);
    const vy = ys(p.value);
    // Crosshair + punto en coordenadas del viewBox (el SVG se estira al ancho).
    if (crossRef.current) {
      crossRef.current.setAttribute("x1", String(vx));
      crossRef.current.setAttribute("x2", String(vx));
      crossRef.current.style.opacity = "1";
    }
    if (dotRef.current) {
      dotRef.current.setAttribute("cx", String(vx));
      dotRef.current.setAttribute("cy", String(vy));
      dotRef.current.style.opacity = "1";
    }
    // Tooltip en píxeles (relativo al wrap), movido por transform con clamp horizontal.
    if (tipRef.current && tipValRef.current && tipLblRef.current) {
      tipValRef.current.textContent = formatMoney(p.value, currency);
      tipLblRef.current.textContent = p.label;
      const px = (vx / W) * r.width;
      const py = (vy / H) * r.height;
      const tw = tipRef.current.offsetWidth;
      const left = Math.max(tw / 2 + 2, Math.min(r.width - tw / 2 - 2, px));
      tipRef.current.style.opacity = "1";
      tipRef.current.style.left = `${left}px`;
      tipRef.current.style.top = `${py}px`;
    }
  };

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", touchAction: "none", cursor: "crosshair" }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        scrub(e.clientX);
      }}
      onPointerMove={(e) => scrub(e.clientX)}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="msc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.24" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#msc-fill)" />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <line
          ref={crossRef}
          x1={0}
          x2={0}
          y1={PT - 2}
          y2={H - PB}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
          style={{ opacity: 0 }}
        />
        <circle
          ref={dotRef}
          cx={0}
          cy={0}
          r={4.5}
          fill={color}
          stroke="var(--surface)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ opacity: 0 }}
        />
      </svg>
      <div
        ref={tipRef}
        className="m-glass"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: "translate(-50%, calc(-100% - 12px))",
          padding: "6px 10px",
          borderRadius: 12,
          pointerEvents: "none",
          opacity: 0,
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        <div ref={tipValRef} className="mono" style={{ fontSize: 13, fontWeight: 700 }} />
        <div ref={tipLblRef} className="muted" style={{ fontSize: 10.5, marginTop: 1 }} />
      </div>
    </div>
  );
}
