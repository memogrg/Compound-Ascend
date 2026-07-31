/**
 * RENDER del paquete de evidencia (Etapa A del carril "deep"): plantilla PURA, cero tokens. Toda
 * cifra viene del EvidencePack — acá no se calcula nada nuevo, solo se redacta.
 *
 * Tono de la app: claro, directo, sin moralina ni regaño. Una sección sin dato se imprime como una
 * línea honesta ("no puedo calcular X porque falta Y"), nunca se rellena ni se omite en silencio.
 */
import { formatMoney } from "@/lib/format";
import type { EvidencePack, SeccionFaltante } from "@/lib/ai/investment-report/evidence";
import {
  RENDIMIENTO_SUPUESTO,
  MESES_COLCHON_MINIMO,
  UMBRAL_CONCENTRACION,
} from "@/lib/ai/investment-report/evidence";

/** Porcentaje entero con coma decimal cuando se piden decimales ("12,5%"). */
function pct(ratio: number, dec = 0): string {
  return `${(ratio * 100).toFixed(dec).replace(".", ",")}%`;
}

/** Número con coma decimal (HHI, meses). */
function dec(n: number, d = 2): string {
  return n.toFixed(d).replace(".", ",");
}

const signo = (n: number): string => (n >= 0 ? "+" : "−");

/** Línea honesta de una sección que no se pudo armar. */
function falta(s: SeccionFaltante): string {
  return `${s.motivo.charAt(0).toUpperCase()}${s.motivo.slice(1)}. Para desbloquearla: ${s.desbloquea}.`;
}

