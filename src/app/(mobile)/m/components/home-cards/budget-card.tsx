import { formatMoney } from "@/lib/format";

import { MChip, mAmount, type MTone } from "../content-kit";
import { MHomeCard, MHomeCardEmpty } from "./card-shell";

/**
 * Tarjeta 1 — PRESUPUESTO. Es la que abre la app, así que es la que más importa que
 * diga algo útil de un vistazo.
 *
 * Su dato viene de getExpenseRangeView, el agregador más barato de los siete: cero
 * llamadas de red, solo BD. Por eso esta tarjeta se renderiza con Inicio y no espera
 * a nada.
 */

/** Semáforo por RITMO, no por porcentaje a secas (ver `budgetTone`). */
type Ritmo = "bien" | "rapido" | "al-limite" | "excedido";

/**
 * El estado NO sale solo del % gastado: sale de compararlo con el % de mes
 * transcurrido. Gastar el 80% del presupuesto es tranquilo el día 28 y es una alarma
 * el día 10 — el mismo número significa cosas opuestas según cuándo se mire. Un
 * semáforo que ignore el calendario avisa tarde, que es como no avisar.
 *
 * `holgura` (12 pp) evita que ir un pelo por delante ya pinte ámbar: gastar en la
 * primera semana del mes es normal (alquiler, recibos) y no merece una alarma.
 */
function budgetTone(pctGastado: number, pctMes: number): Ritmo {
  if (pctGastado > 1) return "excedido";
  if (pctGastado >= 0.98) return "al-limite";
  return pctGastado > pctMes + 0.12 ? "rapido" : "bien";
}

const TONE_OF: Record<Ritmo, MTone> = {
  bien: "success",
  rapido: "warning",
  "al-limite": "danger",
  excedido: "danger",
};

const CHIP_OF: Record<Ritmo, string> = {
  bien: "En ritmo",
  rapido: "Vas rápido",
  "al-limite": "Al límite",
  excedido: "Excedido",
};

/** Días que quedan del mes, contando hoy. */
function diasRestantes(now: Date): number {
  const finDeMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(0, finDeMes - now.getDate() + 1);
}

/**
 * El mensaje dice lo que el número no: cuánto te queda y para cuántos días, o cuánto
 * te pasaste. Concreto y en segunda persona; nunca un consejo genérico.
 */
function mensaje(r: Ritmo, disponible: number, currency: string, dias: number): string {
  // UN mensaje por caso, no dos encadenados: juntar "vas rápido" con "te quedan X para
  // N días" se salía de las dos líneas a 320px y la frase acababa en "para 13…".
  if (r === "excedido")
    return `Superaste tu presupuesto por ${formatMoney(Math.abs(disponible), currency)}.`;
  if (r === "al-limite") return "Agotaste casi todo tu presupuesto del mes.";
  if (r === "rapido") return "Tu gasto avanza más rápido que el mes.";
  return `Te quedan ${formatMoney(disponible, currency)} para ${dias} ${dias === 1 ? "día" : "días"}.`;
}

/** Medidor compacto. El centro lleva el PORCENTAJE, nunca un importe: el agujero
 *  admite ~4 caracteres y en esta tarjeta es aún más pequeño que en Patrimonio. */
function Gauge({ pct, tone }: { pct: number; tone: MTone }) {
  const shown = Math.min(1, Math.max(0, pct));
  const color =
    tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--accent)";
  return (
    <span style={{ position: "relative", display: "inline-grid", placeItems: "center" }}>
      {/* 76px, no 84: el slot de la tarjeta mide 80px medidos (240 de alto menos el
          resto de las partes con sus márgenes), y a 84 el medidor se comía el
          subtexto. La caja manda sobre el visual, no al revés. */}
      <svg width="76" height="76" viewBox="0 0 42 42" aria-hidden>
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--surface-2)" strokeWidth={5} />
        <circle
          cx="21"
          cy="21"
          r="15.915"
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${shown * 100} ${100 - shown * 100}`}
          strokeDashoffset="25"
        />
      </svg>
      <span
        className="mono"
        style={{ position: "absolute", fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}
      >
        {Math.round(pct * 100)}%
      </span>
    </span>
  );
}

export function BudgetCard({
  budget,
  spent,
  currency,
  now,
}: {
  /** Presupuesto del mes (planificado). */
  budget: number;
  /** Gastado real del mes. */
  spent: number;
  currency: string;
  now: Date;
}) {
  // Sin presupuesto no hay porcentaje que enseñar: dividir por cero daría Infinity y
  // pintar un medidor al 0% sugeriría que vas bien cuando en realidad no has definido
  // nada. Estado vacío con verbo.
  if (budget <= 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Presupuesto"
        icon="rules"
        title="Define cuánto quieres gastar este mes y sabrás siempre cuánto te queda."
        cta="Define tu presupuesto"
        href="/m/gastos"
      />
    );
  }

  const pctGastado = spent / budget;
  const diasDelMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pctMes = now.getDate() / diasDelMes;
  const disponible = budget - spent;
  const ritmo = budgetTone(pctGastado, pctMes);
  const tone = TONE_OF[ritmo];

  return (
    <MHomeCard
      eyebrow="Presupuesto"
      value={mAmount(disponible, currency, 11)}
      chip={<MChip tone={tone}>{CHIP_OF[ritmo]}</MChip>}
      sub={`${mAmount(spent, currency, 9)} de ${mAmount(budget, currency, 9)}`}
      slot={<Gauge pct={pctGastado} tone={tone} />}
      message={mensaje(ritmo, disponible, currency, diasRestantes(now))}
      href="/m/gastos"
      ariaLabel={`Presupuesto del mes: ${CHIP_OF[ritmo]}. Ver gastos`}
    />
  );
}
