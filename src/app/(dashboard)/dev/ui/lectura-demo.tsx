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
import type { DetectedInsight } from "@/lib/insights/types";
import type { Action } from "@/modules/actions/types";

/**
 * La sección «Lectura» de la galería: una tarjeta compuesta tipo Gastos, con las cuatro
 * franjas encadenadas. Datos fijos e inventados — esta página no lee nada.
 *
 * Lo que demuestra, y que no se ve en una captura suelta, es la **interacción enlazada**:
 * seleccionar un sobre actualiza el KPI de al lado y filtra las señales a las de esa
 * categoría. En la pantalla real ese estado viajará por `?cat=` (fase 3); acá vive en el
 * componente, porque el objetivo es probar las primitivas, no el enrutado.
 */

/** Ocho sobres: con `max = 6` se pliegan los dos últimos en «Otros». */
const SOBRES: FilaDesglose[] = [
  {
    id: "supermercado",
    etiqueta: "Supermercado",
    valor: 412500,
    color: "var(--s1)",
    hijos: [
      { id: "super-automercado", etiqueta: "Automercado", valor: 231000, color: "var(--s1)" },
      { id: "super-pali", etiqueta: "Palí", valor: 118500, color: "var(--s4)" },
      { id: "super-feria", etiqueta: "Feria", valor: 63000, color: "var(--s5)" },
    ],
  },
  { id: "casa", etiqueta: "Casa y servicios", valor: 298000, color: "var(--s2)" },
  { id: "transporte", etiqueta: "Transporte", valor: 164300, color: "var(--s4)" },
  { id: "salud", etiqueta: "Salud", valor: 97800, color: "var(--s5)" },
  { id: "disfrute", etiqueta: "Disfrute", valor: 86400, color: "var(--s6)" },
  { id: "educacion", etiqueta: "Educación", valor: 52000, color: "var(--info)" },
  { id: "mascotas", etiqueta: "Mascotas", valor: 31200, color: "var(--warning)" },
  { id: "regalos", etiqueta: "Regalos", valor: 18900, color: "var(--muted)" },
];

/** Tres señales, una por severidad distinta; la primera cuelga de una categoría. */
const INSIGHTS: (DetectedInsight & { id: string })[] = [
  {
    id: "i1",
    kind: "sobre_sobregirado",
    severity: "accionar",
    title: "Supermercado se pasó del sobre",
    body: "Llevás ₡42.500 por encima de lo asignado y quedan 9 días de mes.",
    relatedKind: "category",
    relatedId: "supermercado",
  },
  {
    id: "i2",
    kind: "sobre_ocioso",
    severity: "info",
    title: "Regalos casi no se usó",
    body: "₡18.900 de un presupuesto de ₡60.000 en los últimos tres meses.",
    relatedKind: "category",
    relatedId: "regalos",
  },
  {
    id: "i3",
    kind: "racha_positiva",
    severity: "celebrar",
    title: "Tercer mes seguido cerrando en verde",
    body: "El flujo libre creció ₡61.000 respecto al promedio del trimestre.",
  },
];

const CIFRAS: Record<string, string> = {
  i1: formatMoney(42500, "CRC"),
  i2: formatMoney(18900, "CRC"),
  i3: formatMoney(61000, "CRC"),
};

const ACCION = {
  key: "demo:gasto:supermercado",
  kind: "orden",
  title: "Ajustar el sobre de Supermercado",
  why: "Es el único que se pasó este mes.",
  impact: { kind: "monto", value: 42500, currency: "CRC", label: "Cierra una brecha de ₡42.500" },
  effort: "2 minutos",
  route: "/gastos",
  teach: "",
  source: "motor",
  weights: {},
} as unknown as Action;

export function LecturaDemo() {
  const [sobre, setSobre] = useState<string | null>(null);

  const items: InsightItem[] = useMemo(
    () => INSIGHTS.map((i) => desdeInsight(i, { cifra: CIFRAS[i.id] })),
    [],
  );

  // Enlazado: el sobre fijado filtra las señales a las de esa categoría. Sin selección se
  // ven las tres; con una categoría que no tiene señales, la lista queda vacía a propósito
  // —es información, no un error— y el estado vacío lo dice.
  const filtradas = sobre ? items.filter((i) => i.relacionado?.id === sobre) : items;
  const filaSel = SOBRES.find((s) => s.id === sobre);

  return (
    <div style={{ display: "grid", gap: 18 }}>
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
          etiquetaRaiz="Gastos del mes"
        />

        <KpiCard
          etiqueta={filaSel ? filaSel.etiqueta : "Total del mes"}
          valor={filaSel ? filaSel.valor : SOBRES.reduce((s, f) => s + f.valor, 0)}
          nota={filaSel ? "Seleccionado en el desglose" : "Seleccioná un sobre para desglosarlo"}
        />
      </div>

      <SectionHeader titulo="Qué investigar" nivel={3} />
      <InsightList items={filtradas} onDescartar={() => {}} />

      <SectionHeader titulo="Qué hacer" nivel={3} />
      <ActionStrip {...desdeAction(ACCION)} />
    </div>
  );
}
