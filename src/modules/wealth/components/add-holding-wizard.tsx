"use client";

import { useState, useRef, useCallback, useEffect, useId, type ReactNode } from "react";
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
import type { AssetType, Holding } from "@/modules/wealth/types";

// ── Types & constants ─────────────────────────────────────────────

type WizardMode = "puntual" | "dca";
type PriceMode = "live" | "custom";
type DcaFreq = "semanal" | "mensual" | "trimestral";

interface SymbolResult {
  symbol: string;
  description: string;
}

interface InitialHolding {
  symbol: string;
  assetCategory: AssetType;
  description?: string;
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

const LIVE_PRICE_TYPES = new Set<AssetType>(["etf", "accion", "cripto"]);

function hasLivePrice(cat: AssetType): boolean {
  return LIVE_PRICE_TYPES.has(cat);
}

const API_TYPE_MAP: Partial<Record<AssetType, string>> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

const LIVE_CATEGORY_LABELS: Array<[AssetType, string]> = [
  ["etf", "ETF"],
  ["accion", "Acción"],
  ["cripto", "Cripto"],
];

const OTHER_ASSET_TYPES: Array<[AssetType, string]> = [
  ["bono", "Bono"],
  ["fondo", "Fondo"],
  ["certificado", "Certificado"],
  ["inmueble", "Bienes raíces"],
  ["negocio", "Negocio"],
  ["pension", "Pensión"],
  ["commodity", "Commodity"],
  ["arte", "Arte / Coleccionables"],
  ["nft", "NFT"],
  ["otro", "Otro"],
];

const DEFAULT_SYMBOL: Partial<Record<AssetType, string>> = {
  bono: "BONO",
  fondo: "FONDO",
  certificado: "CERT",
  inmueble: "INMU",
  negocio: "NEG",
  pension: "PENS",
  commodity: "COMM",
  arte: "ARTE",
  nft: "NFT",
  otro: "OTRO",
};

const OTHER_TYPE_LABEL: Partial<Record<AssetType, string>> = {
  bono: "Bono",
  fondo: "Fondo de inversión",
  certificado: "Certificado",
  inmueble: "Bienes raíces",
  negocio: "Negocio",
  pension: "Pensión",
  commodity: "Commodity",
  arte: "Arte / Coleccionables",
  nft: "NFT",
  otro: "Otro activo",
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

// ── Exported triggers ─────────────────────────────────────────────

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

export function AddPurchaseButton({ holding, currency }: { holding: Holding; currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn btn-ghost"
        style={{ fontSize: 12, padding: "5px 10px" }}
        onClick={() => setOpen(true)}
      >
        + Compra
      </button>
      {open && (
        <AddHoldingWizard
          currency={currency}
          initialHolding={{
            symbol: holding.symbol,
            assetCategory: holding.assetType,
            description: holding.label ?? holding.symbol,
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Wizard modal ──────────────────────────────────────────────────

function AddHoldingWizard({
  currency,
  onClose,
  initialHolding,
}: {
  currency: string;
  onClose: () => void;
  initialHolding?: InitialHolding;
}) {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState(initialHolding ? 3 : 1);
  const [mode, setMode] = useState<WizardMode | null>(initialHolding ? "puntual" : null);

  // Step 2
  const [assetCategory, setAssetCategory] = useState<AssetType>(
    initialHolding?.assetCategory ?? "etf",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SymbolResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(initialHolding?.symbol ?? "");
  const [selectedDescription, setSelectedDescription] = useState(
    initialHolding?.description ?? "",
  );
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePriceCurrency, setLivePriceCurrency] = useState("USD");
  const [livePriceLoading, setLivePriceLoading] = useState(false);
  const [livePriceError, setLivePriceError] = useState(false);

  // Step 3
  const [label, setLabel] = useState(
    initialHolding?.description ?? initialHolding?.symbol ?? "",
  );
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

  const fetchLivePrice = useCallback(async (symbol: string, cat: AssetType) => {
    if (!hasLivePrice(cat)) return;
    const apiType = API_TYPE_MAP[cat];
    if (!apiType) return;
    setLivePriceLoading(true);
    setLivePriceError(false);
    setLivePrice(null);
    try {
      const res = await fetch(
        `/api/market-price?symbol=${encodeURIComponent(symbol)}&type=${apiType}`,
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

  // Fetch live price when jumping to step 3 via initialHolding
  useEffect(() => {
    if (initialHolding) {
      fetchLivePrice(initialHolding.symbol, initialHolding.assetCategory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSymbol = useCallback(
    (symbol: string, description: string, cat: AssetType) => {
      const upper = symbol.toUpperCase();
      setSelectedSymbol(upper);
      setSelectedDescription(description);
      setLabel(description || upper);
      setSearchResults([]);
      setSearchQuery("");
      fetchLivePrice(upper, cat);
    },
    [fetchLivePrice],
  );

  const handleCategoryChange = (cat: AssetType) => {
    setAssetCategory(cat);
    setSearchQuery("");
    setSearchResults([]);
    setLivePrice(null);
    setLivePriceError(false);
    setLivePriceLoading(false);
    setAverageCost("");
    if (!hasLivePrice(cat)) {
      const defSym = DEFAULT_SYMBOL[cat] ?? cat.toUpperCase().slice(0, 6);
      setSelectedSymbol(defSym);
      setSelectedDescription("");
      setLabel(OTHER_TYPE_LABEL[cat] ?? defSym);
    } else {
      setSelectedSymbol("");
      setSelectedDescription("");
    }
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

  const isFirstVisibleStep = step === 1 || (!!initialHolding && step === 3);

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
            name: label.trim() || `${selectedSymbol} — DCA ${freqLabel}`,
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
        label: label.trim() || undefined,
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
      title={initialHolding ? `Agregar compra — ${initialHolding.symbol}` : "Agregar inversión"}
      sub={initialHolding ? "Nueva compra del mismo activo" : `Paso ${step} de ${totalSteps} — ${stepTitle}`}
      onClose={onClose}
    >
      <div className="modal-body">
        {step === 1 && (
          <Step1Mode onSelect={(m) => { setMode(m); setStep(2); }} />
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
            onSymbolManualChange={(s) => setSelectedSymbol(s.toUpperCase().slice(0, 12))}
            livePrice={livePrice}
            livePriceCurrency={livePriceCurrency}
            livePriceLoading={livePriceLoading}
            livePriceError={livePriceError}
          />
        )}

        {step === 3 && (
          <Step3Details
            label={label}
            onLabelChange={setLabel}
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
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => (isFirstVisibleStep ? onClose() : setStep((s) => s - 1))}
        >
          {isFirstVisibleStep ? "Cancelar" : "← Atrás"}
        </button>

        {step >= 2 && step < totalSteps && !initialHolding && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={step === 2 ? !canAdvanceStep2 : !canSave}
            onClick={() => setStep((s) => s + 1)}
          >
            Siguiente →
          </button>
        )}

        {(step === totalSteps && step >= 3) || (!!initialHolding && step === 3) ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !canSave}
            onClick={handleSave}
          >
            {pending ? "Guardando…" : "Guardar posición"}
          </button>
        ) : null}
      </div>
    </Modal>
  );
}

// ── Step 1: Puntual vs DCA ────────────────────────────────────────

function Step1Mode({ onSelect }: { onSelect: (m: WizardMode) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <ModeCard
        title="Inversión puntual"
        description="Compras esporádicas, sin plan fijo. Puedes seguir agregando compras de este activo cuando quieras."
        onClick={() => onSelect("puntual")}
      />
      <ModeCard
        title="DCA — aportes recurrentes"
        description="Plan de aportes fijos (p. ej. $500/mes) que suaviza la volatilidad. Guardamos el plan; registra cada compra real. Las proyecciones son informativas."
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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="mode-card-title">{title}</div>
        <HelpTip text={description} />
      </div>
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
  onSymbolManualChange,
  livePrice,
  livePriceCurrency,
  livePriceLoading,
  livePriceError,
}: {
  assetCategory: AssetType;
  onCategoryChange: (cat: AssetType) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: SymbolResult[];
  searchLoading: boolean;
  selectedSymbol: string;
  selectedDescription: string;
  onSelectSymbol: (symbol: string, description: string, cat: AssetType) => void;
  onSymbolManualChange: (s: string) => void;
  livePrice: number | null;
  livePriceCurrency: string;
  livePriceLoading: boolean;
  livePriceError: boolean;
}) {
  const isLive = hasLivePrice(assetCategory);
  const isOtherType = !isLive;

  return (
    <div>
      {/* Live-price chips */}
      <div className="fld">
        <label className="fld-label">Tipo de activo</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {LIVE_CATEGORY_LABELS.map(([cat, lbl]) => (
            <PillButton
              key={cat}
              active={assetCategory === cat}
              onClick={() => onCategoryChange(cat)}
            >
              {lbl}
            </PillButton>
          ))}
          <select
            className="sel"
            style={{ flex: "none", width: "auto", minWidth: 130, fontSize: 12.5, padding: "5px 10px" }}
            value={isOtherType ? assetCategory : ""}
            onChange={(e) => { if (e.target.value) onCategoryChange(e.target.value as AssetType); }}
          >
            <option value="">Otros activos…</option>
            {OTHER_ASSET_TYPES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ETF / Acción: live search */}
      {isLive && assetCategory !== "cripto" && (
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
            <span className="muted" style={{ fontSize: 12 }}>Buscando…</span>
          )}
          {!searchLoading && searchResults.length > 0 && (
            <div className="symbol-results">
              {searchResults.map((r, i) => (
                <button
                  key={r.symbol}
                  type="button"
                  className="symbol-row"
                  style={{
                    borderBottom: i < searchResults.length - 1 ? "1px solid var(--line)" : "none",
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

      {/* Non-live: optional manual symbol */}
      {isOtherType && (
        <div className="fld">
          <label className="fld-label">Identificador (opcional)</label>
          <input
            className="inp"
            type="text"
            value={selectedSymbol}
            onChange={(e) => onSymbolManualChange(e.target.value)}
            placeholder={`Ej. ${DEFAULT_SYMBOL[assetCategory] ?? "SYMBOL"}`}
            maxLength={12}
            autoFocus
          />
        </div>
      )}

      {/* Selected asset + live price badge */}
      {selectedSymbol && isLive && (
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
              <span className="muted" style={{ fontSize: 12 }}>Cargando precio…</span>
            )}
            {!livePriceLoading && livePrice !== null && !livePriceError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--serif)", fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>
                  {formatMoney(livePrice, livePriceCurrency)}
                </span>
                <span className="chip" style={{ background: "var(--pos-soft)", color: "var(--pos)", fontSize: 10 }}>
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
  label,
  onLabelChange,
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
  label: string;
  onLabelChange: (v: string) => void;
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
      {/* Label */}
      <div className="fld">
        <label className="fld-label">Nombre de la inversión</label>
        <input
          className="inp"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="Ej. Mi S&P 500, BTC largo plazo…"
          maxLength={120}
          autoFocus
        />
      </div>

      {/* Price mode — only when live price is available */}
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
          <PillButton active={inputMode === "units"} onClick={() => onInputModeChange("units")}>
            Cantidad de unidades
          </PillButton>
          <PillButton active={inputMode === "amount"} onClick={() => onInputModeChange("amount")}>
            Monto total invertido
          </PillButton>
        </div>

        {inputMode === "units" ? (
          <div className="inp-money">
            <span className="pre" style={{ fontSize: 11, minWidth: 40 }}>{selectedSymbol}</span>
            <input
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => onQuantityChange(e.target.value)}
              placeholder="0"
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
              <option key={c.value} value={c.value}>{c.label}</option>
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
        Este plan es solo informativo. Registra cada compra real por separado para mantener
        tu costo promedio ponderado actualizado.
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

function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="help-tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="help-btn"
        aria-label="Más información"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      >
        ?
      </button>
      {open && (
        <span role="tooltip" id={id} className="help-pop">
          {text}
        </span>
      )}
    </span>
  );
}

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
