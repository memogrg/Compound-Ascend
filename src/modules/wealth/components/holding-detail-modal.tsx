"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { PerformanceChart, type AreaPoint } from "@/components/charts/lazy";
import { formatMoney, formatPercent } from "@/lib/format";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import {
  getHoldingHistoryAction,
  listDividendsAction,
  addDividendAction,
  removeDividendAction,
  listRentalPaymentsAction,
  addRentalIncomeAction,
  removeRentalPaymentAction,
  sellHoldingAction,
  listLinkableDebtsAction,
  type LinkableDebt,
} from "@/modules/wealth/api/actions";
import { EditHoldingButton } from "@/modules/wealth/components/add-holding-wizard";
import type { Holding, Dividend, RentalPayment } from "@/modules/wealth/types";
import type { Period } from "@/modules/wealth/services/holding-history-service";

const RENTAL_FREQ_PER_YEAR: Record<string, number> = { semanal: 52, mensual: 12, trimestral: 4, semestral: 2, anual: 1 };
const QUOTED_TYPES = new Set(["etf", "accion", "cripto"]);

const PERIODS: { label: string; value: Period }[] = [
  { label: "1M", value: "1M" },
  { label: "3M", value: "3M" },
  { label: "1A", value: "1Y" },
  { label: "Todo", value: "all" },
];

const PAYMENTS_PER_YEAR: Record<string, number> = {
  mensual: 12,
  trimestral: 4,
  semestral: 2,
  anual: 1,
};

