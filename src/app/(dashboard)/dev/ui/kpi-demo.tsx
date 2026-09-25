"use client";

import { useState } from "react";

import { KpiHero, KpiCard } from "@/components/kpi";

/**
 * La sección KPI de la galería. Datos inventados y fijos: esta página no lee nada.
 *
 * El botón «Simular cambio» existe porque lo que hay que poder ver de un hero animado es
 * justamente el cambio — un número quieto no demuestra nada— y porque es lo que prueba el
 * test: pulsar cambia el texto de la cifra.
 */
const LIBRE_A = 1234567;
const LIBRE_B = 987450;

const PUNTOS_A = [
  820000, 910000, 875000, 1040000, 990000, 1120000, 1080000, 1210000, 1160000, 1290000, 1180000,
  1234567,
] as const;
const PUNTOS_B = [
  1290000, 1180000, 1234567, 1310000, 1220000, 1150000, 1090000, 1140000, 1020000, 1060000, 1005000,
  987450,
] as const;

const TARJETAS = [
  {
    etiqueta: "Ingresos",
    valor: 2850000,
    delta: { valor: 120000, sentidoBueno: "arriba" as const },
    puntos: [2.4, 2.5, 2.6, 2.55, 2.7, 2.62, 2.74, 2.7, 2.79, 2.73, 2.81, 2.85],
  },
  {
    etiqueta: "Gastos",
    valor: 1615433,
    // El mismo «+» que en Ingresos va en verde, acá va en rojo: subir gastos es malo.
    delta: { valor: 84000, sentidoBueno: "abajo" as const },
    puntos: [1.5, 1.44, 1.52, 1.49, 1.58, 1.51, 1.6, 1.55, 1.63, 1.57, 1.53, 1.61],
  },
  {
    etiqueta: "Ahorro del mes",
    valor: 620000,
    delta: { valor: -45000, sentidoBueno: "arriba" as const },
    puntos: [0.5, 0.56, 0.52, 0.6, 0.58, 0.64, 0.61, 0.67, 0.63, 0.69, 0.66, 0.62],
  },
  {
    etiqueta: "Deuda pendiente",
    valor: 3420000,
    delta: { valor: -180000, sentidoBueno: "abajo" as const },
    puntos: [4.2, 4.1, 4.05, 3.95, 3.9, 3.82, 3.76, 3.7, 3.64, 3.58, 3.6, 3.42],
  },
] as const;

export function KpiDemo() {
  const [alterno, setAlterno] = useState(false);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <KpiHero
          etiqueta="Libre para gastar"
          valor={alterno ? LIBRE_B : LIBRE_A}
          nota="Septiembre · después de gastos fijos y metas"
          delta={{
            valor: alterno ? -247117 : 186300,
            vsEtiqueta: "vs mes anterior",
            sentidoBueno: "arriba",
          }}
          puntos={alterno ? PUNTOS_B : PUNTOS_A}
          medidor={{
            valor: alterno ? 88 : 43,
            etiqueta: "Presupuesto del mes consumido",
            umbrales: { aviso: 80, peligro: 100 },
          }}
        />

        <button type="button" className="btn btn-ghost" onClick={() => setAlterno((v) => !v)}>
          Simular cambio
        </button>
      </div>

      {/* Ancla estable: la galería tiene más de una `KpiCard` suelta (la de `lectura-demo`),
          así que un `.kpi-card` a secas recoge tarjetas de otra sección. Los tests miden
          ESTA fila. */}
      <div
        id="kpi-tarjetas"
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        {TARJETAS.map((t) => (
          <KpiCard
            key={t.etiqueta}
            etiqueta={t.etiqueta}
            valor={t.valor}
            delta={t.delta}
            puntos={t.puntos}
          />
        ))}
      </div>
    </div>
  );
}
