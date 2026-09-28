"use client";

import { useState } from "react";

import { KpiHero } from "@/components/kpi";

/**
 * La ANIMACIÓN de la cifra principal. Datos inventados y fijos: esta página no lee nada.
 *
 * Lo único que queda de la galería vieja de KPI (delta 2.6c). Las tarjetas sueltas que había
 * acá —`KpiCard` en su estado feliz— las muestra el catálogo de estados en los ocho, así que
 * mantenerlas era dibujar dos veces lo mismo y dejar que se separaran.
 *
 * Lo que el catálogo NO puede mostrar es esto: el botón «Simular cambio» cambia el valor y lo
 * que hay que ver es el CAMBIO —un número quieto no demuestra que la cifra se anime—. Es
 * también lo que prueba el test: pulsar cambia el texto de la cifra.
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
    </div>
  );
}
