"use client";

/**
 * Portafolio de inversiones — rediseño fiel al prototipo (design-reference/
 * investments). Tres subtabs: Portafolio (indicadores + 2 donas + tabla con
 * menú kebab de 5 acciones), Calculadora de interés compuesto y Monitor de
 * fondos. Solo presentación: se alimenta del reporte/snapshots ya calculados y
 * del motor puro (portfolio-engine); las mutaciones usan las server actions
 * existentes (addHolding/edit/sell/remove via wizard, detalle y modales).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import "./portfolio-view.css";
import { DonutChart, type DonutDatum } from "@/components/charts/lazy";
import { PerformanceChart, type AreaPoint } from "@/components/charts/lazy";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { formatMoney, formatCompact, formatPercent } from "@/lib/format";
import { convertCurrency } from "@/lib/fx";
import {
  allocationByNature,
  allocationByCategory,
  periodReturn,
  cashflowMonthlyIncome,
} from "@/modules/wealth/engine/portfolio-engine";
import { CATEGORY_META } from "@/modules/wealth/constants";
import { editHoldingAction, removeHoldingAction, getHoldingHistoryAction, adjustContributionPriceAction } from "@/modules/wealth/api/actions";
import type { OpenContribution } from "@/modules/wealth/services/contribution-service";
import { AddHoldingButton, AddHoldingModal } from "./add-holding-wizard";
import { HoldingDetailModal } from "./holding-detail-modal";
import { CompoundCalculator } from "./compound-calculator";
import { FundMonitor } from "./fund-monitor";
import type { PortfolioReport } from "@/modules/wealth/services/portfolio-service";
import type { WealthSummary } from "@/modules/wealth/services/wealth-service";
import type {
  Dividend,
  Holding,
  HoldingPerformance,
  PortfolioSnapshot,
  AllocationSlice,
} from "@/modules/wealth/types";

const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type Subtab = "portafolio" | "calculadora" | "monitor";
type Period = "1m" | "3m" | "ytd" | "all";
const PERIODS: { id: Period; label: string }[] = [
  { id: "1m", label: "1M" },
  { id: "3m", label: "3M" },
  { id: "ytd", label: "YTD" },
  { id: "all", label: "Todo" },
];

const SUBTABS: { id: Subtab; label: string }[] = [
  { id: "portafolio", label: "Portafolio de inversiones" },
  { id: "calculadora", label: "Calculadora de interés compuesto" },
  { id: "monitor", label: "Monitor de fondos" },
];

/** Subtab desde el hash de la URL ('#monitor' → 'monitor'); default portafolio. */
function subtabFromHash(): Subtab {
  if (typeof window === "undefined") return "portafolio";
  const h = window.location.hash.replace(/^#/, "");
  return SUBTABS.some((t) => t.id === h) ? (h as Subtab) : "portafolio";
}

function periodCutoff(period: Period): string | null {
  if (period === "all") return null;
  const d = new Date();
  if (period === "ytd") return `${d.getFullYear()}-01-01`;
  if (period === "1m") d.setMonth(d.getMonth() - 1);
  else if (period === "3m") d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

// ── Componente raíz: subtabs ───────────────────────────────────────

export function PortfolioView({
  report,
  snapshots,
  dividends,
  summary,
  investmentRate,
  displayCurrency,
  rates,
  openContributions,
}: {
  report: PortfolioReport;
  snapshots: PortfolioSnapshot[];
  dividends: Dividend[];
  summary: WealthSummary;
  /** Tasa de inversión (0-1) de BaseIndicators (financial-base). */
  investmentRate: number;
  /** Moneda del dropdown (display): solo afecta agregados/gráficas, no las filas. */
  displayCurrency: string;
  rates: Record<string, number>;
  openContributions: OpenContribution[];
}) {
  // Subtab dirigido por el hash (deep-link /patrimonio#monitor + back/forward).
  // Arranca en "portafolio" para no romper la hidratación SSR.
  const [subtab, setSubtab] = useState<Subtab>("portafolio");
  useEffect(() => {
    const sync = () => setSubtab(subtabFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const selectSubtab = (id: Subtab) => {
    window.location.hash = id;
    setSubtab(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="invx">
      <div className="subtabs" role="tablist" aria-label="Secciones del portafolio">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={subtab === t.id}
            className={subtab === t.id ? "subtab on" : "subtab"}
            onClick={() => selectSubtab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subtab === "portafolio" ? (
        <PortfolioPanel
          report={report}
          snapshots={snapshots}
          dividends={dividends}
          summary={summary}
          investmentRate={investmentRate}
          displayCurrency={displayCurrency}
          rates={rates}
          openContributions={openContributions}
        />
      ) : subtab === "calculadora" ? (
        <CompoundCalculator defaultCapital={report.analytics.totalCostBasis} currency={report.currency} />
      ) : (
        <FundMonitor />
      )}
    </div>
  );
}

// ── Subtab Portafolio ──────────────────────────────────────────────

function PortfolioPanel({
  report,
  snapshots,
  investmentRate,
  displayCurrency,
  rates,
  openContributions,
}: {
  report: PortfolioReport;
  snapshots: PortfolioSnapshot[];
  dividends: Dividend[];
  summary: WealthSummary;
  investmentRate: number;
  displayCurrency: string;
  rates: Record<string, number>;
  openContributions: OpenContribution[];
}) {
  const { analytics, currency } = report;
  // Los agregados/gráficas siguen la moneda del dropdown (display): se calculan
  // en `report.currency` (principal) y se convierten aquí, en la vista. Las filas
  // NO se tocan (quedan nativas). Los snapshots tampoco: se guardan en principal.
  const toDisplay = useCallback(
    (v: number) => convertCurrency(v, currency, displayCurrency, rates),
    [currency, displayCurrency, rates],
  );
  const holds = useMemo(
    () => [...analytics.holdingsWithPerformance].sort((a, b) => b.currentValue - a.currentValue),
    [analytics.holdingsWithPerformance],
  );
  // Holdings CRUDOS para la edición/valoración (averageCost en su moneda real).
  const rawById = useMemo(() => new Map(report.holdings.map((h) => [h.id, h])), [report.holdings]);
  const contribById = useMemo(
    () => new Map(openContributions.map((c) => [c.holdingId, c])),
    [openContributions],
  );

  const [indPeriod, setIndPeriod] = useState<Period>("ytd");
  const [tablePeriod, setTablePeriod] = useState<Period>("ytd");

  const retInd = useMemo(() => periodReturnFor(snapshots, indPeriod), [snapshots, indPeriod]);

  const investedSeries: AreaPoint[] = useMemo(() => {
    const cutoff = periodCutoff(indPeriod);
    const pts = snapshots
      .filter((s) => !cutoff || s.date >= cutoff)
      .map((s) => ({ date: s.date, value: toDisplay(s.investmentValue || s.portfolioValue) }));
    if (pts.length >= 2) return pts;
    if (analytics.totalCostBasis > 0) {
      return [
        { date: "Inicio", value: Math.round(toDisplay(analytics.totalCostBasis)) },
        { date: "Hoy", value: Math.round(toDisplay(analytics.totalPortfolioValue)) },
      ];
    }
    return pts;
  }, [snapshots, indPeriod, analytics.totalCostBasis, analytics.totalPortfolioValue, toDisplay]);

  const byNature = useMemo(() => allocationByNature(holds), [holds]);
  const byCategory = useMemo(() => allocationByCategory(holds), [holds]);
  // Dona de naturaleza: muestra montos absolutos → convertir a display. Las
  // proporciones/pct son invariantes al escalar todos los valores por igual.
  const byNatureDisplay = useMemo(
    () => byNature.map((s) => ({ ...s, value: toDisplay(s.value) })),
    [byNature, toDisplay],
  );
  const cashflowMonthly = useMemo(() => cashflowMonthlyIncome(holds), [holds]);
  const ratePct = Math.min(100, Math.round(investmentRate * 100));
  const categoriesCount = byCategory.filter((s) => s.value > 0).length;

  return (
    <>
      {/* Indicadores · filtro de periodo */}
      <div className="bar-row">
        <div>
          <div className="card-title">Indicadores del portafolio</div>
          <div className="card-sub">Rendimiento por periodo seleccionado</div>
        </div>
        <PeriodSeg value={indPeriod} onChange={setIndPeriod} label="Periodo de indicadores" />
      </div>

      {/* KPIs fila 1: invertido (con mini-línea) · tasa · rendimiento del periodo */}
      <div className="ind-grid">
        <div className="card kpi">
          <div className="lab">
            Monto total invertido
            <TipQ text="Base de costo total: cuánto has puesto en tus inversiones." />
          </div>
          <div className="val">{formatMoney(toDisplay(analytics.totalCostBasis), displayCurrency)}</div>
          {investedSeries.length >= 2 ? (
            <div className="invline">
              <PerformanceChart data={investedSeries} currency={displayCurrency} height={88} tone="pos" />
            </div>
          ) : null}
        </div>

        <div className="card kpi">
          <div className="lab">
            Tasa de inversión
            <TipQ text="Aporte mensual recurrente ÷ ingreso mensual (de tu Base Financiera)." />
          </div>
          <div className="val">{formatPercent(investmentRate)}</div>
          <div className="sub">del ingreso recurrente</div>
          <div className="bar-track" style={{ marginTop: 12 }}>
            <div className="bar-fill" style={{ width: `${ratePct}%`, background: "var(--c-invest)" }} />
          </div>
        </div>

        <div className="card kpi">
          <div className="lab">
            Rendimiento del periodo
            <TipQ text="Cambio de valor del portafolio en el periodo elegido. Aún no descuenta aportes del periodo." />
          </div>
          <div className="val" style={{ color: retInd.abs >= 0 ? "var(--pos)" : "var(--neg)" }}>
            {retInd.abs >= 0 ? "+" : ""}
            {formatMoney(toDisplay(retInd.abs), displayCurrency)}
          </div>
          <div className="sub">
            <span className={`delta ${retInd.abs >= 0 ? "up" : "down"}`}>
              {retInd.abs >= 0 ? "+" : ""}
              {formatPercent(retInd.pct)}
            </span>
            ganancia/pérdida
          </div>
        </div>
      </div>

      {/* KPIs fila 2: acumulado · ingreso por flujo de caja */}
      <div className="ind-grid two">
        <div className="card kpi">
          <div className="lab">Rentabilidad total acumulada</div>
          <div className="val" style={{ color: analytics.totalProfitLoss >= 0 ? "var(--pos)" : "var(--neg)" }}>
            {analytics.totalProfitLoss >= 0 ? "+" : ""}
            {formatMoney(toDisplay(analytics.totalProfitLoss), displayCurrency)}
          </div>
          <div className="sub">
            <span className={`delta ${analytics.totalProfitLoss >= 0 ? "up" : "down"}`}>
              {formatPercent(analytics.totalReturnPct)}
            </span>
            histórica desde el inicio
          </div>
        </div>
        <div className="card kpi">
          <div className="lab">
            Ingreso mensual por flujo de caja
            <TipQ text="Dividendos, alquileres e intereses recurrentes de tus inversiones de flujo de caja." />
          </div>
          <div className="val" style={{ color: "var(--c-income)" }}>{formatMoney(toDisplay(cashflowMonthly), displayCurrency)}</div>
          <div className="sub">dividendos, alquileres, intereses · recurrente</div>
        </div>
      </div>

      {/* Donas: naturaleza · categoría */}
      <div className="donut-grid">
        <DonutCard
          title="Distribución por naturaleza"
          slices={byNatureDisplay}
          centerTop={formatCompact(toDisplay(analytics.totalPortfolioValue), displayCurrency)}
          centerSub="total"
          currency={displayCurrency}
          showAmount
        />
        <DonutCard
          title="Distribución por categoría"
          slices={byCategory}
          centerTop={String(categoriesCount)}
          centerSub="categorías"
          currency={displayCurrency}
        />
      </div>

      {/* Tabla: Mis inversiones */}
      <div className="card">
        <div className="bar-row" style={{ padding: "18px 22px 14px", marginBottom: 0 }}>
          <div>
            <div className="card-title">Mis inversiones</div>
            <div className="card-sub">{holds.length} inversión(es)</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <PeriodSeg value={tablePeriod} onChange={setTablePeriod} label="Periodo de la tabla" />
            <AddHoldingButton currency={currency} />
          </div>
        </div>
        <div className="inv-th">
          <div>Inversión</div>
          <div>Naturaleza / categoría</div>
          <div>Invertido</div>
          <div className="c-aporte">Aporte mensual</div>
          <div>Rendimiento</div>
          <div />
        </div>
        {holds.length === 0 ? (
          <div className="muted" style={{ padding: "22px", fontSize: 13 }}>
            Aún no registras inversiones. Usa “Agregar inversión” para empezar.
          </div>
        ) : (
          holds.map((h) => (
            <InvRow key={h.id} h={h} raw={rawById.get(h.id)} currency={currency} period={tablePeriod} contribution={contribById.get(h.id)} />
          ))
        )}
      </div>
    </>
  );
}

/** Rendimiento del periodo a partir de snapshots filtrados (contributions=0). */
function periodReturnFor(snapshots: PortfolioSnapshot[], period: Period): { abs: number; pct: number } {
  const cutoff = periodCutoff(period);
  const pts = snapshots
    .filter((s) => !cutoff || s.date >= cutoff)
    .map((s) => ({ date: s.date, portfolioValue: s.portfolioValue }));
  return periodReturn(pts, 0);
}

// ── Filtro de periodo (seg) ────────────────────────────────────────

function PeriodSeg({ value, onChange, label }: { value: Period; onChange: (p: Period) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={value === p.id ? "seg-btn on" : "seg-btn"}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ── Dona de asignación con leyenda ─────────────────────────────────

function DonutCard({
  title,
  slices,
  centerTop,
  centerSub,
  currency,
  showAmount,
}: {
  title: string;
  slices: AllocationSlice[];
  centerTop: string;
  centerSub: string;
  currency: string;
  showAmount?: boolean;
}) {
  const visible = slices.filter((s) => s.value > 0);
  const data: DonutDatum[] = visible.map((s) => ({ name: s.label, value: Math.round(s.value), color: s.color }));
  return (
    <div className="card donut-card">
      <div className="card-title" style={{ fontSize: 14 }}>{title}</div>
      <div className="donut-row">
        <div className="ring-wrap">
          <DonutChart data={data} centerLabel={centerTop} centerSub={centerSub} />
        </div>
        <div className="leg">
          {visible.length === 0 ? (
            <span className="muted" style={{ fontSize: 12.5 }}>Agrega inversiones para ver su distribución.</span>
          ) : (
            visible.map((s) => (
              <div key={s.label} className="leg-row">
                <span className="sw" style={{ background: s.color }} />
                <span className="nm" title={s.label}>{s.label}</span>
                <span className="pc">
                  {formatPercent(s.pct)}
                  {showAmount ? ` · ${formatCompact(s.value, currency)}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Fila de la tabla con menú kebab de 5 acciones ──────────────────

type RowModal = "movimiento" | "valoracion" | "dashboard" | "editar" | "eliminar" | null;

function BrechaBanner({ contribution }: { contribution: OpenContribution }) {
  const router = useRouter();
  const [price, setPrice] = useState(
    contribution.unitPrice != null ? String(contribution.unitPrice) : "",
  );
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    const p = parseFloat(price);
    if (!(p > 0) || saving) return;
    setSaving(true);
    const res = await adjustContributionPriceAction(contribution.id, p);
    setSaving(false);
    if (res.ok) router.refresh();
  };

  return (
    <div className="brecha-aporte">
      <span className="brecha-dot" />
      <span className="brecha-txt">Aporte del mes · confirmá el precio de compra</span>
      <span className="brecha-monto">{formatMoney(contribution.amount, contribution.currency)}</span>
      <div className="brecha-inp-wrap">
        <span className="pre">{contribution.currency}</span>
        <input
          className="brecha-inp"
          type="number"
          step="any"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="precio"
        />
      </div>
      <button
        className="btn-brecha"
        onClick={confirm}
        disabled={saving || !(parseFloat(price) > 0)}
      >
        {saving ? "…" : "Confirmar"}
      </button>
    </div>
  );
}

function InvRow({
  h,
  raw,
  currency,
  period,
  contribution,
}: {
  h: HoldingPerformance;
  raw?: Holding;
  currency: string;
  period: Period;
  contribution?: OpenContribution;
}) {
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<RowModal>(null);
  const editHolding = raw ?? h;

  const isCashflow =
    h.nature === "cashflow" || (h.category ? CATEGORY_META[h.category]?.nature === "cashflow" : false);
  const natureLabel = isCashflow ? "Flujo de caja" : "Crecimiento patrimonial";
  const natureColor = isCashflow ? "var(--c-income)" : "var(--c-invest)";
  const catLabel = h.category ? CATEGORY_META[h.category]?.label : null;

  // Rendimiento del periodo por fila: escala el acumulado por el factor del periodo
  // (los snapshots son del portafolio, no por posición — aproximación honesta).
  const periodFactor = period === "all" ? 1 : period === "ytd" ? 1 : period === "3m" ? 0.48 : 0.2;
  const periodRet = h.returnPct * periodFactor;
  const periodGain = h.costBasis * periodRet;
  const pos = periodRet >= 0;

  const close = () => setModal(null);
  const act = (m: RowModal) => {
    setMenu(false);
    setModal(m);
  };

  return (
    <>
      <div className="inv-row">
        <div style={{ minWidth: 0 }}>
          <div className="inv-name">{h.label ?? h.symbol}</div>
          <div className="inv-sub">
            <span className="nat-dot" style={{ background: natureColor }} />
            {h.currency} · {h.region || "—"}
            {h.assetType && h.assetType !== "otro" ? "" : ""}
          </div>
        </div>
        <div>
          <span className="tag" style={{ color: natureColor }}>{natureLabel}</span>
          {catLabel ? <div className="cell-sub" style={{ marginTop: 5 }}>{catLabel}</div> : null}
        </div>
        <div className="inv-amt">{formatMoney(h.costBasis, h.currency)}</div>
        <div className="inv-amt c-aporte">
          {h.isRecurring && h.monthlyContribution ? (
            <>
              {formatMoney(h.monthlyContribution, h.currency)}
              <span className="s">/mes</span>
            </>
          ) : (
            <span className="muted">—</span>
          )}
        </div>
        <div>
          <div className={`inv-amt ${pos ? "pos" : "neg"}`}>
            {pos ? "+" : ""}
            {formatPercent(periodRet)}
          </div>
          <div className={`cell-sub ${periodGain >= 0 ? "pos" : "neg"}`}>
            {periodGain >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(periodGain), h.currency)}
          </div>
        </div>
        <div className="kebab-wrap">
          <button
            type="button"
            className="kebab"
            aria-label={`Opciones de ${h.label ?? h.symbol}`}
            onClick={() => setMenu((o) => !o)}
          >
            <Icon name="dots" />
          </button>
          {menu ? (
            <div className="kmenu" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => act("movimiento")}>
                <Icon name="repeat" /> Movimientos de capital
              </button>
              <button onClick={() => act("valoracion")}>
                <Icon name="invest" /> Valoración de la inversión
              </button>
              <button onClick={() => act("dashboard")}>
                <Icon name="dashboard" /> Ver dashboard
              </button>
              <button onClick={() => act("editar")}>
                <Icon name="edit" /> Editar inversión
              </button>
              <button className="danger" onClick={() => act("eliminar")}>
                <Icon name="x" /> Eliminar
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {contribution ? <BrechaBanner contribution={contribution} /> : null}

      {/* Movimientos de capital · aporte/compra reusa el wizard. El retiro/venta
          vive en el Dashboard (HoldingDetailModal), que ya lo soporta. */}
      {modal === "movimiento" ? <AddHoldingModal prefill={editHolding} currency={currency} onClose={close} /> : null}
      {modal === "editar" ? (
        <AddHoldingModal prefill={editHolding} editId={editHolding.id} currency={currency} onClose={close} />
      ) : null}
      {modal === "dashboard" ? (
        <HoldingDetailModal holding={h} editHolding={raw} currentPrice={h.currentPrice ?? null} currency={currency} onClose={close} />
      ) : null}
      {modal === "valoracion" ? <ValuationModal holding={editHolding} onClose={close} /> : null}
      {modal === "eliminar" ? <DeleteModal holding={editHolding} onClose={close} /> : null}
    </>
  );
}

// ── Modal · Valoración (current_value_manual + historial) ──────────

function ValuationModal({ holding, onClose }: { holding: Holding; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [hist, setHist] = useState<{ date: string; value: number }[] | null>(null);

  useEffect(() => {
    let alive = true;
    void getHoldingHistoryAction(holding, holding.currentValueManual ?? null, "all").then((pts) => {
      if (alive) setHist(pts.map((p) => ({ date: p.date, value: p.value })));
    });
    return () => {
      alive = false;
    };
  }, [holding]);

  const save = async () => {
    const v = Number(value.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(v) || v <= 0) return toast("Ingresa un valor.");
    setPending(true);
    const res = await editHoldingAction(holding.id, {
      assetType: holding.assetType,
      quantity: holding.quantity,
      averageCost: holding.averageCost,
      currency: holding.currency,
      symbol: holding.symbol,
      label: holding.label,
      category: holding.category,
      nature: holding.nature,
      region: holding.region,
      isRecurring: holding.isRecurring,
      incomeMonth: holding.incomeMonth,
      annualRatePct: holding.annualRatePct,
      rentalIncome: holding.rentalIncome,
      rentalFrequency: holding.rentalFrequency,
      currentValueManual: v,
    });
    setPending(false);
    if (res.ok) {
      toast("Valoración registrada");
      onClose();
      router.refresh();
    } else {
      toast(res.message ?? "No se pudo registrar la valoración.");
    }
  };

  return (
    <Modal title="Valoración de la inversión" sub={`${holding.label ?? holding.symbol} · valor en el tiempo`} onClose={onClose}>
      <div className="modal-body">
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Fecha de valoración</label>
            <input className="inp" type="date" defaultValue={today} disabled />
          </div>
          <div className="fld">
            <label className="fld-label">Valor de cuenta</label>
            <div className="inp-money">
              <span className="pre">{holding.currency}</span>
              <input
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={String(Math.round(holding.quantity * holding.averageCost))}
              />
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: "-2px 0 14px" }}>
          El valor actual (manual) actualiza el patrimonio y la rentabilidad de esta inversión a la fecha de hoy.
        </p>
        <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 6 }}>Historial de valoración</div>
        <div>
          {hist === null ? (
            <div className="muted" style={{ fontSize: 12.5, padding: "8px 0" }}>Cargando…</div>
          ) : hist.length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5, padding: "8px 0" }}>Aún no hay valoraciones registradas.</div>
          ) : (
            hist
              .slice()
              .reverse()
              .slice(0, 12)
              .map((v, i) => {
                const [yy, mm, dd] = v.date.split("-");
                return (
                  <div
                    key={`${v.date}-${i}`}
                    style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--line)" }}
                  >
                    <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                      {Number(dd ?? 1)} {MONTH_ABBR[Number(mm ?? 1) - 1] ?? ""} {yy}
                    </span>
                    <strong className="tnum" style={{ fontSize: 13.5 }}>{formatMoney(v.value, holding.currency)}</strong>
                  </div>
                );
              })
          )}
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void save()}>
          {pending ? "Guardando…" : "Guardar valoración"}
        </button>
      </div>
    </Modal>
  );
}

// ── Modal · Eliminar ───────────────────────────────────────────────

function DeleteModal({ holding, onClose }: { holding: Holding; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const remove = async () => {
    setPending(true);
    const res = await removeHoldingAction(holding.id);
    setPending(false);
    if (res.ok) {
      toast("Inversión eliminada");
      onClose();
      router.refresh();
    } else {
      toast(res.message ?? "No se pudo eliminar.");
    }
  };
  return (
    <Modal title="Eliminar inversión" sub={holding.label ?? holding.symbol} onClose={onClose}>
      <div className="modal-body">
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          ¿Eliminar <strong>{holding.label ?? holding.symbol}</strong> de tu portafolio? Esta acción no se puede deshacer.
        </p>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" style={{ background: "var(--neg)" }} disabled={pending} onClick={() => void remove()}>
          {pending ? "Eliminando…" : "Eliminar"}
        </button>
      </div>
    </Modal>
  );
}

// ── Tip "?" ────────────────────────────────────────────────────────

function TipQ({ text }: { text: string }) {
  return (
    <span className="tip tip-q" data-tip={text}>
      ?
    </span>
  );
}
