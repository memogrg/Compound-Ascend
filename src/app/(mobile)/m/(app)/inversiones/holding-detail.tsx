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
} from "@/modules/wealth/api/actions";
import type { Dividend, HoldingPerformance } from "@/modules/wealth/types";
import type {
  HistoryPoint,
  HoldingPurchase,
  HoldingValuation,
} from "@/modules/wealth/services/holding-history-service";

import {
  BottomSheet,
  ConfirmDialog,
  DateField,
  MoneyField,
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

type Mode = "detail" | "dividend" | "valuation";

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
  onClose,
  onEdit,
  onSell,
  onDelete,
}: {
  holding: HoldingPerformance;
  currency: string;
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
  const cur = holding.currency || currency;
  const name = holding.label || holding.symbol || "Inversión";

  const [purchases, setPurchases] = useState<HoldingPurchase[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [valuations, setValuations] = useState<HoldingValuation[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const [delDiv, setDelDiv] = useState<Dividend | null>(null);
  const [valDate, setValDate] = useState(todayISO());
  const [valAmount, setValAmount] = useState<number | undefined>(undefined);
  const [valError, setValError] = useState<string | null>(null);

  const reloadDividends = useCallback(() => {
    void listDividendsAction(holding.id).then(setDividends);
  }, [holding.id]);

  const reloadValuations = useCallback(() => {
    void listHoldingValuationsAction(holding.id).then(setValuations);
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
    void Promise.all(jobs).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [holding, quoted, plan]);

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

  const title =
    mode === "dividend" ? "Registrar dividendo" : mode === "valuation" ? "Valor del estado de cuenta" : name;

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

        {mode === "detail" ? (
          <div style={{ display: "grid", gap: 12 }}>
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

            {/* Acciones (las que ya existían) */}
            <div style={{ display: "grid", gap: 8 }}>
              <button
                type="button"
                className="m-btn m-btn-block m-btn-primary"
                disabled={pending}
                onClick={() => setMode("dividend")}
              >
                Registrar dividendo
              </button>
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
    </>
  );
}
