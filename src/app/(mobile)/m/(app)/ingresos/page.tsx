import { MobileHeader } from "../../components/mobile-header";
import {
  MSummaryCard,
  MSectionHeader,
  MContentCard,
  MDataRow,
  MMetricGrid,
  MMetricCard,
  MChip,
  MProgress,
  MEmptyState,
  mAmount,
} from "../../components/content-kit";
import { loadBaseView } from "@/modules/financial-base/services/base-view";
import type { BudgetItem } from "@/modules/financial-base/types";
import { convertCurrency } from "@/lib/fx";
import { formatMoney, formatPercent } from "@/lib/format";
import { IncomeManager } from "./income-manager";

/**
 * /m/ingresos — paridad con la web /ingresos (sistema V2). Las FUENTES son líneas
 * budget_items (income) y lo real son movimientos (transactions). Reutiliza EXACTAMENTE
 * la orquestación de la web (loadBaseView) + las mismas Server Actions V2 (vía
 * IncomeManager: register/update/deleteIncomeSourceAction + receivePartialIncomeAction).
 * Así lo capturado en móvil SÍ aparece en la web (misma tabla). es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

/** Fuente vinculada a inversiones (renta/dividendos) → read-only, como la web. */
function isLinked(b: BudgetItem): boolean {
  return Boolean(b.holdingId) || b.sourceKind === "dividend" || b.sourceKind === "rental";
}

