"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import {
  addHoldingAction,
  addInvestmentAction,
} from "@/modules/wealth/api/actions";

// ── Types & constants ─────────────────────────────────────────────

type WizardMode = "unica" | "dca";
type AssetCategory = "etf" | "accion" | "cripto";
type PriceMode = "live" | "custom";
type DcaFreq = "semanal" | "mensual" | "trimestral";

interface SymbolResult {
  symbol: string;
  description: string;
}

const CRYPTO_LIST: SymbolResult[] = [
  { symbol: "BTC", description: "Bitcoin" },
  { symbol: "ETH", description: "Ethereum" },
  { symbol: "SOL", description: "Solana" },
  { symbol: "XRP", description: "XRP" },
  { symbol: "ADA", description: "Cardano" },
  { symbol: "AVAX", description: "Avalanche" },
  { symbol: "DOGE", description: "Dogecoin" },
  { symbol: "LINK", description: "Chainlink" },
  { symbol: "MATIC", description: "Polygon" },
  { symbol: "DOT", description: "Polkadot" },
  { symbol: "LTC", description: "Litecoin" },
  { symbol: "BNB", description: "BNB" },
  { symbol: "TRX", description: "TRON" },
  { symbol: "SUI", description: "Sui" },
  { symbol: "APT", description: "Aptos" },
];

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  etf: "ETF",
  accion: "Acción",
  cripto: "Cripto",
};

const API_TYPE_MAP: Record<AssetCategory, string> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

const STEP_TITLES = [
  "¿Cómo quieres invertir?",
  "Elige el activo",
  "Detalles de la compra",
  "Plan DCA",
] as const;

