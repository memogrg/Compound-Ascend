import type {
  PresupuestoCard,
  IngresosCard,
  GastosCard,
  AhorrosCard,
  DeudasCard,
  InversionesCard,
  ProteccionCard,
  PatrimonioCard,
  LibertadCard,
  Tone,
} from "@/modules/dashboard";
import type { DebtMethod } from "@/modules/control";
import type { RichTrend } from "@/modules/rich-life";

import { MChip, MVsMes, mAmount, type MTone } from "../content-kit";
import { MHomeCard, MHomeCardEmpty } from "./card-shell";
import { MHomeMeter } from "./meter";
import {
  FDonut,
  FGroupedBars,
  FRanking,
  FPayoff,
  FChecklist,
  FMilestones,
  FVal,
  FICHA_GREEN,
  FICHA_BLUE,
} from "./ficha-charts";

/**
 * Las 9 FICHAS del carrusel de Inicio (piloto · Delta 2), en el orden del brief:
 * Presupuesto · Ingresos · Gastos · Ahorros · Deudas · Inversiones · Protección ·
 * Patrimonio · Libertad. Todas sobre el MISMO chasis compartido (MHomeCard): mismo
 * footprint, mismo cristal, clickeables, texto a la izquierda / gráfico a la derecha
 * sin línea divisoria. Un ajuste de espaciado en MHomeCard/`.m-hcard` se propaga a las 9.
 *
 * Cada ficha sólo MAPEA su tipo de datos (de getHomeCardsData, Delta 1) a las props del
 * chasis + su gráfico; no recalcula nada. El "vs mes anterior" es Delta 3: aquí `vsMes`
 * es `null` y la ficha degrada sin flecha.
 */

const pct100 = (n: number) => Math.round(n * 100);

// ── 1 · Presupuesto ────────────────────────────────────────────────────────
export function PresupuestoFicha({ c, currency }: { c: PresupuestoCard; currency: string }) {
  // Sin base declarada (ni ingresos ni gastos): no hay flujo que mostrar.
  if (c.plan.income <= 0 && c.plan.expense <= 0 && c.flujoReal === 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Flujo del mes"
        icon="rules"
        title="Registra tus ingresos y gastos base y verás tu flujo del mes de un vistazo."
        cta="Empezar por tu base"
        href={c.href}
      />
    );
  }
  const sin = pct100(c.pctSinPresupuesto);
  // Mes recién arrancado: hay base (plan), pero aún no hay movimientos reales. NO se
  // compara el flujo a la fecha (0) contra el plan de mes completo (daría "por debajo"
  // por construcción); se dice la verdad: la proyección de tu base.
  const mesFresco = c.barras.ingreso.real === 0 && c.barras.gasto.real === 0;
  // La proyección (flujo libre de tu base) vive AQUÍ y solo aquí en todo el home.
  const proj =
    c.plan.free >= 0
      ? `proyecta ${mAmount(c.plan.free, currency, 8)} libres/mes`
      : `gasta ${mAmount(Math.abs(c.plan.free), currency, 8)} de más al mes`;
  return (
    <MHomeCard
      eyebrow="Flujo del mes"
      value={
        <FVal tone={c.flujoTone}>
          {c.flujoReal >= 0 ? "+" : "−"}
          {mAmount(Math.abs(c.flujoReal), currency, 10)}
        </FVal>
      }
      chip={sin > 0 ? <MChip tone="warning">{sin}% sin plan</MChip> : undefined}
      sub="operativo real"
      vis={<FGroupedBars ingreso={c.barras.ingreso} gasto={c.barras.gasto} currency={currency} />}
      message={mesFresco ? `Mes recién arrancado — tu base ${proj}.` : `Tu base ${proj}.`}
      href={c.href}
      ariaLabel="Flujo del mes: real frente a tu base. Ver gastos"
    />
  );
}

