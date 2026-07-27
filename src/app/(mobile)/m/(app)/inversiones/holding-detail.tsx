"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { formatMoney, formatPercent, formatMonthYear } from "@/lib/format";
import {
  listHoldingPurchasesAction,
  listDividendsAction,
  removeDividendAction,
  listHoldingValuationsAction,
  recordHoldingValuationAction,
  getHoldingHistoryAction,
  listRentalPaymentsAction,
  addRentalIncomeAction,
  removeRentalPaymentAction,
  adjustContributionPriceAction,
  getPlanPaidUntilAction,
  listInvestmentAlertsAction,
  createInvestmentAlertAction,
  deleteInvestmentAlertAction,
} from "@/modules/wealth/api/actions";
import { monthlyValuations } from "@/modules/wealth/engine/portfolio-engine";
import type { PlanPeriod } from "@/modules/wealth/engine/premiums";
import type { AlertKind } from "@/modules/wealth/engine/price-alerts";
import type { InvestmentAlert } from "@/modules/wealth/services/price-alerts-service";
import type { Dividend, HoldingPerformance, RentalPayment, HoldingNativo } from "@/modules/wealth/types";
import type {
  HistoryPoint,
  HoldingPurchase,
  HoldingValuation,
} from "@/modules/wealth/services/holding-history-service";
import type { OpenContribution } from "@/modules/wealth/services/contribution-service";

import {
  BottomSheet,
  ConfirmDialog,
  DateField,
  MoneyField,
  SheetSelect,
  useToast,
} from "../../components/form-kit";
import { MScrubChart, type MPoint } from "../../components/m-scrub-chart";
import { DividendForm } from "./inversiones-forms";

/**
 * Detalle de una inversión en /m/inversiones — paridad con holding-detail-modal.tsx de la web:
 * historial de aportes, dividendos (listar/agregar/eliminar) y valuaciones. Consume EXACTAMENTE
 * las Server Actions de wealth (listar, registrar valuación, eliminar dividendo); cero backend nuevo.
 *
 * Gating idéntico al de la web:
 *  · Compras y dividendos: solo activos COTIZADOS (etf/accion/cripto).
 *  · Valuaciones: solo los planes a plazo (category = 'plan_inversion'), que NO son cotizados
 *    (su assetType es 'fondo'), por eso el detalle también se abre para ellos.
 *  · La renta inmobiliaria y el ajuste de aporte NO están aquí (van en otro delta).
 *
 * Las listas se piden al abrir (el componente solo se monta cuando hay holding seleccionado),
 * no en la carga de la página.
 */
const QUOTED_TYPES = new Set(["etf", "accion", "cripto"]);

function isQuoted(h: { assetType: string }): boolean {
  return QUOTED_TYPES.has(h.assetType);
}

function isPlan(h: { category?: string | null }): boolean {
  return h.category === "plan_inversion";
}

/** No cotizado (inmueble, bono, negocio, plan…): la web lo llama isRental. */
function isRental(h: { assetType: string }): boolean {
  return !isQuoted(h);
}

/** Frecuencias de renta que acepta el schema (rentalPaymentInputSchema). */
const RENTAL_FREQ_OPTS = [
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "anual", label: "Anual" },
];

type Mode = "detail" | "dividend" | "valuation" | "rental";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const QUOTED_ALERT = new Set(["etf", "accion", "cripto"]);
/** asset_type del holding → tipo de mercado del endpoint /api/market-price. */
const MARKET_TYPE_ALERT: Record<string, string> = { etf: "etf", accion: "stock", cripto: "crypto" };
const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  price: "Precio",
  time_held: "Años invertido",
  vesting: "Vesting",
};

/** Etiqueta de fecha corta (día + mes) para los puntos del gráfico con scrub. */
function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CR", { day: "numeric", month: "short" });
}