function sym(currency: string): string {
  return { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[currency] ?? "";
}

// ── Exported trigger ──────────────────────────────────────────────

export function AddHoldingButton({ currency = "CRC" }: { currency?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Icon name="invest" width={2} />
        Agregar inversión
      </button>
      {open && <AddHoldingWizard currency={currency} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Wizard modal ──────────────────────────────────────────────────

function AddHoldingWizard({ currency, onClose }: { currency: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<WizardMode | null>(null);

  // Step 2
  const [assetCategory, setAssetCategory] = useState<AssetCategory>("etf");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SymbolResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedDescription, setSelectedDescription] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePriceCurrency, setLivePriceCurrency] = useState("USD");
  const [livePriceLoading, setLivePriceLoading] = useState(false);
  const [livePriceError, setLivePriceError] = useState(false);

  // Step 3
  const [priceMode, setPriceMode] = useState<PriceMode>("live");
  const [averageCost, setAverageCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [inputMode, setInputMode] = useState<"units" | "amount">("units");
  const [quantity, setQuantity] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [broker, setBroker] = useState("");
  const [holdingCurrency, setHoldingCurrency] = useState(currency);

  // Step 4
  const [dcaFrequency, setDcaFrequency] = useState<DcaFreq>("mensual");
  const [dcaAmount, setDcaAmount] = useState("");

  // Submit
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Debounced search
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const runSearch = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(
          `/api/market-price/search?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) { setSearchResults([]); return; }
        const data = (await res.json()) as { results?: SymbolResult[] };
        setSearchResults(data.results ?? []);
      } catch {
        // AbortError or network failure — silently ignored
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, []);

  const fetchLivePrice = useCallback(async (symbol: string, cat: AssetCategory) => {
    setLivePriceLoading(true);
    setLivePriceError(false);
    setLivePrice(null);
    try {
      const res = await fetch(
        `/api/market-price?symbol=${encodeURIComponent(symbol)}&type=${API_TYPE_MAP[cat]}`,
      );
      if (!res.ok) { setLivePriceError(true); setPriceMode("custom"); return; }
      const data = (await res.json()) as { price?: number; currency?: string };
      if (typeof data.price === "number" && data.price > 0) {
        setLivePrice(data.price);
        setLivePriceCurrency(data.currency ?? "USD");
        setAverageCost(String(data.price));
        setPriceMode("live");
      } else {
        setLivePriceError(true);
        setPriceMode("custom");
      }
    } catch {
      setLivePriceError(true);
      setPriceMode("custom");
    } finally {
      setLivePriceLoading(false);
    }
  }, []);

  const selectSymbol = useCallback(
    (symbol: string, description: string, cat: AssetCategory) => {
      const upper = symbol.toUpperCase();
      setSelectedSymbol(upper);
      setSelectedDescription(description);
      setSearchResults([]);
      setSearchQuery("");
      fetchLivePrice(upper, cat);
    },
    [fetchLivePrice],
  );

  const handleCategoryChange = (cat: AssetCategory) => {
    setAssetCategory(cat);
    setSelectedSymbol("");
    setSelectedDescription("");
    setSearchQuery("");
    setSearchResults([]);
    setLivePrice(null);
    setLivePriceError(false);
    setLivePriceLoading(false);
    setAverageCost("");
  };

  const handlePriceModeChange = (pm: PriceMode) => {
    setPriceMode(pm);
    if (pm === "live" && livePrice !== null) {
      setAverageCost(String(livePrice));
    }
  };

  // Derived
  const effectiveAvgCost =
    priceMode === "live" && livePrice !== null ? livePrice : parseFloat(averageCost) || 0;

  const quantityNum =
    inputMode === "units"
      ? parseFloat(quantity) || 0
      : effectiveAvgCost > 0
        ? (parseFloat(totalAmount) || 0) / effectiveAvgCost
        : 0;

  const totalSteps = mode === "dca" ? 4 : 3;
  const canAdvanceStep2 = selectedSymbol.length > 0;
  const canSave = quantityNum > 0 && !!purchaseDate;

  const handleSave = async () => {
    setErrorMsg(null);
    if (!selectedSymbol) { setErrorMsg("Selecciona un activo."); return; }
    if (quantityNum <= 0) { setErrorMsg("La cantidad debe ser mayor a 0."); return; }
    if (!purchaseDate) { setErrorMsg("Selecciona la fecha de compra."); return; }

    setPending(true);
    try {
      if (mode === "dca") {
        const dcaNum = parseFloat(dcaAmount) || 0;
        if (dcaNum > 0) {
          const freqLabel =
            dcaFrequency === "semanal" ? "Semanal"
            : dcaFrequency === "trimestral" ? "Trimestral"
            : "Mensual";
          await addInvestmentAction({
            name: `${selectedSymbol} — DCA ${freqLabel}`,
            assetType: assetCategory,
            symbol: selectedSymbol,
            investedAmount: quantityNum * effectiveAvgCost,
            contribution: dcaNum,
            currency: holdingCurrency,
            horizon: dcaFrequency,
          });
        }
      }

      const result = await addHoldingAction({
        symbol: selectedSymbol,
        assetType: assetCategory,
        quantity: quantityNum,
        averageCost: effectiveAvgCost,
        purchaseDate: purchaseDate || undefined,
        broker: broker.trim() || undefined,
        currency: holdingCurrency,
      });

      if (!result.ok) {
        const firstErr = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
        setErrorMsg(firstErr ?? result.message ?? "No pudimos guardar la posición.");
        return;
      }

      toast("Posición agregada");
      onClose();
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const stepTitle = STEP_TITLES[step - 1] ?? "";

  return (
    <Modal
      title="Agregar inversión"
      sub={`Paso ${step} de ${totalSteps} — ${stepTitle}`}
      onClose={onClose}
    >
      <div className="modal-body">
        {step === 1 && (
          <Step1Mode
            onSelect={(m) => { setMode(m); setStep(2); }}
          />
        )}

        {step === 2 && (
          <Step2Asset
            assetCategory={assetCategory}
            onCategoryChange={handleCategoryChange}
            searchQuery={searchQuery}
            onSearchChange={(q) => { setSearchQuery(q); runSearch(q); }}
            searchResults={searchResults}
            searchLoading={searchLoading}
            selectedSymbol={selectedSymbol}
            selectedDescription={selectedDescription}
            onSelectSymbol={selectSymbol}
            livePrice={livePrice}
            livePriceCurrency={livePriceCurrency}
            livePriceLoading={livePriceLoading}
            livePriceError={livePriceError}
          />
        )}

        {step === 3 && (
          <Step3Details
            livePrice={livePrice}
            livePriceCurrency={livePriceCurrency}
            livePriceError={livePriceError}
            priceMode={priceMode}
            onPriceModeChange={handlePriceModeChange}
            averageCost={averageCost}
            onAverageCostChange={setAverageCost}
            purchaseDate={purchaseDate}
            onPurchaseDateChange={setPurchaseDate}
            inputMode={inputMode}
            onInputModeChange={setInputMode}
            quantity={quantity}
            onQuantityChange={setQuantity}
            totalAmount={totalAmount}
            onTotalAmountChange={setTotalAmount}
            broker={broker}
            onBrokerChange={setBroker}
            holdingCurrency={holdingCurrency}
            onCurrencyChange={setHoldingCurrency}
            selectedSymbol={selectedSymbol}
            effectiveAvgCost={effectiveAvgCost}
            quantityNum={quantityNum}
          />
        )}

        {step === 4 && mode === "dca" && (
          <Step4DCA
            dcaFrequency={dcaFrequency}
            onFrequencyChange={setDcaFrequency}
            dcaAmount={dcaAmount}
            onAmountChange={setDcaAmount}
            holdingCurrency={holdingCurrency}
          />
        )}

        {errorMsg ? (
          <div className="auth-msg warn" role="alert" style={{ marginTop: 4 }}>
            {errorMsg}
          </div>
        ) : null}
      </div>

      <div className="modal-foot">
        {step === 1 ? (
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
            ← Atrás
          </button>
        )}

        {step >= 2 && step < totalSteps && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={step === 2 ? !canAdvanceStep2 : !canSave}
            onClick={() => setStep((s) => s + 1)}
          >
            Siguiente →
          </button>
        )}

        {step === totalSteps && step >= 3 && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !canSave}
            onClick={handleSave}
          >
            {pending ? "Guardando…" : "Guardar posición"}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ── Step 1: Única vs DCA ──────────────────────────────────────────

function Step1Mode({ onSelect }: { onSelect: (m: WizardMode) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <ModeCard
        title="Compra única"
        description="Registras una inversión puntual: una fecha, una cantidad y un precio. Ideal para algo que ya compraste o una entrada única."
        onClick={() => onSelect("unica")}
      />
      <ModeCard
        title="DCA — Promedio de costo"
        description="Inviertes un monto fijo de forma recurrente (p. ej. $500 cada mes). Suaviza el efecto de la volatilidad. Guardamos tu plan y te recordamos registrar cada compra real; las proyecciones son solo informativas."
        onClick={() => onSelect("dca")}
      />
    </div>
  );
}

function ModeCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="mode-card" onClick={onClick}>
      <div className="mode-card-title">{title}</div>
      <div className="mode-card-desc">{description}</div>
    </button>
  );
}

// ── Step 2: Asset selection ───────────────────────────────────────

function Step2Asset({
  assetCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  searchResults,
  searchLoading,
  selectedSymbol,
  selectedDescription,
  onSelectSymbol,
  livePrice,
  livePriceCurrency,
  livePriceLoading,
  livePriceError,
}: {
  assetCategory: AssetCategory;
  onCategoryChange: (cat: AssetCategory) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: SymbolResult[];
  searchLoading: boolean;
  selectedSymbol: string;
  selectedDescription: string;
  onSelectSymbol: (symbol: string, description: string, cat: AssetCategory) => void;
  livePrice: number | null;
  livePriceCurrency: string;
  livePriceLoading: boolean;
  livePriceError: boolean;
}) {
  return (
    <div>
      {/* Category chips */}
      <div className="fld">
        <label className="fld-label">Tipo de activo</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["etf", "accion", "cripto"] as AssetCategory[]).map((cat) => (
            <PillButton
              key={cat}
              active={assetCategory === cat}
              onClick={() => onCategoryChange(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </PillButton>
          ))}
        </div>
      </div>

      {/* ETF / Acción: live search */}
      {assetCategory !== "cripto" && (
        <div className="fld">
          <label className="fld-label">
            Buscar {assetCategory === "etf" ? "ETF" : "acción"}
          </label>
          <input
            className="inp"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Símbolo o nombre (ej. VOO, Apple, S&P 500…)"
            autoComplete="off"
            autoFocus
          />
          {searchLoading && (
            <span className="muted" style={{ fontSize: 12 }}>
              Buscando…
            </span>
          )}
          {!searchLoading && searchResults.length > 0 && (
            <div className="symbol-results">
              {searchResults.map((r, i) => (
                <button
                  key={r.symbol}
                  type="button"
                  className="symbol-row"
                  style={{
                    borderBottom:
                      i < searchResults.length - 1 ? "1px solid var(--line)" : "none",
                  }}
                  onClick={() => onSelectSymbol(r.symbol, r.description, assetCategory)}
                >
                  <span className="symbol-row-sym">{r.symbol}</span>
                  <span className="symbol-row-desc">{r.description}</span>
                </button>
              ))}
            </div>
          )}
          {!searchLoading && searchResults.length === 0 && searchQuery.length >= 2 && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 6, fontSize: 12, alignSelf: "flex-start" }}
              onClick={() =>
                onSelectSymbol(searchQuery.toUpperCase(), searchQuery.toUpperCase(), assetCategory)
              }
            >
              Usar &ldquo;{searchQuery.toUpperCase()}&rdquo; como símbolo
            </button>
          )}
        </div>
      )}

      {/* Cripto: curated dropdown */}
      {assetCategory === "cripto" && (
        <div className="fld">
          <label className="fld-label">Criptomoneda</label>
          <select
            className="sel"
            value={selectedSymbol}
            onChange={(e) => {
              const found = CRYPTO_LIST.find((c) => c.symbol === e.target.value);
              if (found) onSelectSymbol(found.symbol, found.description, "cripto");
            }}
          >
            <option value="">— Elige una criptomoneda —</option>
            {CRYPTO_LIST.map((c) => (
              <option key={c.symbol} value={c.symbol}>
                {c.symbol} — {c.description}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Selected asset + live price badge */}
      {selectedSymbol && (
        <div className="asset-badge">
          <div>
            <span className="asset-badge-sym">{selectedSymbol}</span>
            {selectedDescription && selectedDescription !== selectedSymbol && (
              <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>
                {selectedDescription}
              </span>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            {livePriceLoading && (
              <span className="muted" style={{ fontSize: 12 }}>
                Cargando precio…
              </span>
            )}
            {!livePriceLoading && livePrice !== null && !livePriceError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{ fontFamily: "var(--serif)", fontSize: 17, fontWeight: 700, color: "var(--ink)" }}
                >
                  {formatMoney(livePrice, livePriceCurrency)}
                </span>
                <span
                  className="chip"
                  style={{ background: "var(--pos-soft)", color: "var(--pos)", fontSize: 10 }}
                >
                  en vivo
                </span>
              </div>
            )}
            {!livePriceLoading && livePriceError && (
              <span style={{ fontSize: 12, color: "var(--warn)" }}>Precio no disponible</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Details ───────────────────────────────────────────────

function Step3Details({
  livePrice,
  livePriceCurrency,
  livePriceError,
  priceMode,
  onPriceModeChange,
  averageCost,
  onAverageCostChange,
  purchaseDate,
  onPurchaseDateChange,
  inputMode,
  onInputModeChange,
  quantity,
  onQuantityChange,
  totalAmount,
  onTotalAmountChange,
  broker,
  onBrokerChange,
  holdingCurrency,
  onCurrencyChange,
  selectedSymbol,
  effectiveAvgCost,
  quantityNum,
}: {
  livePrice: number | null;
  livePriceCurrency: string;
  livePriceError: boolean;
  priceMode: PriceMode;
  onPriceModeChange: (pm: PriceMode) => void;
  averageCost: string;
  onAverageCostChange: (v: string) => void;
  purchaseDate: string;
  onPurchaseDateChange: (v: string) => void;
  inputMode: "units" | "amount";
  onInputModeChange: (m: "units" | "amount") => void;
  quantity: string;
  onQuantityChange: (v: string) => void;
  totalAmount: string;
  onTotalAmountChange: (v: string) => void;
  broker: string;
  onBrokerChange: (v: string) => void;
  holdingCurrency: string;
  onCurrencyChange: (v: string) => void;
  selectedSymbol: string;
  effectiveAvgCost: number;
  quantityNum: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const derivedQty =
    inputMode === "amount" && effectiveAvgCost > 0
      ? (parseFloat(totalAmount) || 0) / effectiveAvgCost
      : null;

  return (
    <div>
      {/* Price mode selector — only when live price is available */}
      {livePrice !== null && !livePriceError && (
        <div className="fld">
          <label className="fld-label">Precio de compra</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <PillButton active={priceMode === "live"} onClick={() => onPriceModeChange("live")}>
              Precio actual ({formatMoney(livePrice, livePriceCurrency)})
            </PillButton>
            <PillButton active={priceMode === "custom"} onClick={() => onPriceModeChange("custom")}>
              Precio personalizado
            </PillButton>
          </div>
          {priceMode === "live" && (
            <div className="auth-msg" style={{ marginBottom: 0 }}>
              Se usará {formatMoney(livePrice, livePriceCurrency)} como precio de compra. Cambia a
              &ldquo;Precio personalizado&rdquo; si compraste a otro precio.
            </div>
          )}
        </div>
      )}

      {/* Custom price input */}
      {(priceMode === "custom" || livePrice === null) && (
        <div className="fld">
          <label className="fld-label">Precio por unidad</label>
          <div className="inp-money">
            <span className="pre">{sym(holdingCurrency)}</span>
            <input
              type="number"
              step="any"
              min="0"
              value={averageCost}
              onChange={(e) => onAverageCostChange(e.target.value)}
              placeholder="0.00"
              autoFocus={livePrice === null}
            />
          </div>
        </div>
      )}

      {/* Purchase date */}
      <div className="fld">
        <label className="fld-label">Fecha de compra</label>
        <input
          className="inp"
          type="date"
          value={purchaseDate}
          max={today}
          onChange={(e) => onPurchaseDateChange(e.target.value)}
          required
        />
      </div>

      {/* Quantity / Amount toggle */}
      <div className="fld">
        <label className="fld-label">¿Cómo ingresas la compra?</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
          <PillButton
            active={inputMode === "units"}
            onClick={() => onInputModeChange("units")}
          >
            Cantidad de unidades
          </PillButton>
          <PillButton
            active={inputMode === "amount"}
            onClick={() => onInputModeChange("amount")}
          >
            Monto total invertido
          </PillButton>
        </div>

        {inputMode === "units" ? (
          <div className="inp-money">
            <span className="pre" style={{ fontSize: 11, minWidth: 40 }}>
              {selectedSymbol}
            </span>
            <input
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => onQuantityChange(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>
        ) : (
          <>
            <div className="inp-money">
              <span className="pre">{sym(holdingCurrency)}</span>
              <input
                type="number"
                step="any"
                min="0"
                value={totalAmount}
                onChange={(e) => onTotalAmountChange(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>
            {derivedQty !== null && derivedQty > 0 && (
              <div className="auth-msg" style={{ marginBottom: 0, fontSize: 12 }}>
                ≈ {derivedQty.toFixed(6)} unidades de {selectedSymbol}
              </div>
            )}
          </>
        )}
      </div>

      {/* Broker + Currency */}
      <div className="fld-2">
        <div className="fld">
          <label className="fld-label">Broker (opcional)</label>
          <input
            className="inp"
            value={broker}
            onChange={(e) => onBrokerChange(e.target.value)}
            placeholder="Ej. Interactive Brokers"
          />
        </div>
        <div className="fld">
          <label className="fld-label">Moneda</label>
          <select
            className="sel"
            value={holdingCurrency}
            onChange={(e) => onCurrencyChange(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cost summary */}
      {quantityNum > 0 && effectiveAvgCost > 0 && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--surface-2)",
            borderRadius: "var(--r-md)",
            fontSize: 12.5,
            color: "var(--muted)",
            lineHeight: 1.5,
          }}
        >
          Costo total:{" "}
          <strong style={{ color: "var(--ink-2)" }}>
            {formatMoney(quantityNum * effectiveAvgCost, holdingCurrency)}
          </strong>
          {" · "}
          {quantityNum.toFixed(quantityNum < 1 ? 6 : 4)} {selectedSymbol} @{" "}
          {formatMoney(effectiveAvgCost, holdingCurrency)}
        </div>
      )}
    </div>
  );
}

// ── Step 4: DCA plan ──────────────────────────────────────────────

function Step4DCA({
  dcaFrequency,
  onFrequencyChange,
  dcaAmount,
  onAmountChange,
  holdingCurrency,
}: {
  dcaFrequency: DcaFreq;
  onFrequencyChange: (f: DcaFreq) => void;
  dcaAmount: string;
  onAmountChange: (v: string) => void;
  holdingCurrency: string;
}) {
  return (
    <div>
      <div className="auth-msg">
        Este plan es solo informativo. Registra cada compra real por separado para mantener tu
        costo promedio ponderado actualizado.
      </div>
      <div className="fld-2">
        <div className="fld">
          <label className="fld-label">Frecuencia de aporte</label>
          <select
            className="sel"
            value={dcaFrequency}
            onChange={(e) => onFrequencyChange(e.target.value as DcaFreq)}
          >
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
            <option value="trimestral">Trimestral</option>
          </select>
        </div>
        <div className="fld">
          <label className="fld-label">Monto por aporte</label>
          <div className="inp-money">
            <span className="pre">{sym(holdingCurrency)}</span>
            <input
              type="number"
              step="any"
              min="0"
              value={dcaAmount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "5px 13px",
        borderRadius: 999,
        border: `1.5px solid ${active ? "var(--ink)" : "var(--line)"}`,
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--bg)" : "var(--muted)",
        fontSize: 12.5,
        fontWeight: active ? 500 : 400,
        cursor: "pointer",
        transition: "border-color 0.12s, background 0.12s, color 0.12s",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}