// ── 2 · Ingresos ───────────────────────────────────────────────────────────
export function IngresosFicha({ c, currency }: { c: IngresosCard; currency: string }) {
  if (c.real <= 0 && c.plan <= 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Ingresos"
        icon="income"
        title="Registra lo que entra cada mes y sabrás con cuánto cuentas de verdad."
        cta="Registra tus ingresos"
        href={c.href}
      />
    );
  }
  const total = c.activo + c.pasivo;
  const pctPasivo = total > 0 ? c.pasivo / total : 0;
  return (
    <MHomeCard
      eyebrow="Ingresos"
      value={<FVal tone="pos">{mAmount(c.real, currency, 10)}</FVal>}
      chip={
        c.plan > 0 ? (
          <MChip tone={c.pctDelPlan >= 1 ? "success" : "neutral"}>
            {pct100(c.pctDelPlan)}% del plan
          </MChip>
        ) : undefined
      }
      sub={`Plan ${mAmount(c.plan, currency, 8)}`}
      vis={
        <FDonut
          slices={[
            { label: "Activo", value: c.activo, color: FICHA_GREEN },
            { label: "Pasivo", value: c.pasivo, color: FICHA_BLUE },
          ]}
          currency={currency}
        />
      }
      message={
        c.pasivo <= 0
          ? "Todo depende de tu trabajo."
          : pctPasivo >= 0.5
            ? "Más de la mitad trabaja sola."
            : `${pct100(pctPasivo)}% ya trabaja solo.`
      }
      href={c.href}
      ariaLabel="Ingresos del mes. Ver ingresos"
    />
  );
}

// ── 3 · Gastos ─────────────────────────────────────────────────────────────
export function GastosFicha({ c, currency }: { c: GastosCard; currency: string }) {
  if (c.real <= 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Gastos"
        icon="food"
        title="Registra tus gastos y verás claro en qué se va tu dinero."
        cta="Registra un gasto"
        href={c.href}
      />
    );
  }
  const sin = pct100(c.pctSinPresupuesto);
  return (
    <MHomeCard
      eyebrow="Gastos"
      value={<FVal tone="neg">{mAmount(c.real, currency, 10)}</FVal>}
      chip={sin > 0 ? <MChip tone="warning">{sin}% sin sobre</MChip> : undefined}
      sub={
        c.plan > 0
          ? `${pct100(c.pctDelPlan)}% del plan (${mAmount(c.plan, currency, 7)})`
          : "sin plan"
      }
      vis={<FRanking items={c.topSobres} currency={currency} />}
      message={c.pctDelPlan > 1 ? "Te pasaste de tu plan del mes." : "Dentro de tu plan del mes."}
      href={c.href}
      ariaLabel="Gastos del mes por sobre. Ver gastos"
    />
  );
}

// ── 4 · Ahorros ────────────────────────────────────────────────────────────
export function AhorrosFicha({ c, currency }: { c: AhorrosCard; currency: string }) {
  if (c.numMetas === 0 || c.meta <= 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Ahorros"
        icon="goal"
        title="Crea una meta y verás crecer tu respaldo mes a mes aquí."
        cta="Crea tu primera meta"
        href={c.href}
      />
    );
  }
  const rez = c.rezagadas[0];
  return (
    <MHomeCard
      eyebrow="Ahorros"
      value={<FVal tone="pos">{mAmount(c.ahorrado, currency, 10)}</FVal>}
      delta={c.vsMes ? <MVsMes vs={c.vsMes} currency={currency} /> : undefined}
      chip={
        c.pct >= 1 ? (
          <MChip tone="success">Meta ✓</MChip>
        ) : (
          <MChip tone="neutral">{pct100(c.pct)}%</MChip>
        )
      }
      sub={`Meta ${mAmount(c.meta, currency, 7)} · faltan ${mAmount(c.falta, currency, 7)}`}
      vis={
        <MHomeMeter
          pct={c.pct}
          label={`${c.numMetas} ${c.numMetas === 1 ? "meta" : "metas"}`}
          color="var(--accent)"
        />
      }
      message={
        rez
          ? `Más rezagada: ${rez.name} (${pct100(rez.progress)}%).`
          : `Aportas ${mAmount(c.aporteMensual, currency, 8)}/mes.`
      }
      href={c.href}
      ariaLabel="Ahorro hacia tus metas. Ver metas"
    />
  );
}

// ── 5 · Deudas ─────────────────────────────────────────────────────────────
const DEBT_METHOD_LABEL: Record<DebtMethod, string> = {
  avalancha: "Avalancha",
  bola_nieve: "Bola de nieve",
  hibrido: "Híbrido",
};