export function HoldingDetailSheet({
  holding,
  currency,
  contribution,
  onClose,
  raw,
  onEdit,
  onSell,
  onDelete,
}: {
  holding: HoldingPerformance;
  /** El MISMO holding sin convertir. `holding` trae los importes en la moneda principal
   *  con la etiqueta nativa, así que todo lo que precargue un importe sale de aquí. */
  raw: HoldingNativo;
  currency: string;
  /** Aporte del mes pendiente (brecha DCA), o null si no hay. */
  contribution: OpenContribution | null;
  onClose: () => void;
  onEdit: () => void;
  onSell: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("detail");

  const quoted = isQuoted(holding);
  const plan = isPlan(holding);
  const rental = isRental(holding) && !plan; // no cotizado y no plan → sección de renta
  const cur = holding.currency || currency;
  const name = holding.label || holding.symbol || "Inversión";

  // Importes en la moneda NATIVA del holding (de `raw`), derivados del retorno del engine
  // (invariante a la moneda) — sin reconvertir. `holding.costBasis/currentValue/profitLoss`
  // vienen en la moneda principal; el detalle de UN holding se muestra en SU moneda.
  const nativeCostBasis = raw.quantity * raw.averageCost;
  const nativeCurrentValue = nativeCostBasis * (1 + holding.returnPct);
  const nativeProfitLoss = nativeCurrentValue - nativeCostBasis;
  // Precio nativo por unidad = averageCost·(1+returnPct); null en no cotizados (usan valor manual).
  const nativePrice =
    holding.currentPrice != null && !holding.priceUnavailable
      ? raw.averageCost * (1 + holding.returnPct)
      : null;

  const [purchases, setPurchases] = useState<HoldingPurchase[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [valuations, setValuations] = useState<HoldingValuation[]>([]);
  const [paidUntil, setPaidUntil] = useState<PlanPeriod | null>(null);
  const [alerts, setAlerts] = useState<InvestmentAlert[]>([]);
  const [alertTarget, setAlertTarget] = useState<number | undefined>(undefined);
  const [alertYears, setAlertYears] = useState<number | undefined>(undefined);
  const [alertDate, setAlertDate] = useState<string | undefined>(undefined);
  const [alertLive, setAlertLive] = useState<{ price: number; currency: string } | null>(null);
  const [alertLiveState, setAlertLiveState] = useState<"loading" | "ok" | "err" | "na">("na");
  // Tipos disponibles según el activo: Precio (cotizable), Años (con fecha de compra), Vesting (siempre).
  const alertKinds: AlertKind[] = [
    ...(holding.symbol && QUOTED_ALERT.has(holding.assetType) ? (["price"] as const) : []),
    ...(raw.purchaseDate ? (["time_held"] as const) : []),
    "vesting",
  ];
  const [alertKind, setAlertKind] = useState<AlertKind>(alertKinds[0]!);
  const alertMarketType = holding.symbol ? MARKET_TYPE_ALERT[holding.assetType] : undefined;
  useEffect(() => {
    if (alertKind !== "price" || !holding.symbol || !alertMarketType) {
      setAlertLive(null);
      setAlertLiveState("na");
      return;
    }
    let ok = true;
    setAlertLive(null);
    setAlertLiveState("loading");
    fetch(`/api/market-price?symbol=${encodeURIComponent(holding.symbol)}&type=${alertMarketType}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no price"))))
      .then((d: { price: number; currency: string }) => {
        if (ok) {
          setAlertLive({ price: Number(d.price), currency: d.currency });
          setAlertLiveState("ok");
        }
      })
      .catch(() => {
        if (ok) setAlertLiveState("err");
      });
    return () => {
      ok = false;
    };
  }, [alertKind, holding.symbol, alertMarketType]);
  const [rentals, setRentals] = useState<RentalPayment[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const [delDiv, setDelDiv] = useState<Dividend | null>(null);
  const [delRent, setDelRent] = useState<RentalPayment | null>(null);
  const [valDate, setValDate] = useState(todayISO());
  const [valAmount, setValAmount] = useState<number | undefined>(undefined);
  const [valError, setValError] = useState<string | null>(null);

  // Renta. Del CRUDO: `holding.rentalIncome` viene convertido a la moneda principal y se
  // guardaba etiquetado con `cur` (la nativa) — el importe entraba multiplicado por el
  // tipo de cambio. Y el servicio además reescribe ese mismo campo en el holding, así que
  // un pago mal etiquetado contaminaba la siguiente precarga.
  const [rentAmount, setRentAmount] = useState<number | undefined>(raw.rentalIncome ?? undefined);
  const [rentDate, setRentDate] = useState(todayISO());
  const [rentFreq, setRentFreq] = useState<string>(holding.rentalFrequency ?? "mensual");
  const [rentError, setRentError] = useState<string | null>(null);

  // Ajuste del precio de aporte (brecha DCA).
  const [contribPrice, setContribPrice] = useState<number | undefined>(
    contribution?.unitPrice ?? undefined,
  );

  const reloadDividends = useCallback(() => {
    void listDividendsAction(holding.id).then(setDividends);
  }, [holding.id]);

  const reloadValuations = useCallback(() => {
    void listHoldingValuationsAction(holding.id).then(setValuations);
  }, [holding.id]);

  const reloadRentals = useCallback(() => {
    void listRentalPaymentsAction(holding.id).then(setRentals);
  }, [holding.id]);

  const reloadAlerts = useCallback(() => {
    void listInvestmentAlertsAction(holding.id).then(setAlerts);
  }, [holding.id]);

  const alertValid =
    alertKind === "price"
      ? !!(alertTarget && alertTarget > 0)
      : alertKind === "time_held"
        ? !!(alertYears && alertYears > 0)
        : !!(alertDate && /^\d{4}-\d{2}-\d{2}$/.test(alertDate));

  const createAlert = () => {
    if (!alertValid) return;
    startTransition(async () => {
      const input =
        alertKind === "price"
          ? {
              kind: "price" as const,
              holdingId: holding.id,
              symbol: holding.symbol ?? "",
              assetType: holding.assetType,
              targetPrice: alertTarget!,
              currency: cur,
              // La dirección la infiere el servidor con el precio actual.
            }
          : alertKind === "time_held"
            ? { kind: "time_held" as const, holdingId: holding.id, yearsThreshold: alertYears! }
            : { kind: "vesting" as const, holdingId: holding.id, triggerDate: alertDate! };
      const res = await createInvestmentAlertAction(input);
      if (res.ok) {
        setAlertTarget(undefined);
        setAlertYears(undefined);
        setAlertDate(undefined);
        reloadAlerts();
        toast.show("Alerta creada", "success");
      } else {
        toast.show(res.message ?? "No se pudo crear la alerta", "error");
      }
    });
  };

  /** Descripción de una alerta existente, por tipo. */
  const describeAlert = (a: InvestmentAlert): string => {
    if (a.kind === "time_held") return `A los ${a.yearsThreshold} años invertido`;
    if (a.kind === "vesting") return `El ${a.triggerDate}`;
    return `${a.direction === "above" ? "Sube a" : "Baja a"} ${formatMoney(a.targetPrice ?? 0, a.currency ?? "")}`;
  };

  const removeAlert = (id: string) => {
    startTransition(async () => {
      const res = await deleteInvestmentAlertAction(id);
      if (res.ok) reloadAlerts();
      else toast.show(res.message ?? "No se pudo borrar", "error");
    });
  };

  // Carga perezosa: solo al abrir el detalle (este componente se monta con el holding elegido).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const jobs: Promise<unknown>[] = [
      // Las alertas aplican a CUALQUIER holding (vesting/años, no solo cotizados).
      listInvestmentAlertsAction(holding.id).then((a) => {
        if (alive) setAlerts(a);
      }),
    ];
    if (quoted) {
      jobs.push(
        listHoldingPurchasesAction(holding.id).then((p) => {
          if (alive) setPurchases(p);
        }),
        listDividendsAction(holding.id).then((d) => {
          if (alive) setDividends(d);
        }),
        getHoldingHistoryAction(holding, nativePrice, "all").then((h) => {
          if (alive) setHistory(h);
        }),
      );
    }
    if (plan) {
      jobs.push(
        listHoldingValuationsAction(holding.id).then((v) => {
          if (alive) setValuations(v);
        }),
        getPlanPaidUntilAction(holding.id).then((p) => {
          if (alive) setPaidUntil(p);
        }),
      );
    }
    if (rental) {
      jobs.push(
        listRentalPaymentsAction(holding.id).then((r) => {
          if (alive) setRentals(r);
        }),
      );
    }
    void Promise.all(jobs).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [holding, quoted, plan, rental, nativePrice]);

  // Precio promedio acumulado tras cada compra (mismo cálculo que la web).
  let cumAmount = 0;
  let cumQty = 0;
  const purchaseRows = purchases.map((p) => {
    cumAmount += p.amount;
    cumQty += p.quantity;
    return {
      ...p,
      price: p.quantity > 0 ? p.amount / p.quantity : 0,
      avgAfter: cumQty > 0 ? cumAmount / cumQty : 0,
    };
  });
  const avgFinal = cumQty > 0 ? cumAmount / cumQty : 0;
  const totalDividends = dividends.reduce((acc, d) => acc + d.amount, 0);

  const confirmDeleteDividend = () => {
    if (!delDiv) return;
    const d = delDiv;
    startTransition(async () => {
      const res = await removeDividendAction(d.id);
      if (res.ok) {
        setDividends((prev) => prev.filter((x) => x.id !== d.id));
        setDelDiv(null);
        toast.show("Dividendo eliminado", "success");
        router.refresh();
      } else {
        toast.show("No pudimos eliminar el dividendo", "error");
      }
    });
  };

  const saveValuation = () => {
    if (!valAmount || valAmount <= 0) {
      setValError("Escribe un valor mayor a 0");
      return;
    }
    if (!valDate) {
      setValError("Elige la fecha del estado de cuenta");
      return;
    }
    setValError(null);
    startTransition(async () => {
      const res = await recordHoldingValuationAction(holding.id, valDate, valAmount);
      if (res.ok) {
        toast.show("Valor actualizado", "success");
        setValAmount(undefined);
        setMode("detail");
        reloadValuations();
        router.refresh();
      } else {
        toast.show(res.message ?? "No pudimos guardar el valor", "error");
      }
    });
  };

  const saveRental = () => {
    if (!rentAmount || rentAmount <= 0) {
      setRentError("El monto debe ser mayor a 0");
      return;
    }
    if (!rentDate) {
      setRentError("Elige la fecha en que la recibiste");
      return;
    }
    setRentError(null);
    startTransition(async () => {
      const res = await addRentalIncomeAction({
        holdingId: holding.id,
        receivedOn: rentDate,
        amount: rentAmount,
        currency: cur,
        frequency: rentFreq,
        holdingLabel: holding.label ?? undefined,
        holdingSymbol: holding.symbol ?? undefined,
      });
      if (res.ok) {
        toast.show("Renta registrada", "success");
        setMode("detail");
        reloadRentals();
        router.refresh();
      } else {
        toast.show(res.message ?? "No pudimos registrar la renta", "error");
      }
    });
  };

  const confirmDeleteRental = () => {
    if (!delRent) return;
    const r = delRent;
    startTransition(async () => {
      const res = await removeRentalPaymentAction(r.id);
      if (res.ok) {
        setRentals((prev) => prev.filter((x) => x.id !== r.id));
        setDelRent(null);
        toast.show("Renta eliminada", "success");
        router.refresh();
      } else {
        toast.show("No pudimos eliminar la renta", "error");
      }
    });
  };

  const confirmContribution = () => {
    if (!contribution) return;
    if (!contribPrice || contribPrice <= 0) {
      toast.show("Escribe el precio unitario (mayor a 0)", "error");
      return;
    }
    startTransition(async () => {
      const res = await adjustContributionPriceAction(contribution.id, contribPrice);
      if (res.ok) {
        toast.show("Aporte confirmado", "success");
        router.refresh();
      } else {
        toast.show(res.message ?? "No pudimos actualizar el aporte", "error");
      }
    });
  };

  const totalRentals = rentals.reduce((acc, r) => acc + r.amount, 0);

  const title =
    mode === "dividend"
      ? "Registrar dividendo"
      : mode === "valuation"
        ? "Valor del estado de cuenta"
        : mode === "rental"
          ? "Registrar renta"
          : name;

  return (
    <>
      <BottomSheet open onClose={onClose} title={title}>
        {mode === "dividend" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <DividendForm
              holding={holding}
              currency={currency}
              onSuccess={() => {
                setMode("detail");
                reloadDividends();
                router.refresh();
              }}
            />
            <button
              type="button"
              className="m-btn m-btn-block m-btn-secondary"
              onClick={() => setMode("detail")}
            >
              Volver
            </button>
          </div>
        ) : null}

        {mode === "valuation" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
              Escribe el valor que trae tu estado de cuenta. Actualiza el valor actual del plan.
            </div>
            <DateField name="asOf" label="Fecha" value={valDate} onChange={setValDate} />
            <MoneyField
              name="value"
              label="Valor"
              value={valAmount}
              currency={cur}
              onChange={setValAmount}
            />
            {valError ? (
              <div className="neg" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                {valError}
              </div>
            ) : null}
            <button
              type="button"
              className="m-btn m-btn-block m-btn-primary"
              disabled={pending}
              onClick={saveValuation}
            >
              {pending ? "Guardando…" : "Actualizar valor"}
            </button>
            <button
              type="button"
              className="m-btn m-btn-block m-btn-secondary"
              disabled={pending}
              onClick={() => setMode("detail")}
            >
              Volver
            </button>
          </div>
        ) : null}

        {mode === "rental" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
              La renta que registres suma a tu ingreso pasivo (entra como transacción vinculada a
              este activo).
            </div>
            <MoneyField
              name="rentAmount"
              label="Monto recibido"
              value={rentAmount}
              currency={cur}
              onChange={setRentAmount}
            />
            <SheetSelect
              name="rentFreq"
              label="Frecuencia"
              value={rentFreq}
              options={RENTAL_FREQ_OPTS}
              sheetTitle="Frecuencia"
              onChange={setRentFreq}
            />
            <DateField name="receivedOn" label="Fecha" value={rentDate} onChange={setRentDate} />
            {rentError ? (
              <div className="neg" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                {rentError}
              </div>
            ) : null}
            <button
              type="button"
              className="m-btn m-btn-block m-btn-primary"
              disabled={pending}
              onClick={saveRental}
            >
              {pending ? "Guardando…" : "Registrar renta"}
            </button>
            <button
              type="button"
              className="m-btn m-btn-block m-btn-secondary"
              disabled={pending}
              onClick={() => setMode("detail")}
            >
              Volver
            </button>
          </div>
        ) : null}

        {mode === "detail" ? (
          <div style={{ display: "grid", gap: 12 }}>
            {/* Aporte del mes pendiente (brecha DCA) */}
            {contribution ? (
              <div
                className="card card-p"
                style={{ padding: 12, borderColor: "var(--warning, #b7791f)" }}
              >
                <div className="between" style={{ marginBottom: 6 }}>
                  <div className="sec-title">Aporte del mes pendiente</div>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
                    {formatMoney(contribution.amount, contribution.currency)}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.45 }}>
                  Confirma el precio de compra de este mes para que tu promedio quede exacto.
                </div>
                <MoneyField
                  name="contribPrice"
                  label="Precio unitario"
                  value={contribPrice}
                  currency={contribution.currency}
                  onChange={setContribPrice}
                />
                <button
                  type="button"
                  className="m-btn m-btn-block m-btn-primary"
                  style={{ marginTop: 8 }}
                  disabled={pending}
                  onClick={confirmContribution}
                >
                  {pending ? "Confirmando…" : "Confirmar aporte"}
                </button>
              </div>
            ) : null}

            {/* Resumen */}
            <div className="card card-p" style={{ padding: 12 }}>
              <div className="between">
                <div className="ov">Valor actual</div>
                {holding.priceUnavailable ? null : (
                  <div className={`mono ${holding.returnPct >= 0 ? "pos" : "neg"}`} style={{ fontSize: 12, fontWeight: 700 }}>
                    {holding.returnPct >= 0 ? "+" : ""}
                    {formatPercent(holding.returnPct, 1)}
                  </div>
                )}
              </div>
              {holding.priceUnavailable ? (
                // Cotizable sin precio: no inventamos valor/retorno al costo.
                <>
                  <div className="mono muted" style={{ fontSize: 17, fontWeight: 700, fontStyle: "italic", marginTop: 4 }}>
                    Precio no disponible
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    Invertido {formatMoney(nativeCostBasis, cur)} · no pudimos cotizarlo ahora.
                  </div>
                </>
              ) : (
                <>
                  <div className="mono" style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>
                    {formatMoney(nativeCurrentValue, cur)}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    Invertido {formatMoney(nativeCostBasis, cur)} ·{" "}
                    {nativeProfitLoss >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(nativeProfitLoss), cur)}
                  </div>
                </>
              )}
              {quoted && history.length > 1 ? (
                <div style={{ marginTop: 8 }}>
                  <MScrubChart
                    points={history.map<MPoint>((h) => ({ label: dayLabel(h.date), value: h.value }))}
                    currency={cur}
                  />
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    Evolución del valor desde tu primera compra · arrastra para ver cada día.
                  </div>
                </div>
              ) : null}
            </div>

            {/* Alertas de inversión (precio si cotiza · años invertido · vesting) */}
            <div>
              <div className="sec-title" style={{ marginBottom: 6 }}>
                Alertas
              </div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 8 }}>
                Te avisamos por correo y en la campana cuando se cumpla la condición. No es tiempo
                real ni una recomendación de inversión.
              </div>

              {/* Selector de tipo (si hay más de uno) */}
              {alertKinds.length > 1 ? (
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  {alertKinds.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="m-chip"
                      onClick={() => setAlertKind(k)}
                      style={alertKind === k ? { background: "var(--accent)", color: "#fff" } : undefined}
                    >
                      {ALERT_KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Form del tipo elegido */}
              {alertKind === "price" ? (
                <>
                  <MoneyField
                    name="alertTarget"
                    label={`Precio objetivo (${cur})`}
                    value={alertTarget}
                    onChange={setAlertTarget}
                    currency={cur}
                  />
                  {/* Precio actual (live) + hint. La dirección la infiere el servidor al guardar. */}
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.4 }}>
                    {alertLiveState === "loading"
                      ? "Leyendo el precio actual…"
                      : alertLiveState === "err"
                        ? "No pudimos leer el precio ahora; podés crear la alerta igual."
                        : alertLive
                          ? `Precio actual: ${formatMoney(alertLive.price, alertLive.currency)}.`
                          : ""}
                    {alertTarget && alertTarget > 0
                      ? ` Te avisaremos cuando ${holding.symbol} llegue a ${formatMoney(alertTarget, cur)}.`
                      : ""}
                  </div>
                </>
              ) : alertKind === "time_held" ? (
                <div className="m-qfield">
                  <div className="m-qlabel">Años invertido</div>
                  <input
                    className="m-inp"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={alertYears ?? ""}
                    onChange={(e) => setAlertYears(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Ej. 5"
                  />
                </div>
              ) : (
                <DateField
                  name="alertDate"
                  label="Fecha de vesting"
                  value={alertDate ?? ""}
                  onChange={(v) => setAlertDate(v || undefined)}
                />
              )}

              <button
                type="button"
                className="m-btn m-btn-block m-btn-secondary"
                style={{ marginTop: 8 }}
                disabled={pending || !alertValid}
                onClick={createAlert}
              >
                Crear alerta
              </button>

              {alerts.length > 0 ? (
                <div className="card" style={{ padding: 0, marginTop: 8 }}>
                  {alerts.map((a) => (
                    <div key={a.id} className="between" style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: 12.5 }}>
                        <span className="muted" style={{ fontSize: 10.5, textTransform: "uppercase" }}>
                          {ALERT_KIND_LABEL[a.kind]}
                        </span>{" "}
                        <span className="mono" style={{ fontWeight: 600 }}>
                          {describeAlert(a)}
                        </span>
                        {a.triggeredAt ? (
                          <span className="muted"> · disparada</span>
                        ) : !a.active ? (
                          <span className="muted"> · pausada</span>
                        ) : null}
                      </span>
                      <button type="button" className="m-chip" disabled={pending} onClick={() => removeAlert(a.id)}>
                        Borrar
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Compras / aportes (solo cotizados) */}
            {quoted ? (
              <div>
                <div className="sec-title" style={{ marginBottom: 6 }}>
                  Aportes
                </div>
                {loading ? (
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    Cargando…
                  </div>
                ) : purchaseRows.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                    Aún no hay compras registradas para esta posición.
                  </div>
                ) : (
                  <>
                    <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
                      Precio promedio {formatMoney(avgFinal, cur)} ·{" "}
                      {purchaseRows.length === 1 ? "1 compra" : `${purchaseRows.length} compras`}
                    </div>
                    <div className="card" style={{ padding: 0 }}>
                      {purchaseRows.map((p) => (
                        <div
                          key={p.id}
                          className="between"
                          style={{ padding: "9px 12px", gap: 10, alignItems: "flex-start" }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13 }}>{formatMoney(p.amount, p.currency)}</div>
                            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                              {p.occurredOn} · {p.quantity} @ {formatMoney(p.price, p.currency)}
                            </div>
                          </div>
                          <div
                            className="mono muted"
                            style={{ fontSize: 11.5, whiteSpace: "nowrap" }}
                          >
                            prom. {formatMoney(p.avgAfter, p.currency)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {/* Dividendos (solo cotizados) */}
            {quoted ? (
              <div>
                <div className="between" style={{ marginBottom: 6 }}>
                  <div className="sec-title">Dividendos</div>
                  {totalDividends > 0 ? (
                    <span className="mono pos" style={{ fontSize: 11.5, fontWeight: 700 }}>
                      {formatMoney(totalDividends, cur)}
                    </span>
                  ) : null}
                </div>
                {loading ? (
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    Cargando…
                  </div>
                ) : dividends.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                    Sin dividendos registrados aún.
                  </div>
                ) : (
                  <div className="card" style={{ padding: 0 }}>
                    {dividends.map((d) => (
                      <div
                        key={d.id}
                        className="between"
                        style={{ padding: "9px 12px", gap: 10, alignItems: "center" }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="mono pos" style={{ fontSize: 13, fontWeight: 700 }}>
                            +{formatMoney(d.amount, d.currency)}
                          </div>
                          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                            {d.paymentDate}
                            {d.yieldPct ? ` · ${formatPercent(d.yieldPct, 1)}` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="m-chip"
                          style={{ flexShrink: 0 }}
                          disabled={pending}
                          onClick={() => setDelDiv(d)}
                        >
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* Valuaciones (solo planes a plazo) */}
            {plan && paidUntil ? (
              <div
                className="between"
                style={{ marginBottom: 12 }}
                title="El último mes con cuota registrada, incluyendo las que adelantaste. No pasa del vencimiento del plan."
              >
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Cuotas al día hasta
                </span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
                  {formatMonthYear(`${paidUntil.year}-${String(paidUntil.month).padStart(2, "0")}`)}
                </span>
              </div>
            ) : null}

            {plan ? (
              <div>
                <div className="sec-title" style={{ marginBottom: 6 }}>
                  Valor del estado de cuenta
                </div>
                {loading ? (
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    Cargando…
                  </div>
                ) : valuations.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                    Aún no registras valores. Cada vez que llegue tu estado de cuenta, anótalo aquí.
                  </div>
                ) : (
                  <>
                    <MScrubChart
                      points={valuations.map<MPoint>((v) => ({ label: dayLabel(v.asOf), value: v.value }))}
                      currency={cur}
                    />
                    <div className="card" style={{ padding: 0 }}>
                      {/* Una fila por MES (la última valoración de cada mes). La curva de arriba
                          conserva todos los puntos. */}
                      {[...monthlyValuations(valuations)].reverse().map((v) => (
                        <div key={v.id} className="between" style={{ padding: "9px 12px" }}>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {formatMonthYear(v.asOf)}
                          </span>
                          <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                            {formatMoney(v.value, v.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <button
                  type="button"
                  className="m-btn m-btn-block m-btn-secondary"
                  style={{ marginTop: 8 }}
                  disabled={pending}
                  onClick={() => {
                    setValDate(todayISO());
                    setValAmount(undefined);
                    setValError(null);
                    setMode("valuation");
                  }}
                >
                  Registrar valuación
                </button>
              </div>
            ) : null}

            {/* Renta (solo no cotizados que no son plan: inmueble, bono, negocio…) */}
            {rental ? (
              <div>
                <div className="between" style={{ marginBottom: 6 }}>
                  <div className="sec-title">Renta</div>
                  {totalRentals > 0 ? (
                    <span className="mono pos" style={{ fontSize: 11.5, fontWeight: 700 }}>
                      {formatMoney(totalRentals, cur)}
                    </span>
                  ) : null}
                </div>
                {loading ? (
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    Cargando…
                  </div>
                ) : rentals.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                    Sin renta registrada aún. La renta que registres suma a tu ingreso pasivo.
                  </div>
                ) : (
                  <div className="card" style={{ padding: 0 }}>
                    {rentals.map((r) => (
                      <div
                        key={r.id}
                        className="between"
                        style={{ padding: "9px 12px", gap: 10, alignItems: "center" }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="mono pos" style={{ fontSize: 13, fontWeight: 700 }}>
                            +{formatMoney(r.amount, r.currency)}
                          </div>
                          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                            {r.receivedOn}
                            {r.frequency ? ` · ${r.frequency}` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="m-chip"
                          style={{ flexShrink: 0 }}
                          disabled={pending}
                          onClick={() => setDelRent(r)}
                        >
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="m-btn m-btn-block m-btn-secondary"
                  style={{ marginTop: 8 }}
                  disabled={pending}
                  onClick={() => {
                    setRentAmount(holding.rentalIncome ?? undefined);
                    setRentDate(todayISO());
                    setRentFreq(holding.rentalFrequency ?? "mensual");
                    setRentError(null);
                    setMode("rental");
                  }}
                >
                  Registrar renta
                </button>
              </div>
            ) : null}

            {/* Acciones (las que ya existían) */}
            <div style={{ display: "grid", gap: 8 }}>
              {rental ? null : (
                <button
                  type="button"
                  className="m-btn m-btn-block m-btn-primary"
                  disabled={pending}
                  onClick={() => setMode("dividend")}
                >
                  Registrar dividendo
                </button>
              )}
              <button
                type="button"
                className="m-btn m-btn-block m-btn-secondary"
                disabled={pending}
                onClick={onSell}
              >
                Vender / retirar
              </button>
              <button
                type="button"
                className="m-btn m-btn-block m-btn-secondary"
                disabled={pending}
                onClick={onEdit}
              >
                Editar posición
              </button>
              <button
                type="button"
                className="m-btn m-btn-block m-btn-quiet-danger"
                disabled={pending}
                onClick={onDelete}
              >
                Eliminar
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={delDiv !== null}
        title="Eliminar dividendo"
        message={
          delDiv
            ? `Se eliminará el dividendo de ${formatMoney(delDiv.amount, delDiv.currency)} del ${delDiv.paymentDate}.`
            : undefined
        }
        confirmLabel="Eliminar"
        variant="danger"
        pending={pending}
        onConfirm={confirmDeleteDividend}
        onCancel={() => setDelDiv(null)}
      />

      <ConfirmDialog
        open={delRent !== null}
        title="Eliminar renta"
        message={
          delRent
            ? `Se eliminará la renta de ${formatMoney(delRent.amount, delRent.currency)} del ${delRent.receivedOn}.`
            : undefined
        }
        confirmLabel="Eliminar"
        variant="danger"
        pending={pending}
        onConfirm={confirmDeleteRental}
        onCancel={() => setDelRent(null)}
      />
    </>
  );
}
