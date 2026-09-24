"use client";

import { useMemo, useState } from "react";

import { KpiCard } from "@/components/kpi";
import {
  ActionStrip,
  BreakdownCard,
  InsightList,
  SectionHeader,
  desdeAction,
  desdeInsight,
  type FilaDesglose,
  type InsightItem,
} from "@/components/lectura";
import { formatMoney } from "@/lib/format";

import { ACCION, INSIGHTS, SOBRES } from "./lectura-datos";

/**
 * La sección «Lectura» de la galería: una tarjeta compuesta tipo Gastos, con las cuatro
 * franjas encadenadas. Datos fijos e inventados — esta página no lee nada.
 *
 * Lo que demuestra, y que no se ve en una captura suelta, es la **interacción enlazada**: el
 * foco de la pantalla —el sobre seleccionado, o aquel dentro del que estamos— actualiza el
 * KPI de al lado y filtra las señales. **Entrar a un sobre cuenta como foco**: si el desglose
 * está mostrando el desmenuce de Supermercado, el resto de la pantalla no puede seguir
 * hablando del total.
 *
 * Los dos estados (`seleccion` y `ruta`) viven acá y no dentro de la tarjeta, que es lo que
 * permitirá atarlos a `?cat=` en la fase 3 sin tocar la primitiva.
 */
const CIFRAS: Record<string, string> = {
  i1: formatMoney(42500, "CRC"),
  i2: formatMoney(18900, "CRC"),
  i3: formatMoney(61000, "CRC"),
};

/** Una fila por id, en todo el árbol. */
function buscar(filas: readonly FilaDesglose[], id: string): FilaDesglose | undefined {
  for (const f of filas) {
    if (f.id === id) return f;
    const dentro = f.hijos ? buscar(f.hijos, id) : undefined;
    if (dentro) return dentro;
  }
  return undefined;
}

export function LecturaDemo() {
  const [sobre, setSobre] = useState<string | null>(null);
  const [ruta, setRuta] = useState<string[]>([]);

  const items: InsightItem[] = useMemo(
    () => INSIGHTS.map((i) => desdeInsight(i, { cifra: CIFRAS[i.id] })),
    [],
  );

  // El foco de la pantalla: lo seleccionado manda; si no hay nada, el sobre en el que
  // estamos. Volver o soltar la selección devuelve el total.
  const foco = sobre ?? ruta[ruta.length - 1] ?? null;
  const filaFoco = foco ? buscar(SOBRES, foco) : undefined;

  // Un id de nivel 2 no tiene señales propias, así que la lista queda vacía a propósito: es
  // información («de esto no hay nada que señalar»), no un error, y el estado vacío lo dice.
  const filtradas = foco ? items.filter((i) => i.relacionado?.id === foco) : items;

  return (
    <div className="lec-demo">
      <div className="lec-bloque">
        <SectionHeader
          titulo="A dónde se fue"
          eyebrow="Septiembre"
          nivel={3}
          ayuda="Suma de los movimientos del mes por sobre, después de descontar traslados entre cuentas. Un sobre puede pasarse sin que el mes cierre en rojo."
          toolbar={
            <>
              <span className="chip">vs mes anterior</span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }}>
                Ver tabla
              </button>
            </>
          }
        />

        {/* `auto-fit` con un mínimo real: por debajo de ~620 px las dos columnas no caben sin
            estrangular el desglose, y una tarjeta de 190 px trunca todas las etiquetas. */}
        <div
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            alignItems: "start",
          }}
        >
          <BreakdownCard
            filas={SOBRES}
            max={6}
            seleccion={sobre}
            onSeleccionar={setSobre}
            ruta={ruta}
            onRuta={setRuta}
            etiquetaRaiz="Gastos del mes"
          />

          <KpiCard
            etiqueta={filaFoco ? filaFoco.etiqueta : "Total del mes"}
            valor={filaFoco ? filaFoco.valor : SOBRES.reduce((s, f) => s + f.valor, 0)}
            nota={filaFoco ? "En foco en el desglose" : "Seleccioná un sobre para desglosarlo"}
          />
        </div>
      </div>

      <div className="lec-bloque">
        <SectionHeader titulo="Qué investigar" nivel={3} />
        <InsightList items={filtradas} onDescartar={() => {}} />
      </div>

      <div className="lec-bloque">
        <SectionHeader titulo="Qué hacer" nivel={3} />
        <ActionStrip {...desdeAction(ACCION)} />
      </div>
    </div>
  );
}