export function DeudasFicha({ c, currency }: { c: DeudasCard; currency: string }) {
  if (c.total <= 0 || c.numDeudas === 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Deudas"
        icon="debt"
        title="No tienes deudas registradas. Si aparece alguna, verás cuánto pesa."
        cta="Registrar una deuda"
        href={c.href}
      />
    );
  }
  return (
    <MHomeCard
      eyebrow="Deudas"
      value={<FVal tone="neg">{mAmount(c.total, currency, 10)}</FVal>}
      delta={c.vsMes ? <MVsMes vs={c.vsMes} currency={currency} /> : undefined}
      chip={c.metodo ? <MChip tone="neutral">{DEBT_METHOD_LABEL[c.metodo]}</MChip> : undefined}
      sub={`${c.numDeudas} ${c.numDeudas === 1 ? "deuda" : "deudas"}`}
      vis={<FPayoff total={c.total} mesesACierre={c.mesesACierre} currency={currency} />}
      message={
        c.mesesACierre != null
          ? `Libre en ${c.mesesACierre} ${c.mesesACierre === 1 ? "mes" : "meses"} al ritmo actual.`
          : "Sube tus abonos para proyectar el cierre."
      }
      href={c.href}
      ariaLabel="Deudas y proyección de cierre. Ver deudas"
    />
  );
}

// ── 6 · Inversiones ────────────────────────────────────────────────────────
export function InversionesFicha({ c, currency }: { c: InversionesCard; currency: string }) {
  if (c.numActivos === 0 || (c.valorActual <= 0 && c.invertido <= 0)) {
    return (
      <MHomeCardEmpty
        eyebrow="Inversiones"
        icon="investment"
        title="Pon tu dinero a trabajar y aquí verás cuánto crece."
        cta="Registra una inversión"
        href={c.href}
      />
    );
  }
  const g = pct100(c.gananciaPct);
  return (
    <MHomeCard
      eyebrow="Inversiones"
      value={mAmount(c.valorActual, currency, 10)}
      delta={c.vsMes ? <MVsMes vs={c.vsMes} currency={currency} /> : undefined}
      chip={
        <MChip
          tone={
            c.gananciaTone === "pos" ? "success" : c.gananciaTone === "neg" ? "danger" : "neutral"
          }
        >
          {c.ganancia >= 0 ? "+" : "−"}
          {Math.abs(g)}%
        </MChip>
      }
      sub={`Invertido ${mAmount(c.invertido, currency, 8)}`}
      vis={
        <FDonut
          slices={[
            { label: "Largo plazo", value: c.naturaleza.growth.value, color: FICHA_GREEN },
            { label: "Flujo", value: c.naturaleza.cashflow.value, color: FICHA_BLUE },
            {
              label: "Sin clasif.",
              value: c.naturaleza.sinClasificar.value,
              color: "var(--text-dim)",
            },
          ]}
          currency={currency}
        />
      }
      message={
        c.ganancia >= 0
          ? `Ganas ${mAmount(c.ganancia, currency, 8)} (${g}%).`
          : `Pierdes ${mAmount(Math.abs(c.ganancia), currency, 8)} (${g}%).`
      }
      href={c.href}
      ariaLabel="Portafolio de inversiones. Ver inversiones"
    />
  );
}

// ── 7 · Protección ─────────────────────────────────────────────────────────
const SHORT_PROT: Record<string, string> = {
  auto: "Auto",
  vida: "Vida",
  medico: "Médico",
  fondo_emergencia: "Emergencia",
  fondo_paz: "Paz",
};

export function ProteccionFicha({ c, currency }: { c: ProteccionCard; currency: string }) {
  const nadaCubierto = c.checklist.every((i) => !i.covered);
  if (c.numActivas === 0 && nadaCubierto) {
    return (
      <MHomeCardEmpty
        eyebrow="Protección"
        icon="protection"
        title="Una póliza evita que un imprevisto se lleve lo que construiste."
        cta="Registra tu protección"
        href={c.href}
      />
    );
  }
  const items = c.checklist.map((i) => ({
    key: i.key,
    label: SHORT_PROT[i.key] ?? i.label,
    covered: i.covered,
  }));
  const fondos = c.fondos.emergencia + c.fondos.paz;
  const primaTxt = `prima ${mAmount(c.primaAnual, currency, 7)}/año`;
  const polizasTxt = `${c.numActivas} ${c.numActivas === 1 ? "póliza" : "pólizas"}`;
  return (
    <MHomeCard
      eyebrow="Protección"
      value={mAmount(c.montoProtegido, currency, 10)}
      chip={
        c.huecos > 0 ? (
          <MChip tone="danger">{c.huecos} sin cubrir</MChip>
        ) : (
          <MChip tone="success">Completa</MChip>
        )
      }
      sub={
        <>
          Pólizas {mAmount(c.coberturaPolizas, currency, 7)} · Fondos {mAmount(fondos, currency, 7)}
        </>
      }
      vis={<FChecklist items={items} />}
      message={
        c.huecos > 0
          ? `${polizasTxt} · ${primaTxt} · te faltan ${c.huecos} de 5 base`
          : `${polizasTxt} · ${primaTxt} · 5 base cubiertas`
      }
      href={c.href}
      ariaLabel="Protección: pólizas más fondos de defensa. Ver protección"
    />
  );
}