function sym(currency: string): string {
  return { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[currency] ?? "";
}

// ── Exported trigger ──────────────────────────────────────────────

export function HoldingDetailButton({
  holding,
  currentPrice,
  currency,
}: {
  holding: Holding;
  currentPrice: number | null;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ fontSize: 12, padding: "5px 10px" }}
        onClick={() => setOpen(true)}
      >
        Detalle
      </button>
      {open && (
        <HoldingDetailModal
          holding={holding}
          currentPrice={currentPrice}
          currency={currency}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Modal ─────────────────────────────────────────────────────────

export function HoldingDetailModal({
  holding,
  editHolding,
  currentPrice,
  currency,
  onClose,
}: {
  holding: Holding;
  /**
   * Holding CRUDO para la edición (averageCost en su moneda real). El `holding`
   * que pinta el detalle puede venir normalizado a la moneda principal para los
   * agregados; si se omite, se cae a `holding`.
   */
  editHolding?: Holding;
  currentPrice: number | null;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [period, setPeriod] = useState<Period>("all");
  const [history, setHistory] = useState<AreaPoint[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [divLoading, setDivLoading] = useState(true);
  const [rentals, setRentals] = useState<RentalPayment[]>([]);
  const [linkedDebt, setLinkedDebt] = useState<LinkableDebt | null>(null);

  const costBasis = holding.quantity * holding.averageCost;
  // No cotizados: valor manual del usuario (no precio×cantidad).
  const isRental = !QUOTED_TYPES.has(holding.assetType);
  const currentValue =
    currentPrice !== null
      ? holding.quantity * currentPrice
      : (holding.currentValueManual ?? costBasis);
  const profitLoss = currentValue - costBasis;
  const returnPct = costBasis > 0 ? profitLoss / costBasis : 0;
  const positive = profitLoss >= 0;

  // Load history
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const pts = await getHoldingHistoryAction(holding, currentPrice, period);
      setHistory(pts);
    } finally {
      setHistLoading(false);
    }
  }, [holding, currentPrice, period]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Load dividends
  useEffect(() => {
    void listDividendsAction(holding.id).then((d) => {
      setDividends(d);
      setDivLoading(false);
    });
  }, [holding.id]);

  // Load rental payments (solo activos no cotizados)
  useEffect(() => {
    if (isRental) void listRentalPaymentsAction(holding.id).then(setRentals);
  }, [holding.id, isRental]);

  // Deuda ligada (C-1b): muestra quién financia el inmueble. Solo si hay debtId.
  useEffect(() => {
    if (!holding.debtId) {
      setLinkedDebt(null);
      return;
    }
    void listLinkableDebtsAction().then((debts) => {
      setLinkedDebt(debts.find((d) => d.id === holding.debtId) ?? null);
    });
  }, [holding.debtId]);

  const totalDividends = dividends.reduce((s, d) => s + d.amount, 0);

  return (
    <Modal
      title={holding.label ?? holding.symbol}
      sub={holding.label ? holding.symbol : holding.assetType}
      onClose={onClose}
    >
      <div className="modal-body" style={{ padding: 0 }}>
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 22px 0" }}
        >
          <EditHoldingButton holding={editHolding ?? holding} currency={currency} />
        </div>
        {linkedDebt ? (
          <div
            style={{
              margin: "8px 22px 0",
              padding: "9px 12px",
              borderRadius: 10,
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              fontSize: 12.5,
            }}
          >
            <span className="muted">Financiada por: </span>
            <strong>{linkedDebt.name}</strong>
            <span className="muted">
              {" · "}
              {formatMoney(linkedDebt.currentPayment, linkedDebt.currency)}/mes
            </span>
          </div>
        ) : null}
        {/* Header metrics */}
        <div
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid var(--line)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 12,
          }}
        >
          <Metric
            label="Valor actual"
            value={formatMoney(currentValue, currency)}
            accent="var(--ink)"
          />
          <Metric
            label="ROI"
            value={`${positive ? "+" : ""}${formatPercent(returnPct)}`}
            accent={positive ? "var(--pos)" : "var(--neg)"}
          />
          <Metric
            label="Ganancia / pérdida"
            value={`${positive ? "+" : ""}${formatMoney(profitLoss, currency)}`}
            accent={positive ? "var(--pos)" : "var(--neg)"}
          />
          <Metric
            label="Costo promedio"
            value={formatMoney(holding.averageCost, holding.currency)}
          />
          {currentPrice !== null && (
            <Metric
              label="Precio actual"
              value={formatMoney(currentPrice, currency)}
              chip="en vivo"
            />
          )}
          <Metric
            label="Cantidad"
            value={`${holding.quantity.toFixed(holding.quantity < 1 ? 6 : 4)} uds.`}
          />
        </div>

        {/* Chart */}
        <div style={{ padding: "14px 22px 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)" }}>
              Evolución del valor
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPeriod(p.value)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontSize: 11.5,
                    fontWeight: period === p.value ? 600 : 400,
                    background: period === p.value ? "var(--ink)" : "var(--chip)",
                    color: period === p.value ? "var(--bg)" : "var(--muted)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {histLoading ? (
            <div
              style={{
                height: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span className="muted" style={{ fontSize: 12 }}>
                Cargando…
              </span>
            </div>
          ) : (
            <PerformanceChart data={history} currency={currency} costBasis={costBasis} />
          )}
          {history.length > 0 && history[0]!.value !== history[history.length - 1]!.value && (
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4, paddingBottom: 4 }}>
              * Serie sintética — no representa precios históricos reales.
            </div>
          )}
        </div>

        {/* Dividendos: solo activos cotizados (no se mezcla con renta) */}
        {!isRental && (
          <div
            style={{ padding: "14px 22px 0", borderTop: "1px solid var(--line)", marginTop: 14 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                  Dividendos
                </div>
                {totalDividends > 0 && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    Total recibido: {formatMoney(totalDividends, currency)}
                  </div>
                )}
              </div>
            </div>
            <DividendForm
              holding={holding}
              currentValue={currentValue}
              onAdded={() => {
                void listDividendsAction(holding.id).then(setDividends);
                toast("Dividendo registrado");
                router.refresh();
              }}
            />
            {divLoading ? null : dividends.length > 0 ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {dividends.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "7px 10px",
                      background: "var(--surface-2)",
                      borderRadius: "var(--r-md)",
                      fontSize: 12.5,
                    }}
                  >
                    <span style={{ color: "var(--muted)" }}>{d.paymentDate}</span>
                    <span style={{ fontWeight: 500, color: "var(--pos)" }}>
                      +{formatMoney(d.amount, d.currency)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: "2px 8px", color: "var(--neg)" }}
                      onClick={async () => {
                        await removeDividendAction(d.id);
                        setDividends((prev) => prev.filter((x) => x.id !== d.id));
                        router.refresh();
                      }}
                    >
                      Borrar
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 6, paddingBottom: 8 }}>
                Sin dividendos registrados aún.
              </div>
            )}
          </div>
        )}

        {isRental && (
          <RentalSection
            holding={holding}
            currency={currency}
            currentValue={currentValue}
            rentals={rentals}
            onChange={() => {
              void listRentalPaymentsAction(holding.id).then(setRentals);
              router.refresh();
            }}
          />
        )}

        {/* Venta / retiro parcial (Fase 4 · flujos inversos) */}
        <SaleSection
          holding={holding}
          isRental={isRental}
          onSold={() => {
            toast("Venta registrada como ingreso vinculado");
            router.refresh();
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}

// Venta/retiro parcial: el dinero recibido entra como ingreso vinculado a la
// posición y la posición disminuye (cantidad o valor manual).
function SaleSection({
  holding,
  isRental,
  onSold,
}: {
  holding: Holding;
  isRental: boolean;
  onSold: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState("");
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return setError("Ingresa el monto recibido.");
    const quantitySold = !isRental ? parseFloat(qty) || 0 : 0;
    if (!isRental && (quantitySold <= 0 || quantitySold > holding.quantity)) {
      return setError(`Cantidad inválida (tienes ${holding.quantity}).`);
    }
    setPending(true);
    setError(null);
    const res = await sellHoldingAction({
      holdingId: holding.id,
      saleDate,
      amount: amt,
      currency: holding.currency,
      quantitySold: quantitySold > 0 ? quantitySold : undefined,
    });
    setPending(false);
    if (res.ok) onSold();
    else setError(res.message ?? "No pudimos registrar la venta.");
  };

  return (
    <div style={{ padding: "14px 22px 18px", borderTop: "1px solid var(--line)", marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Venta / retiro</div>
          <div className="muted" style={{ fontSize: 12 }}>
            El dinero recibido entra como ingreso vinculado y la posición disminuye.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: "5px 10px" }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cerrar" : "Registrar venta"}
        </button>
      </div>

      {open && (
        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: "var(--r-md)",
            padding: "12px 14px",
            marginTop: 10,
          }}
        >
          {error ? (
            <div className="auth-msg warn" role="alert" style={{ marginBottom: 8 }}>
              {error}
            </div>
          ) : null}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isRental ? "1fr 1fr" : "1fr 1fr 1fr",
              gap: 8,
            }}
          >
            {!isRental && (
              <div className="fld" style={{ marginBottom: 0 }}>
                <label className="fld-label">Cantidad vendida</label>
                <input
                  className="inp"
                  type="number"
                  step="any"
                  min="0"
                  max={holding.quantity}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder={`máx. ${holding.quantity}`}
                />
              </div>
            )}
            <div className="fld" style={{ marginBottom: 0 }}>
              <label className="fld-label">Monto recibido</label>
              <div className="inp-money">
                <span className="pre">{sym(holding.currency)}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <label className="fld-label">Fecha</label>
              <input
                className="inp"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 10, fontSize: 12.5, padding: "8px 14px" }}
            onClick={() => void submit()}
            disabled={pending}
          >
            {pending ? "Guardando…" : "Registrar venta"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function Metric({
  label,
  value,
  accent,
  chip,
}: {
  label: string;
  value: string;
  accent?: string;
  chip?: string;
}) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 3 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: accent ?? "var(--ink-2)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {value}
        {chip && (
          <span
            className="chip"
            style={{ background: "var(--pos-soft)", color: "var(--pos)", fontSize: 9 }}
          >
            {chip}
          </span>
        )}
      </div>
    </div>
  );
}

