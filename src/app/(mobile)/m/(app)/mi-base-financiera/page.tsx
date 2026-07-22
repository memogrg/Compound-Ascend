import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { computeV2Totals } from "@/modules/financial-base/engine/base-v2";
import type { FinancialPressure } from "@/modules/financial-base/types";
import { formatPercent } from "@/lib/format";
import { MobileHeader } from "../../components/mobile-header";
import {
  MContentCard,
  MSectionHeader,
  MDataRow,
  MMetricGrid,
  MMetricCard,
  MChip,
  MEmptyState,
  mAmount,
  type MTone,
} from "../../components/content-kit";
import { LiquidityManager } from "./liquidity-manager";

/**
 * /m/mi-base-financiera — paridad con la web /mi-base-financiera ("Mi Base Financiera",
 * nombre exacto de nav.ts). Vista general: presupuesto vs real del mes + lectura.
 * Reutiliza la MISMA orquestación de la web (loadBaseView) y el engine (computeV2Totals),
 * sin reimplementar cálculos. es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

const PRESSURE: Record<FinancialPressure, { label: string; tone: MTone }> = {
  baja: { label: "Baja", tone: "success" },
  media: { label: "Media", tone: "warning" },
  alta: { label: "Alta", tone: "warning" },
  critica: { label: "Crítica", tone: "danger" },
};

/**
 * Varianza con signo (+/-) formateada como %. El tono NO es el signo: gastar de menos
 * (varianza negativa en gastos) es bueno, ingresar de menos es malo — por eso lo decide
 * el caller según la fila, no esta función.
 */
function variance(pct: number): { text: string; over: boolean; flat: boolean } {
  const abs = formatPercent(Math.abs(pct));
  if (pct > 0.001) return { text: `+${abs}`, over: true, flat: false };
  if (pct < -0.001) return { text: `−${abs}`, over: false, flat: false };
  return { text: abs, over: false, flat: true };
}