export function renderEvidenceReport(pack: EvidencePack, currency: string): string {
  const money = (n: number) => formatMoney(n, currency);
  const out: string[] = ["# Informe de tu portafolio"];

  // ── Posiciones ──
  out.push("\n## Posiciones");
  if (!pack.posiciones.disponible) {
    out.push(falta(pack.posiciones));
  } else {
    const p = pack.posiciones;
    const totales: string[] = [];
    if (p.valorTotal !== undefined) totales.push(`vale ${money(p.valorTotal)}`);
    if (p.invertidoTotal !== undefined) totales.push(`invertiste ${money(p.invertidoTotal)}`);
    if (p.plTotal !== undefined)
      totales.push(`${p.plTotal >= 0 ? "ganás" : "perdés"} ${money(Math.abs(p.plTotal))} sobre lo invertido`);
    if (totales.length) out.push(`Tu portafolio ${totales.join("; ")}.`);
    for (const h of p.items) {
      const cierre = h.priceUnavailable
        ? "sin precio de mercado ahora (el valor mostrado es lo invertido)"
        : `vale ${money(h.valor)} · P/L ${signo(h.pl)}${money(Math.abs(h.pl))} (${signo(h.plPct)}${pct(Math.abs(h.plPct), 1)})`;
      out.push(`- **${h.etiqueta}** (${h.assetType}): invertido ${money(h.invertido)} · ${cierre}`);
    }
    if (p.masCount > 0) {
      out.push(`_Hay ${p.masCount} ${p.masCount === 1 ? "posición más" : "posiciones más"} que no entraron en este detalle._`);
    }
  }

  // ── Concentración ──
  out.push("\n## Concentración");
  if (!pack.concentracion.disponible) {
    out.push(falta(pack.concentracion));
  } else {
    const c = pack.concentracion;
    out.push(
      `Tu posición más grande es **${c.top1.etiqueta}**: ${money(c.top1.valor)}, ${pct(c.top1.pct)} del portafolio. ` +
        `Las tres más grandes suman ${pct(c.top3Pct)}. Índice de concentración (HHI): ${dec(c.hhi)} (1,00 = una sola posición).`,
    );
    out.push(`Mezcla por tipo: ${c.mezcla.map((m) => `${m.assetType} ${pct(m.pct)}`).join(" · ")}.`);
    if (c.alta)
      out.push(
        `Marcado como concentración **alta**: más de ${pct(UMBRAL_CONCENTRACION)} del valor está en una sola posición.`,
      );
    if (c.parcial) out.push("_Los porcentajes salen de las posiciones listadas arriba; hay otras que no entraron en el detalle._");
    if (c.preciosIncompletos)
      out.push("_Alguna posición no cotizó: para esa, el valor usado es lo invertido, no el de mercado._");
  }

  // ── Moneda ──
  out.push("\n## Moneda");
  if (!pack.moneda.disponible) {
    out.push(falta(pack.moneda));
  } else {
    const m = pack.moneda;
    out.push(
      `Tu moneda de referencia es ${m.principal}. Por moneda nativa de cada posición: ` +
        `${m.porMoneda.map((x) => `${x.currency} ${pct(x.pct)}`).join(" · ")}.`,
    );
    if (m.descalce) {
      out.push(
        `Dato: ${pct(m.dominante.pct)} de tu portafolio está en ${m.dominante.currency} y tu referencia es ${m.principal}. ` +
          `El valor en ${m.principal} se mueve con el tipo de cambio, además del precio del activo.`,
      );
    }
  }

  // ── Plan: brecha al Número de Independencia ──
  out.push("\n## Brecha a tu Número de Independencia");
  if (!pack.plan.disponible) {
    out.push(falta(pack.plan));
  } else {
    const p = pack.plan;
    const linea =
      p.brecha > 0
        ? `Tu patrimonio invertible es ${money(p.invertible)} y tu Número de Independencia es ${money(p.independencia)}: te faltan ${money(p.brecha)} (llevás ${pct(p.avancePct)}).`
        : `Tu patrimonio invertible (${money(p.invertible)}) ya cubre tu Número de Independencia (${money(p.independencia)}).`;
    out.push(linea);
    out.push(
      p.dcaMensual !== null
        ? `Tu aporte recurrente registrado (DCA) es ${money(p.dcaMensual)} al mes.`
        : "No tenés aporte recurrente (DCA) registrado, así que no puedo poner un ritmo mensual sobre esa brecha.",
    );
  }

  // ── Deuda vs. inversión ──
  out.push("\n## Deuda vs. inversión");
  if (!pack.deudaVsInversion.disponible) {
    out.push(falta(pack.deudaVsInversion));
  } else if (pack.deudaVsInversion.sinDeudas) {
    out.push("No tenés deudas registradas, así que no hay tasa que comparar contra el rendimiento supuesto.");
  } else {
    const d = pack.deudaVsInversion;
    const supuesto = pct(RENDIMIENTO_SUPUESTO);
    out.push(
      `Tu deuda de tasa más alta es **${d.nombre}**: ${pct(d.apr, 1)} anual sobre un saldo de ${money(d.saldo)}. ` +
        `Contra el rendimiento SUPUESTO del ${supuesto} anual (el mismo que usan tus Números), la diferencia es ` +
        `${signo(d.spreadPp)}${dec(Math.abs(d.spreadPp), 1)} puntos porcentuales${d.deudaCara ? " **a favor de la deuda**: te cuesta más de lo que ese supuesto rinde." : ": el supuesto queda por encima de esa tasa."}`,
    );
    out.push(`_El ${supuesto} es un supuesto de referencia, no un rendimiento garantizado ni el tuyo._`);
  }

  // ── Defensa ──
  out.push("\n## Defensa");
  if (!pack.defensa.disponible) {
    out.push(falta(pack.defensa));
  } else {
    out.push(`Tenés ${dec(pack.defensa.meses, 1)} meses de colchón (liquidez sobre tu gasto mensual).`);
    if (pack.defensa.invierteConColchonCorto)
      out.push(`Dato: estás invirtiendo con un colchón por debajo de ${MESES_COLCHON_MINIMO} meses.`);
  }

  // ── Frescura de precios ──
  out.push("\n## Frescura de los precios");
  if (pack.frescura.total === 0) {
    out.push("No hay posiciones listadas para cotizar.");
  } else if (pack.frescura.sinPrecio.length === 0) {
    out.push(`Las ${pack.frescura.total} posiciones listadas cotizaron con precio de mercado.`);
  } else {
    out.push(
      `${pack.frescura.sinPrecio.length} de ${pack.frescura.total} posiciones no cotizaron: ${pack.frescura.sinPrecio.join(", ")}. ` +
        "Para esas, las cifras de arriba usan lo invertido, no el valor de mercado.",
    );
  }

  // ── Banderas del diagnóstico ──
  out.push("\n## Banderas de tu diagnóstico patrimonial");
  if (pack.banderas.length === 0) {
    out.push("El diagnóstico patrimonial no levantó banderas.");
  } else {
    for (const b of pack.banderas) out.push(`- ${b}`);
  }

  out.push("\n_Esto es una fotografía de tus datos, no una recomendación de inversión._");
  return out.join("\n");
}
