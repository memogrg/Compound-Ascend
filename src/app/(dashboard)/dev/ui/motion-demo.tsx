"use client";

import { useState } from "react";

const DURACIONES = [
  { token: "--dur-micro", valor: "120ms", uso: "hover, foco, chips" },
  { token: "--dur-std", valor: "200ms", uso: "entrada de tarjetas, tooltips" },
  { token: "--dur-tr", valor: "320ms", uso: "transición entre vistas" },
  { token: "--dur-range", valor: "450ms", uso: "cambio de rango en un gráfico" },
  { token: "--dur-number", valor: "600ms", uso: "conteo de una cifra grande" },
] as const;

const CURVAS = ["--ease-std", "--ease-in", "--ease-out"] as const;

/**
 * Única parte cliente de /dev/ui: el movimiento hay que verlo, no leerlo.
 * No lee ni escribe nada — solo estado local para disparar la animación.
 */
export function MotionDemo() {
  const [corriendo, setCorriendo] = useState<string | null>(null);
  const [curva, setCurva] = useState<(typeof CURVAS)[number]>("--ease-std");

  return (
    <div>
      <div className="seg" style={{ marginBottom: 16 }}>
        {CURVAS.map((c) => (
          <button
            key={c}
            type="button"
            className={`seg-btn${curva === c ? " on" : ""}`}
            onClick={() => setCurva(c)}
          >
            {c.replace("--ease-", "")}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {DURACIONES.map((d) => (
          <div key={d.token} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ minWidth: 120 }}
                onClick={() => {
                  setCorriendo(null);
                  // Un frame de pausa para que el navegador reinicie la transición.
                  requestAnimationFrame(() => requestAnimationFrame(() => setCorriendo(d.token)));
                }}
              >
                {d.token.replace("--dur-", "")}
              </button>
              <code className="tnum muted" style={{ fontSize: 12 }}>
                {d.valor}
              </code>
              <span className="muted" style={{ fontSize: 12 }}>
                {d.uso}
              </span>
            </div>
            <div
              className="bar-track"
              style={{ height: 10 }}
              onTransitionEnd={() => setCorriendo(null)}
            >
              <div
                className="bar-fill"
                style={{
                  width: corriendo === d.token ? "100%" : "8%",
                  background: "var(--chart-1)",
                  transition: `width var(${d.token}) var(${curva})`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Con <code>prefers-reduced-motion: reduce</code>, <code>--dur-micro</code>,{" "}
        <code>--dur-tr</code>, <code>--dur-range</code> y <code>--dur-number</code> pasan a{" "}
        <code>0ms</code> y <code>--dur-std</code> baja a <code>150ms</code>: se apaga el
        desplazamiento, no el cambio de estado. Activá la preferencia en el sistema y volvé a
        pulsar: las barras saltan en vez de recorrer.
      </p>
    </div>
  );
}