function DividendForm({
  holding,
  currentValue,
  onAdded,
}: {
  holding: Holding;
  currentValue: number;
  onAdded: () => void;
}) {
  const [mode, setMode] = useState<"yield" | "amount">("amount");
  const [yieldPct, setYieldPct] = useState("");
  const [frequency, setFrequency] = useState<"mensual" | "trimestral" | "semestral" | "anual">(
    "anual",
  );
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [divCurrency, setDivCurrency] = useState(holding.currency);
  const [pending, setPending] = useState(false);

  const paymentsPerYear = PAYMENTS_PER_YEAR[frequency] ?? 1;
  const derivedAmount =
    mode === "yield" && yieldPct
      ? (currentValue * parseFloat(yieldPct)) / 100 / paymentsPerYear
      : null;
  const effectiveAmount = mode === "yield" ? (derivedAmount ?? 0) : parseFloat(amount) || 0;

  const handleSubmit = async () => {
    if (effectiveAmount <= 0) return;
    setPending(true);
    try {
      await addDividendAction({
        holdingId: holding.id,
        paymentDate,
        amount: effectiveAmount,
        currency: divCurrency,
        yieldPct: mode === "yield" ? parseFloat(yieldPct) : undefined,
        frequency,
        holdingLabel: holding.label ?? undefined,
        holdingSymbol: holding.symbol,
      });
      setAmount("");
      setYieldPct("");
      onAdded();
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--surface-2)",
        borderRadius: "var(--r-md)",
        padding: "12px 14px",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(["amount", "yield"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 12,
              border: `1.5px solid ${mode === m ? "var(--ink)" : "var(--line)"}`,
              background: mode === m ? "var(--ink)" : "transparent",
              color: mode === m ? "var(--bg)" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            {m === "amount" ? "Monto fijo" : "Por rendimiento (%)"}
          </button>
        ))}
      </div>

      {mode === "yield" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div className="fld" style={{ marginBottom: 0 }}>
            <label className="fld-label">% anual</label>
            <div className="inp-money">
              <span className="pre">%</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={yieldPct}
                onChange={(e) => setYieldPct(e.target.value)}
                placeholder="2.5"
              />
            </div>
          </div>
          <div className="fld" style={{ marginBottom: 0 }}>
            <label className="fld-label">Frecuencia</label>
            <select
              className="sel"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            >
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>
          </div>
          {derivedAmount !== null && derivedAmount > 0 && (
            <div className="auth-msg" style={{ gridColumn: "1/-1", marginBottom: 0, fontSize: 12 }}>
              Monto por pago: {formatMoney(derivedAmount, divCurrency)}
            </div>
          )}
        </div>
      ) : (
        <div className="fld-2" style={{ marginBottom: 8 }}>
          <div className="fld" style={{ marginBottom: 0 }}>
            <label className="fld-label">Monto recibido</label>
            <div className="inp-money">
              <span className="pre">{sym(divCurrency)}</span>
              <input
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="fld" style={{ marginBottom: 0 }}>
            <label className="fld-label">Moneda</label>
            <select
              className="sel"
              value={divCurrency}
              onChange={(e) => setDivCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="fld-2" style={{ marginBottom: 8 }}>
        <div className="fld" style={{ marginBottom: 0 }}>
          <label className="fld-label">Fecha de pago</label>
          <input
            className="inp"
            type="date"
            value={paymentDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ fontSize: 12.5 }}
        disabled={pending || effectiveAmount <= 0}
        onClick={handleSubmit}
      >
        {pending ? "Guardando…" : "Registrar dividendo"}
      </button>
    </div>
  );
}