export default async function MobileIngresos() {
  const view = await loadBaseView();

  if (!view) {
    return (
      <div className="m-scroll">
        <div className="m-pad">
          <MobileHeader variant="inner" eyebrow="Presupuesto" title="Ingresos" backHref="/m" backLabel="Volver a Inicio" />
          {/* Antes decía "Conecta Supabase para gestionar tus ingresos": un mensaje para
              quien programa, no para quien usa la app. */}
          <MEmptyState
            icon="salary"
            title="Aquí llevarás tus ingresos"
            description="Registra de dónde viene tu dinero cada mes y podrás ver cuánto has recibido de lo que planeaste."
            actionLabel="Volver a Inicio"
            actionHref="/m"
          />
        </div>
      </div>
    );
  }

  const { currency, budget, real, rates, incomeTree } = view;
  const incomeItems = budget.items.filter((b) => b.type === "income");
  const manualSources = incomeItems.filter((b) => (b.sourceKind ?? "manual") === "manual" && !isLinked(b));
  const linkedSources = incomeItems.filter(isLinked);
  const receivedNative = real.incomeReceivedBySourceNative;

  // Agregados en la moneda de display (misma lógica que IncomeSection en la web).
  const conv = (b: BudgetItem) => convertCurrency(b.amount, b.currency, currency, rates);
  const receivedOf = (b: BudgetItem) => real.incomeReceivedBySource[b.id] ?? 0;
  const linkedValueOf = (b: BudgetItem) => {
    const r = receivedOf(b);
    return r > 0 ? r : conv(b);
  };
  const budgetIncome =
    manualSources.reduce((s, b) => s + conv(b), 0) + linkedSources.reduce((s, b) => s + conv(b), 0);
  const realIncome =
    manualSources.reduce((s, b) => s + receivedOf(b), 0) +
    linkedSources.reduce((s, b) => s + linkedValueOf(b), 0);
  const diff = realIncome - budgetIncome;
  const complPct = budgetIncome > 0 ? realIncome / budgetIncome : 0;
  const totalSources = manualSources.length + linkedSources.length;
  // Lo que aún no has cobrado de lo que planeaste. Es el dato accionable del mes y no
  // estaba: se derivaba mentalmente de "Planificado" menos el hero.
  const pending = Math.max(0, budgetIncome - realIncome);
  // Ingreso que no depende de tu tiempo: las fuentes marcadas "pasivo" más las vinculadas a
  // inversiones (renta/dividendos), que lo son por definición. Se muestra como PARTE del
  // recibido (un %), no como mitad de una partición: "extraordinario" no es ni lo uno ni lo otro.
  const passiveIncome =
    manualSources
      .filter((b) => (b.incomeType ?? "activo") === "pasivo")
      .reduce((s, b) => s + receivedOf(b), 0) +
    linkedSources.reduce((s, b) => s + linkedValueOf(b), 0);
  const passivePct = realIncome > 0 ? passiveIncome / realIncome : 0;

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" eyebrow="Presupuesto" title="Ingresos" backHref="/m" backLabel="Volver a Inicio" />

        {/* Resumen: lo recibido (exacto mientras quepa) sobre lo planificado. */}
        <MSummaryCard
          eyebrow={`Ingresos del mes · ${view.period.label}`}
          value={mAmount(realIncome, currency, 11)}
          chip={budgetIncome > 0 ? <MChip tone={complPct >= 1 ? "success" : "neutral"}>{formatPercent(complPct)}</MChip> : undefined}
          sub={
            budgetIncome > 0
              ? `Recibido de ${formatMoney(budgetIncome, currency)} planificados este mes.`
              : "Aún no has planificado ingresos para este mes."
          }
          slot={budgetIncome > 0 ? <MProgress value={complPct} tone={complPct >= 1 ? "success" : "warning"} height={8} /> : undefined}
          style={{ marginBottom: 16 }}
        />

        {/* Métricas. "Planificado" y "% cumplimiento" ya viven en el resumen: aquí van los
            datos que NO están ahí. La celda es estrecha (~106px a 320px) → mAmount corto. */}
        <MSectionHeader title="Tu mes en números" />
        <MMetricGrid style={{ marginBottom: 16 }}>
          <MMetricCard
            label="Pendiente por recibir"
            value={mAmount(pending, currency, 8)}
            sub={pending > 0 ? "de lo planificado" : "todo cobrado"}
            tone={pending > 0 ? "warning" : "success"}
          />
          {/* Signo delante y valor absoluto, como los movimientos de Inicio: formatMoney
              antepone el símbolo, así que un negativo salía "₡-490 k" en vez de "−₡490 k".
              Y en cero no lleva signo: "+₡0" sugeriría que vas por encima del plan. */}
          <MMetricCard
            label="Diferencia"
            value={`${diff > 0 ? "+" : diff < 0 ? "−" : ""}${mAmount(Math.abs(diff), currency, 7)}`}
            sub="real − planificado"
            tone={diff > 0 ? "success" : diff < 0 ? "danger" : "neutral"}
          />
          <MMetricCard
            label="Ingreso pasivo"
            value={mAmount(passiveIncome, currency, 8)}
            sub={realIncome > 0 ? `${formatPercent(passivePct)} del recibido` : "sin ingresos aún"}
          />
          {/* La métrica cuenta manuales + vinculadas; la lista de abajo solo muestra las
              manuales, así que sin decirlo parecía que la app se contradecía ("Fuentes 4"
              sobre "3 fuentes"). El sub explica de qué se compone el número. */}
          <MMetricCard
            label="Fuentes"
            value={String(totalSources)}
            sub={linkedSources.length > 0 ? `${manualSources.length} manuales + ${linkedSources.length} vinculadas` : "este mes"}
          />
        </MMetricGrid>

        {/* Fuentes gestionables (V2: budget_items + movimiento real "Recibido") */}
        <MSectionHeader
          title="Tus fuentes"
          action={
            manualSources.length > 0 ? (
              <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                {manualSources.length} {manualSources.length === 1 ? "fuente" : "fuentes"}
              </span>
            ) : undefined
          }
        />
        <IncomeManager
          sources={manualSources}
          received={receivedNative}
          incomeTree={incomeTree}
          periodMonth={view.period.month}
          periodYear={view.period.year}
        />

        {/* Ingresos vinculados a inversiones (renta/dividendos) — read-only, como la web */}
        {linkedSources.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <MSectionHeader title="Vinculados a inversiones" />
            {/* El "gestiónalo en Patrimonio" iba en CADA subtítulo: se cortaba 58px a 320px y
                además repetía el mismo aviso por fila. Se dice una vez, al pie. */}
            <MContentCard>
              {linkedSources.map((b) => {
                const rec = receivedNative[b.id] ?? 0;
                return (
                  <MDataRow
                    key={b.id}
                    icon={b.sourceKind === "rental" ? "rental" : "investment"}
                    title={b.name}
                    subtitle={
                      b.sourceKind === "dividend" ? "Dividendos" : b.sourceKind === "rental" ? "Renta" : "Inversión"
                    }
                    value={mAmount(rec > 0 ? rec : b.amount, b.currency)}
                    valueTone="success"
                  />
                );
              })}
              <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.45, marginTop: 12 }}>
                Estos ingresos los generan tus activos: se editan desde Patrimonio.
              </div>
            </MContentCard>
          </div>
        ) : null}
      </div>
    </div>
  );
}
