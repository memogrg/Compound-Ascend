/**
 * Los datos fijos de la sección «Lectura» de la galería. Puros, sin React, para que los
 * tests puedan comprobar la paleta sin montar nada.
 *
 * **Los colores son `--chart-1..6`, en orden fijo y asignados por sobre.** Categóricos, no
 * semánticos: `--c-expense` o `--c-savings` significan «gasto» y «ahorro», y usarlos para
 * distinguir sobres entre sí le diría a alguien que Transporte es «ahorro» porque le tocó ese
 * token. Los seis tokens de gráfico existen justamente para nombrar series sin opinar sobre
 * ellas.
 *
 * Los dos últimos van **sin color** a propósito: se pliegan en «Otros», que tampoco tiene
 * color propio. Darles uno sería teñir algo que no se pinta por separado.
 *
 * Los hijos también van sin color: dentro de un sobre, el nivel entero hereda el del sobre
 * (`colorDelNivel`), porque son la misma cosa desmenuzada y no seis cosas distintas.
 */
import type { FilaDesglose } from "@/components/lectura";
import type { DetectedInsight } from "@/lib/insights/types";
import type { Action } from "@/modules/actions/types";

export const SOBRES: FilaDesglose[] = [
  {
    id: "supermercado",
    etiqueta: "Supermercado",
    valor: 412500,
    color: "var(--chart-1)",
    hijos: [
      { id: "super-automercado", etiqueta: "Automercado", valor: 231000 },
      { id: "super-pali", etiqueta: "Palí", valor: 118500 },
      { id: "super-feria", etiqueta: "Feria", valor: 63000 },
    ],
  },
  { id: "casa", etiqueta: "Casa y servicios", valor: 298000, color: "var(--chart-2)" },
  { id: "transporte", etiqueta: "Transporte", valor: 164300, color: "var(--chart-3)" },
  { id: "salud", etiqueta: "Salud", valor: 97800, color: "var(--chart-4)" },
  { id: "disfrute", etiqueta: "Disfrute", valor: 86400, color: "var(--chart-5)" },
  { id: "educacion", etiqueta: "Educación", valor: 52000, color: "var(--chart-6)" },
  // Se pliegan en «Otros»: sin color, como «Otros».
  { id: "mascotas", etiqueta: "Mascotas", valor: 31200 },
  { id: "regalos", etiqueta: "Regalos", valor: 18900 },
];

/** Tres señales, una por severidad distinta; dos cuelgan de una categoría. */
export const INSIGHTS: (DetectedInsight & { id: string })[] = [
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

export const ACCION = {
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
