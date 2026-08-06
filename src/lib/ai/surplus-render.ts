/**
 * RENDER de la decisión del excedente (abonar vs invertir) para el asesor. PURO, sin "server-only":
 * recibe el reporte que YA calculó getSurplusDecision y lo redacta. Acá no se calcula ni una cifra.
 *
 * Existe por dos razones. Una: el mismo patrón determinista del informe de portafolio — el modelo
 * pasa este bloque TAL CUAL y ninguna cifra pasa por él. Dos: tres activos × tres escenarios + caída
 * máxima no entran en las 4-5 frases de la concisión dura; entregado ya renderizado, el tope
 * sobrevive porque el modelo no está escribiendo prosa.
 *
 * PRINCIPIO (el del motor, respetado acá): la app INFORMA, no ordena. Todo lo forward es un RANGO
 * con el peor caso visible; nunca una línea única, nunca un "hacé X".
 */
import { formatMoney } from "@/lib/format";
import type { SurplusDecisionReport } from "@/modules/wealth/services/surplus-decision-service";
import type { InvestProjection } from "@/modules/wealth/engine/surplus-decision";
import { DEBT_INVEST_THRESHOLD } from "@/modules/wealth/engine/surplus-decision";

/** Porcentaje con signo explícito y coma decimal ("+10%", "−57%"). */
function pct(ratio: number, dec = 0): string {
  const s = ratio < 0 ? "−" : "+";
  return `${s}${(Math.abs(ratio) * 100).toFixed(dec).replace(".", ",")}%`;
}

/** Años en texto ("10 años", "1 año"). */
function años(n: number): string {
  const r = Math.round(n);
  return `${r} ${r === 1 ? "año" : "años"}`;
}

/** Meses ahorrados en texto legible ("2 años y 3 meses"). */
function meses(n: number): string {
  const m = Math.max(0, Math.round(n));
  if (m < 12) return `${m} ${m === 1 ? "mes" : "meses"}`;
  const a = Math.floor(m / 12);
  const resto = m % 12;
  const parteA = `${a} ${a === 1 ? "año" : "años"}`;
  return resto === 0 ? parteA : `${parteA} y ${resto} ${resto === 1 ? "mes" : "meses"}`;
}

const BANDA: Record<string, string> = { peor: "peor", tipico: "típico", mejor: "mejor" };

export function renderSurplusDecision(r: SurplusDecisionReport): string {
  const money = (n: number) => formatMoney(n, r.currency);
  const out: string[] = [];

  // ── 1) Precondición F3: sin fondos de defensa cubiertos, esta comparación no aplica todavía ──
  if (!r.fundsCovered) {
    out.push("**Todavía no estás en esta decisión.**");
    out.push(
      "Comparar abonar deuda contra invertir tiene sentido DESPUÉS de cubrir tus fondos de defensa " +
        "(emergencia y paz). Antes de eso, tu excedente tiene un destino más urgente: ese colchón es " +
        "lo que evita que un imprevisto se convierta en deuda nueva.",
    );
    out.push(`Tu excedente mensual hoy es ${money(r.monthlySurplus)}.`);
    out.push(
      "_Cuando los dos fondos estén cubiertos, volvé a preguntarme y hacemos la comparación completa._",
    );
    return out.join("\n");
  }

  const encabezado = `Con un excedente de ${money(r.monthlySurplus)} al mes, a ${años(r.horizonYears)}:`;

  // ── 2) Gate: deuda por encima del umbral → solo el lado certeza ──
  if (r.gated) {
    const apr = r.apr !== null ? pct(r.apr, 1).replace("+", "") : null;
    out.push(encabezado);
    out.push(
      `Tu deuda${r.debtName ? ` (${r.debtName})` : ""}${apr ? ` está al ${apr} anual` : ""}, por encima del ` +
        `${pct(DEBT_INVEST_THRESHOLD).replace("+", "")}. Abonarla es un retorno GARANTIZADO que ningún activo ` +
        "supera con certeza, así que acá no planteo invertir: no es una preferencia, es aritmética.",
    );
    if (r.pay) {
      out.push(
        `- **Abonar**: te ahorra ${money(r.pay.interestSaved)} en intereses y adelanta el pago ` +
          `${meses(r.pay.monthsSaved)}. Es certeza, no escenario.`,
      );
    }
    out.push(cierre());
    return out.join("\n");
  }

  // ── 3) Comparación completa: certeza vs rango ──
  out.push(encabezado);
  if (r.pay) {
    out.push(
      `**Certeza — abonar${r.debtName ? ` ${r.debtName}` : " la deuda"}${r.apr !== null ? ` (${pct(r.apr, 1).replace("+", "")} anual)` : ""}:** ` +
        `${money(r.pay.interestSaved)} de intereses ahorrados y ${meses(r.pay.monthsSaved)} menos de deuda. ` +
        "Esto pasa sí o sí; no depende del mercado.",
    );
  } else {
    out.push(
      "**Certeza — abonar:** no tenés deuda registrada que abonar, así que este lado queda vacío.",
    );
  }

  if (r.invest.length > 0) {
    const contribuido = r.invest[0]!.contributed;
    out.push(
      `**Rango — invertir ese mismo excedente** (aportarías ${money(contribuido)} en total). ` +
        "Tres escenarios por activo, con la peor caída histórica a la vista:",
    );
    for (const p of r.invest) out.push(bloqueActivo(p, money));
  }

  out.push(cierre());
  return out.join("\n");
}

/** Un activo: sus tres escenarios, la caída máxima, el caveat si es astilla, y la fuente. */
function bloqueActivo(p: InvestProjection, money: (n: number) => string): string {
  const escenarios = p.scenarios
    .map((s) => `${BANDA[s.band] ?? s.band} ${pct(s.annualReturn, 1)} → ${money(s.endValue)}`)
    .join(" · ");
  const lineas = [
    `- **${p.label}**: ${escenarios}.`,
    `  Caída máxima histórica: ${pct(p.maxDrawdown)} — eso es lo que llegó a perder en el peor momento.`,
  ];
  if (p.sliver && p.caveat) lineas.push(`  ⚠ ${p.caveat}`);
  lineas.push(`  _Fuente: ${p.source}._`);
  return lineas.join("\n");
}

function cierre(): string {
  return (
    "\n_Los rangos son referencias históricas, no promesas: el pasado no garantiza el futuro y el " +
    "peor caso también es un caso. Esto es información para que decidas vos, no una instrucción._"
  );
}
