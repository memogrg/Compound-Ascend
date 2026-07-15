"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { formatMoney, formatPercent } from "@/lib/format";
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
} from "@/modules/wealth/api/actions";
import type { Dividend, HoldingPerformance, RentalPayment } from "@/modules/wealth/types";
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

/** Sparkline sin librerías (misma técnica que la web para las valuaciones). */
function Sparkline({ points }: { points: { value: number }[] }) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const up = (vals[vals.length - 1] ?? 0) >= (vals[0] ?? 0);
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 300;
      const y = 56 - ((p.value - min) / span) * 52;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 300 60"
      preserveAspectRatio="none"
      style={{ width: "100%", height: 56 }}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={up ? "var(--pos)" : "var(--neg)"}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={d}
      />
    </svg>
  );
}

export function HoldingDetailSheet({
  holding,
  currency,
  contribution,
  onClose,
  onEdit,
  onSell,
  onDelete,
}: {
  holding: HoldingPerformance;
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

  const [purchases, setPurchases] = useState<HoldingPurchase[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [valuations, setValuations] = useState<HoldingValuation[]>([]);
  const [rentals, setRentals] = useState<RentalPayment[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const [delDiv, setDelDiv] = useState<Dividend | null>(null);
  const [delRent, setDelRent] = useState<RentalPayment | null>(null);
  const [valDate, setValDate] = useState(todayISO());
  const [valAmount, setValAmount] = useState<number | undefined>(undefined);
  const [valError, setValError] = useState<string | null>(null);

  // Renta.
  const [rentAmount, setRentAmount] = useState<number | undefined>(
    holding.rentalIncome ?? undefined,
  );
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

  // Carga perezosa: solo al abrir el detalle (este componente se monta con el holding elegido).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const jobs: Promise<unknown>[] = [];
    if (quoted) {
      jobs.push(
        listHoldingPurchasesAction(holding.id).then((p) => {
          if (alive) setPurchases(p);
        }),
        listDividendsAction(holding.id).then((d) => {
          if (alive) setDividends(d);
        }),
        getHoldingHistoryAction(holding, holding.currentPrice ?? null, "all").then((h) => {
          if (alive) setHistory(h);
        }),
      );
    }
    if (plan) {
      jobs.push(
        listHoldingValuationsAction(holding.id).then((v) => {
          if (alive) setValuations(v);
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
  }, [holding, quoted, plan, rental]);

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
                <div className={`mono ${holding.returnPct >= 0 ? "pos" : "neg"}`} style={{ fontSize: 12, fontWeight: 700 }}>
                  {holding.returnPct >= 0 ? "+" : ""}
                  {formatPercent(holding.returnPct, 1)}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>
                {formatMoney(holding.currentValue, currency)}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                Invertido {formatMoney(holding.costBasis, currency)} ·{" "}
                {holding.profitLoss >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(holding.profitLoss), currency)}
              </div>
              {quoted && history.length > 1 ? (
                <div style={{ marginTop: 8 }}>
                  <Sparkline points={history} />
                  <div className="muted" style={{ fontSize: 11 }}>
                    Evolución del valor desde tu primera compra.
                  </div>
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
                    <Sparkline points={valuations} />
                    <div className="card" style={{ padding: 0 }}>
                      {[...valuations].reverse().map((v) => (
                        <div key={v.id} className="between" style={{ padding: "9px 12px" }}>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {v.asOf}
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
                className="m-btn m-btn-block m-btn-danger"
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