// ── 8 · Patrimonio ─────────────────────────────────────────────────────────
const TREND: Record<RichTrend, { label: string; tone: MTone } | null> = {
  mas_rico: { label: "Más rico", tone: "success" },
  estable: { label: "Estable", tone: "neutral" },
  mas_pobre: { label: "Más pobre", tone: "danger" },
  en_curso: null, // mes sin cerrar: sin chip, no un veredicto a medias
  sin_historico: null,
};

export function PatrimonioFicha({ c, currency }: { c: PatrimonioCard; currency: string }) {
  if (c.activos <= 0 && c.pasivos <= 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Patrimonio"
        icon="household"
        title="Registra lo que tienes y lo que debes para ver tu patrimonio crecer."
        cta="Registra tu patrimonio"
        href={c.href}
      />
    );
  }
  const t = TREND[c.veredicto];
  const netoTone: Tone = c.neto > 0 ? "pos" : c.neto < 0 ? "neg" : "neutral";
  return (
    <MHomeCard
      eyebrow="Patrimonio"
      value={<FVal tone={netoTone}>{mAmount(c.neto, currency, 10)}</FVal>}
      delta={c.vsMes ? <MVsMes vs={c.vsMes} currency={currency} /> : undefined}
      chip={t ? <MChip tone={t.tone}>{t.label}</MChip> : undefined}
      sub={`Activos ${mAmount(c.activos, currency, 7)} · Deudas ${mAmount(c.pasivos, currency, 7)}`}
      vis={
        <FDonut
          slices={[
            { label: "Productivo", value: c.productivos.value, color: FICHA_GREEN },
            { label: "No produce", value: c.noProductivos.value, color: FICHA_BLUE },
          ]}
          currency={currency}
        />
      }
      message={
        c.productivos.pct >= 0.6
          ? "Casi todo tu patrimonio ya produce."
          : `${pct100(1 - c.productivos.pct)}% aún no produce.`
      }
      href={c.href}
      ariaLabel="Patrimonio neto. Ver patrimonio"
    />
  );
}

// ── 9 · Libertad ───────────────────────────────────────────────────────────
const SHORT_HITO: Record<string, string> = {
  ninguno: "Partida",
  seguridad: "Seguridad",
  independencia: "Independ.",
  libertad: "Libertad",
};

export function LibertadFicha({ c, currency }: { c: LibertadCard; currency: string }) {
  const indep = c.hitos[2]; // Independencia
  if (!indep || indep.amount <= 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Libertad"
        icon="goal"
        title="Marca tus gastos esenciales y verás aquí tu primer hito de libertad."
        cta="Marcar esenciales"
        href="/m/gastos"
      />
    );
  }
  // El hito EN CURSO (ámbar) es la "fase actual": hacia dónde vas, no lo último que pasaste.
  // Si no hay ninguno en curso, alcanzaste todos los hitos.
  const current = c.hitos.find((h) => h.state === "current");
  const faltaCurrent = current ? Math.max(0, current.amount - c.actual) : 0;
  const currentHasMeta = current != null && current.amount > 0;
  return (
    <MHomeCard
      eyebrow="Libertad"
      value={mAmount(c.actual, currency, 9)}
      chip={
        current ? (
          <MChip tone="warning">{SHORT_HITO[current.key] ?? current.label}</MChip>
        ) : (
          <MChip tone="success">Libertad ✓</MChip>
        )
      }
      sub={
        current
          ? currentHasMeta
            ? `Meta ${mAmount(current.amount, currency, 7)} · faltan ${mAmount(faltaCurrent, currency, 7)}`
            : `Define tu meta de ${current.label}`
          : "¡Alcanzaste todos los hitos!"
      }
      vis={
        <FMilestones
          steps={c.hitos.map((h) => ({
            label: SHORT_HITO[h.key] ?? h.label,
            amount: h.amount,
            pct: h.pct,
            state: h.state,
          }))}
          currency={currency}
        />
      }
      message={
        c.fase !== "ninguno" ? `Ya alcanzaste ${c.faseLabel}.` : "Tu primer hito: Seguridad."
      }
      href={c.href}
      ariaLabel="Escalera de libertad financiera. Valor actual y hito en curso. Ver libertad"
    />
  );
}