// ── Renta (activos no cotizados) ──────────────────────────────────

function RentalSection({
  holding,
  currency,
  currentValue,
  rentals,
  onChange,
}: {
  holding: Holding;
  currency: string;
  currentValue: number;
  rentals: RentalPayment[];
  onChange: () => void;
}) {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const cfgFreq = holding.rentalFrequency ?? "mensual";
  const annualRent = (holding.rentalIncome ?? 0) * (RENTAL_FREQ_PER_YEAR[cfgFreq] ?? 12);
  const rentYield = currentValue > 0 ? annualRent / currentValue : 0;
  const totalReceived = rentals.reduce((s, r) => s + r.amount, 0);

  const [amount, setAmount] = useState(
    holding.rentalIncome != null ? String(holding.rentalIncome) : "",
  );
  const [date, setDate] = useState(today);
  const [freq, setFreq] = useState<
    "semanal" | "mensual" | "trimestral" | "semestral" | "anual" | "al_vencimiento"
  >(cfgFreq);
  const [rentCurrency, setRentCurrency] = useState(holding.currency);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const value = parseFloat(amount) || 0;
    if (value <= 0) return;
    setPending(true);
    try {
      const res = await addRentalIncomeAction({
        holdingId: holding.id,
        receivedOn: date,
        amount: value,
        currency: rentCurrency,
        frequency: freq,
        holdingLabel: holding.label ?? undefined,
        holdingSymbol: holding.symbol,
      });
      if (res.ok) {
        toast("Renta registrada");
        setAmount("");
        onChange();
      } else {
        toast(res.message ?? "No se pudo registrar", "error");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ padding: "14px 22px 0", borderTop: "1px solid var(--line)", marginTop: 14 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
        Renta
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <Metric
          label="Total recibido"
          value={formatMoney(totalReceived, currency)}
          accent="var(--pos)"
        />
        {holding.rentalIncome ? (
          <Metric
            label={`Renta ${cfgFreq}`}
            value={formatMoney(holding.rentalIncome, holding.currency)}
          />
        ) : null}
        {rentYield > 0 ? (
          <Metric label="Yield de renta" value={formatPercent(rentYield)} accent="var(--pos)" />
        ) : null}
      </div>

      <div
        style={{
          background: "var(--surface-2)",
          borderRadius: "var(--r-md)",
          padding: "12px 14px",
          marginBottom: 8,
        }}
      >
        <div className="fld-2" style={{ marginBottom: 8 }}>
          <div className="fld" style={{ marginBottom: 0 }}>
            <label className="fld-label">Monto recibido</label>
            <div className="inp-money">
              <span className="pre">{sym(rentCurrency)}</span>
              <input
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="fld" style={{ marginBottom: 0 }}>
            <label className="fld-label">Moneda</label>
            <select
              className="sel"
              value={rentCurrency}
              onChange={(e) => setRentCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="fld-2" style={{ marginBottom: 8 }}>
          <div className="fld" style={{ marginBottom: 0 }}>
            <label className="fld-label">Fecha</label>
            <input
              className="inp"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="fld" style={{ marginBottom: 0 }}>
            <label className="fld-label">Frecuencia</label>
            <select
              className="sel"
              value={freq}
              onChange={(e) => setFreq(e.target.value as typeof freq)}
            >
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ fontSize: 12.5 }}
          disabled={pending || (parseFloat(amount) || 0) <= 0}
          onClick={submit}
        >
          {pending ? "Guardando…" : "Registrar renta"}
        </button>
      </div>

      {rentals.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 8 }}>
          {rentals.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 10px",
                background: "var(--surface-2)",
                borderRadius: "var(--r-md)",
                fontSize: 12.5,
              }}
            >
              <span style={{ color: "var(--muted)" }}>{r.receivedOn}</span>
              <span style={{ fontWeight: 500, color: "var(--pos)" }}>
                +{formatMoney(r.amount, r.currency)}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: "2px 8px", color: "var(--neg)" }}
                onClick={async () => {
                  await removeRentalPaymentAction(r.id);
                  onChange();
                }}
              >
                Borrar
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2, paddingBottom: 8 }}>
          Sin renta registrada aún. La renta que registres suma a tu ingreso pasivo.
        </div>
      )}
    </div>
  );
}