export default async function MobileMiBase() {
  const view = await loadBaseView();

  if (!view) {
    return (
      <div className="m-scroll">
        <div className="m-pad">
          {/* Era la única pantalla (app) sin header: sin título ni forma de volver. */}
          <MobileHeader
            variant="inner"
            eyebrow="Presupuesto"
            title="Mi Base Financiera"
            backHref="/m"
            backLabel="Volver a Inicio"
          />
          <MEmptyState
            icon="rules"
            title="Aquí verás tu mes de un vistazo"
            description="Registra tus ingresos y gastos y esta pantalla te dirá cuánto planeaste, cuánto llevas y cuánto te queda libre."
            actionLabel="Registrar un gasto"
            actionHref="/m/gastos"
          />
        </div>
      </div>
    );
  }

  const { currency, budget, real, liquidity, baseReading, financialPressure, period } = view;
  const t = computeV2Totals({
    budgetIncome: budget.budgetIncome,
    realIncome: real.realIncome,
    budgetExpense: budget.budgetExpense,
    realExpense: real.realExpense,
  });
  const incVar = variance(t.incomeVariancePct);
  const expVar = variance(t.expenseVariancePct);
  const pressure = PRESSURE[financialPressure];

  return (
    <div className="m-scroll">
      <div className="m-pad">
        {/* `home` (logo C+ → Inicio) y no una flecha: a esta pantalla se llega desde el
            menú o desde Inicio, no desde un nivel superior, así que una flecha mentiría.
            Sin esto no había NINGUNA salida a Inicio: lo tapaba la barra de pestañas, y al
            quitarla se quedó sin ella. */}
        <MobileHeader
          variant="inner"
          home
          eyebrow={`Presupuesto · ${period.label}`}
          title="Mi Base Financiera"
        />
        <div className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 16 }}>
          Tu centro operativo: presupuesto vs real del mes.
        </div>

        {/* Liquidez (gestionable: fijar saldo inicial / ajustar saldo) */}
        <LiquidityManager
          balance={liquidity.balance}
          currency={liquidity.currency}
          hasOpening={liquidity.hasOpening}
        />

        {/* Presupuesto vs real: lo planeado (subtítulo) vs lo que llevas (valor), y el
            desvío como chip. El tono lo decide cada fila, no el signo: ingresar de menos
            es malo, gastar de menos es bueno.
            Sin tile de icono y "Plan" en vez de "Planeaste": la fila lleva cuatro datos y
            a 320px sólo quedan 129px para el subtítulo — medido, el tile no cabe en ningún
            escenario y "Planeaste ₡350 000" se corta por 14px. "Plan" ya es el vocabulario
            de esta pantalla. */}
        {/* El periodo ya lo lleva el eyebrow del header: no lo repetimos aquí. */}
        <MSectionHeader title="Presupuesto vs real" />
        <MContentCard style={{ marginBottom: 16 }}>
          <MDataRow
            title="Ingresos"
            subtitle={`Plan ${mAmount(budget.budgetIncome, currency)}`}
            value={mAmount(real.realIncome, currency)}
            trailing={
              incVar.flat ? undefined : (
                <MChip tone={incVar.over ? "success" : "danger"}>{incVar.text}</MChip>
              )
            }
          />
          <MDataRow
            title="Gastos"
            subtitle={`Plan ${mAmount(budget.budgetExpense, currency)}`}
            value={mAmount(real.realExpense, currency)}
            trailing={
              expVar.flat ? undefined : (
                <MChip tone={expVar.over ? "danger" : "success"}>{expVar.text}</MChip>
              )
            }
          />
        </MContentCard>

        {/* Métricas clave. La celda mide 106px útiles a 320px: medido, "₡350 000" entra
            con 14px de holgura pero "₡-420 000" deja 3px y "₡1 234 567" se sale 9px. De ahí
            el umbral 8 — conserva el número exacto en el caso común y abrevia justo los que
            no caben, en vez de truncarlos (un número cortado se malinterpreta). */}
        <MSectionHeader title="Tu mes en números" />
        <MMetricGrid style={{ marginBottom: 16 }}>
          <MMetricCard
            label="Flujo libre real"
            value={mAmount(t.freeCashflowReal, currency, 8)}
            sub={`${formatPercent(t.freeCashflowPct)} del ingreso`}
            tone={t.freeCashflowReal >= 0 ? "success" : "danger"}
          />
          <MMetricCard label="Gasto / ingreso" value={formatPercent(t.expenseRatio)} sub="ratio del mes" />
          <MMetricCard
            label="Presión financiera"
            value={<MChip tone={pressure.tone}>{pressure.label}</MChip>}
            sub="del mes"
          />
          <MMetricCard
            label="Movimientos"
            value={String(real.count)}
            sub={`${mAmount(real.avgDaily, currency, 9)}/día`}
          />
        </MMetricGrid>

        {/* Lectura (misma que la web: título + diagnóstico + insights + acciones + próximo paso).
            El título del engine es una frase ("Tu base está sana"), así que va como titular,
            no como eyebrow en versales: el eyebrow es el rótulo fijo de la sección. */}
        {baseReading ? (
          <>
            <MSectionHeader title="Lectura de tu base financiera" />
            <MContentCard>
              <div className="display" style={{ fontSize: 16 }}>
                {baseReading.title}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 6 }}>{baseReading.diagnosis}</div>
              {baseReading.insights.length > 0 ? (
                <div style={{ marginTop: 16 }}>
                  <div className="ov" style={{ marginBottom: 8 }}>
                    Insights
                  </div>
                  <ReadingList items={baseReading.insights} />
                </div>
              ) : null}
              {baseReading.actions.length > 0 ? (
                <div style={{ marginTop: 16 }}>
                  <div className="ov" style={{ marginBottom: 8 }}>
                    Acciones
                  </div>
                  <ReadingList items={baseReading.actions} accent />
                </div>
              ) : null}
              {baseReading.nextStep ? (
                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 12,
                    borderTop: "1px solid var(--border)",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  <span className="muted">Próximo paso: </span>
                  {baseReading.nextStep}
                </div>
              ) : null}
            </MContentCard>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ReadingList({ items, accent }: { items: string[]; accent?: boolean }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
      {items.map((it, i) => (
        <li key={i} className="row" style={{ alignItems: "flex-start", gap: 8, fontSize: 13, lineHeight: 1.45 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              marginTop: 6,
              flex: "none",
              background: accent ? "var(--accent)" : "var(--text-dim)",
            }}
            aria-hidden
          />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
