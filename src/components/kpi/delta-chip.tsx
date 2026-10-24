"use client";

import { formatMoney } from "@/lib/format";

/**
 * El cambio respecto a un periodo anterior, como chip.
 *
 * El color sale de DIRECCIÓN × SENTIDO, no del signo: en ingresos subir es bueno y en gastos
 * es malo, así que un «+» verde en Gastos sería una mentira. Y el color nunca va solo — hay
 * flecha, signo y un texto `sr-only` que dice «sube» o «baja», porque quien no distingue
 * rojo de verde tiene que poder leer lo mismo (WCAG 1.4.1).
 */
export type SentidoBueno = "arriba" | "abajo";

export type DescripcionDelta = {
  /** «+₡43.000», «−₡200.000» o «sin cambio». */
  texto: string;
  direccion: 1 | -1 | 0;
  tono: "bueno" | "malo" | "neutro";
  /** Lo que oye un lector de pantalla: «sube», «baja» o «sin cambio». */
  lectura: string;
  flecha: "↑" | "↓" | "→";
};

const MENOS = "−";

/**
 * Pura, para poder probarla. El cero es su propio caso: «+₡0» sugiere una subida que no hubo,
 * y pintarlo de verde o rojo inventa una valoración.
 */
export function describirDelta(
  valor: number,
  moneda: string,
  sentidoBueno: SentidoBueno,
): DescripcionDelta {
  if (!Number.isFinite(valor) || Math.round(valor) === 0) {
    return {
      texto: "sin cambio",
      direccion: 0,
      tono: "neutro",
      lectura: "sin cambio",
      flecha: "→",
    };
  }
  const sube = valor > 0;
  const bueno = (sentidoBueno === "arriba") === sube;
  return {
    texto: `${sube ? "+" : MENOS}${formatMoney(Math.abs(valor), moneda)}`,
    direccion: sube ? 1 : -1,
    tono: bueno ? "bueno" : "malo",
    lectura: sube ? "sube" : "baja",
    flecha: sube ? "↑" : "↓",
  };
}

export function DeltaChip({
  valor,
  moneda = "CRC",
  vsEtiqueta = "vs mes anterior",
  sentidoBueno,
}: {
  valor: number;
  moneda?: string;
  vsEtiqueta?: string;
  sentidoBueno: SentidoBueno;
}) {
  const d = describirDelta(valor, moneda, sentidoBueno);
  return (
    <span className="kpi-delta" data-tono={d.tono}>
      <span aria-hidden="true">{d.flecha}</span>
      <span className="kpi-delta-valor">{d.texto}</span>
      <span className="sr-only">{d.lectura}</span>
      <span className="kpi-delta-vs">{vsEtiqueta}</span>
    </span>
  );
}
