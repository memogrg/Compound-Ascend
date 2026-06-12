"use client";

import { useState, useRef, useCallback, useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import { useDeepLinkModal } from "@/lib/hooks/use-deep-link-modal";
import {
  addHoldingAction,
  editHoldingAction,
  addInvestmentAction,
  getUserCountryAction,
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

const DCA_BROKERS = ["Interactive Brokers", "Dominion", "ITA", "Local", "Otro"] as const;
type DcaBroker = (typeof DCA_BROKERS)[number] | "";

const UCITS_EQUIVALENTS: Partial<Record<string, { symbol: string; name: string }>> = {
  VOO: { symbol: "VUAA", name: "Vanguard S&P 500 UCITS ETF (Acc)" },
  SPY: { symbol: "CSPX", name: "iShares Core S&P 500 UCITS ETF" },
  IVV: { symbol: "CSPX", name: "iShares Core S&P 500 UCITS ETF" },
  VTI: { symbol: "VWRL", name: "Vanguard FTSE All-World UCITS ETF" },
  QQQ: { symbol: "EQQQ", name: "Invesco EQQQ Nasdaq-100 UCITS ETF" },
  SCHB: { symbol: "VWRL", name: "Vanguard FTSE All-World UCITS ETF" },
  VWO: { symbol: "VFEM", name: "Vanguard FTSE Emerging Markets UCITS ETF" },
};

const BROKER_GUIDANCE: Partial<Record<string, string>> = {
  "Interactive Brokers":
    "Activa 'Recurring Investments' en IBKR (Cuenta → Inversiones recurrentes). Disponible para acciones/ETFs en mercados US, CA y EU. La app no ejecuta órdenes.",
  Dominion: "Configura la orden recurrente directamente en el portal de Dominion Securities.",
  ITA: "Contacta a tu asesor de ITA para programar aportes periódicos.",
  Local: "Consulta con tu broker la opción de órdenes automáticas periódicas.",
  Otro: "Configura la automatización directamente con tu broker. La app no ejecuta compras.",
};

function isUSResident(country: string | null): boolean {
  if (!country) return false;
  const lc = country.toLowerCase();
  return (
    lc.includes("united states") || lc === "usa" || lc === "ee.uu." || lc.includes("estados unidos")
  );
}

function sym(currency: string): string {
  return { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[currency] ?? "";
}

// ── Exported triggers ─────────────────────────────────────────────

export function AddHoldingButton({
  currency = "CRC",
  deepLinkKey,
}: {
  currency?: string;
  deepLinkKey?: string;
}) {
  const [open, setOpen] = useState(false);
  useDeepLinkModal(deepLinkKey, () => setOpen(true));
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
  // Activos no cotizados (inmueble/negocio): la "compra" es un aporte de capital.
  const aporteLabel = hasLivePrice(holding.assetType) ? "+ Compra" : "+ Aporte";
  return (
    <>
      <button
        className="btn btn-ghost"
        style={{ fontSize: 12, padding: "5px 10px" }}
        onClick={() => setOpen(true)}
      >
        {aporteLabel}
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

export function EditHoldingButton({ holding, currency }: { holding: Holding; currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-btn"
        style={{ width: 30, height: 30 }}
        aria-label="Editar posición"
        title="Editar posición"
        onClick={() => setOpen(true)}
      >
        <Icon name="edit" />
      </button>
      {open && (
        <AddHoldingWizard
          currency={currency}
          holdingToEdit={holding}
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
  holdingToEdit,
}: {
  currency: string;
  onClose: () => void;
  initialHolding?: InitialHolding;
  holdingToEdit?: Holding;
}) {
  const router = useRouter();
  const toast = useToast();

  const isEdit = Boolean(holdingToEdit);
  const startStep = initialHolding || holdingToEdit ? 3 : 1;

  const [step, setStep] = useState(startStep);
  const [mode, setMode] = useState<WizardMode | null>(
    initialHolding || holdingToEdit ? "puntual" : null,
  );

  // ── Step 2 ────────────────────────────────────────────────────────
  const [assetCategory, setAssetCategory] = useState<AssetType>(
    holdingToEdit?.assetType ?? initialHolding?.assetCategory ?? "etf",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SymbolResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(
    holdingToEdit?.symbol ?? initialHolding?.symbol ?? "",
  );
  const [selectedDescription, setSelectedDescription] = useState(
    holdingToEdit?.label ?? initialHolding?.description ?? "",
  );
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePriceCurrency, setLivePriceCurrency] = useState("USD");
  const [livePriceLoading, setLivePriceLoading] = useState(false);
  const [livePriceError, setLivePriceError] = useState(false);

  // ── Step 3 ────────────────────────────────────────────────────────
  const [label, setLabel] = useState(
    holdingToEdit?.label ?? initialHolding?.description ?? initialHolding?.symbol ?? "",
  );
  // A1: default to "amount" — monto total es más intuitivo
  const [priceMode, setPriceMode] = useState<PriceMode>(holdingToEdit ? "custom" : "live");
  const [averageCost, setAverageCost] = useState(
    holdingToEdit ? String(holdingToEdit.averageCost) : "",
  );
  const [purchaseDate, setPurchaseDate] = useState(
    holdingToEdit?.purchaseDate ?? new Date().toISOString().slice(0, 10),
  );
  const [inputMode, setInputMode] = useState<"units" | "amount">(
    holdingToEdit ? "units" : "amount",
  );
  const [quantity, setQuantity] = useState(holdingToEdit ? String(holdingToEdit.quantity) : "");
  const [totalAmount, setTotalAmount] = useState("");
  const [broker, setBroker] = useState(holdingToEdit?.broker ?? "");
  // Fase 4.1: compra/aporte → gasto vinculado. ON al crear; OFF al editar
  // (un edit puede ser corrección de datos, no un aporte real).
  const [registerExpense, setRegisterExpense] = useState(!holdingToEdit);
  const [holdingCurrency, setHoldingCurrency] = useState(holdingToEdit?.currency ?? currency);

  // ── Renta / valor manual (activos no cotizados: inmueble, negocio, otro) ──
  const [currentValueManual, setCurrentValueManual] = useState(
    holdingToEdit?.currentValueManual != null ? String(holdingToEdit.currentValueManual) : "",
  );
  const [rentalIncome, setRentalIncome] = useState(
    holdingToEdit?.rentalIncome != null ? String(holdingToEdit.rentalIncome) : "",
  );
  const [rentalFrequency, setRentalFrequency] = useState<"mensual" | "trimestral" | "anual">(
    holdingToEdit?.rentalFrequency ?? "mensual",
  );
  const [rentalSubtype, setRentalSubtype] = useState<
    "alquiler" | "airbnb" | "auto" | "negocio" | "otro"
  >(holdingToEdit?.rentalSubtype ?? "alquiler");

  // ── Step 4 ────────────────────────────────────────────────────────
  const [dcaFrequency, setDcaFrequency] = useState<DcaFreq>("mensual");
  const [dcaAmount, setDcaAmount] = useState("");
  const [dcaBroker, setDcaBroker] = useState<DcaBroker>("");
  const [userCountry, setUserCountry] = useState<string | null>(null);
  const countryFetchedRef = useRef(false);

  // ── Submit ────────────────────────────────────────────────────────
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Search ────────────────────────────────────────────────────────
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
        const res = await fetch(`/api/market-price/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setSearchResults([]);
          return;
        }
        const data = (await res.json()) as { results?: SymbolResult[] };
        setSearchResults(data.results ?? []);
      } catch {
        /* AbortError */
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, []);

  const fetchLivePrice = useCallback(
    async (symbol: string, cat: AssetType) => {
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
        if (!res.ok) {
          setLivePriceError(true);
          setPriceMode("custom");
          return;
        }
        const data = (await res.json()) as { price?: number; currency?: string };
        if (typeof data.price === "number" && data.price > 0) {
          setLivePrice(data.price);
          setLivePriceCurrency(data.currency ?? "USD");
          setAverageCost(String(data.price));
          if (!isEdit) setPriceMode("live");
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
    },
    [isEdit],
  );

  // Fetch live price on mount for initialHolding / holdingToEdit
  useEffect(() => {
    if (initialHolding) fetchLivePrice(initialHolding.symbol, initialHolding.assetCategory);
    else if (holdingToEdit) fetchLivePrice(holdingToEdit.symbol, holdingToEdit.assetType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch country lazily when DCA step is shown
  useEffect(() => {
    if (step === 4 && !countryFetchedRef.current) {
      countryFetchedRef.current = true;
      // El país solo precarga una sugerencia del paso DCA: si falla, el wizard
      // sigue con el default — silenciarlo es intencional, no un descuido.
      getUserCountryAction()
        .then(setUserCountry)
        .catch(() => {});
    }
  }, [step]);

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
    if (pm === "live" && livePrice !== null) setAverageCost(String(livePrice));
  };

  // ── Derived ───────────────────────────────────────────────────────
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

  // A1: in amount mode, require price > 0 to compute quantity
  const priceRequiredForAmount = inputMode === "amount" && effectiveAvgCost <= 0;
  const canSave = quantityNum > 0 && !!purchaseDate && !priceRequiredForAmount;

  // A1: sanity check — large quantity in units mode looks like a money amount
  const unitsSanityWarn =
    inputMode === "units" && parseFloat(quantity) >= 500 && effectiveAvgCost >= 50;

  const isFirstVisibleStep =
    step === 1 || (!!initialHolding && step === 3) || (!!holdingToEdit && step === 3);

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    setErrorMsg(null);
    if (!selectedSymbol) {
      setErrorMsg("Selecciona un activo.");
      return;
    }
    if (quantityNum <= 0) {
      setErrorMsg("La cantidad debe ser mayor a 0.");
      return;
    }
    if (!purchaseDate) {
      setErrorMsg("Selecciona la fecha de compra.");
      return;
    }
    if (priceRequiredForAmount) {
      setErrorMsg("Ingresa el precio por unidad para calcular la cantidad.");
      return;
    }

    setPending(true);
    try {
      const isRental = !hasLivePrice(assetCategory);
      const payload = {
        symbol: selectedSymbol,
        assetType: assetCategory,
        quantity: quantityNum,
        averageCost: effectiveAvgCost,
        purchaseDate: purchaseDate || undefined,
        broker: broker.trim() || undefined,
        currency: holdingCurrency,
        label: label.trim() || undefined,
        registerExpense,
        // Activos no cotizados: valor manual + renta opcional.
        ...(isRental
          ? {
              currentValueManual: parseFloat(currentValueManual) || undefined,
              rentalIncome: parseFloat(rentalIncome) || undefined,
              rentalFrequency: parseFloat(rentalIncome) ? rentalFrequency : undefined,
              rentalSubtype,
            }
          : {}),
      };

      if (isEdit && holdingToEdit) {
        const result = await editHoldingAction(holdingToEdit.id, payload);
        if (!result.ok) {
          const firstErr = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
          setErrorMsg(firstErr ?? result.message ?? "No pudimos actualizar la posición.");
          return;
        }
        toast("Posición actualizada");
      } else {
        if (mode === "dca") {
          const dcaNum = parseFloat(dcaAmount) || 0;
          if (dcaNum > 0) {
            const freqLabel =
              dcaFrequency === "semanal"
                ? "Semanal"
                : dcaFrequency === "trimestral"
                  ? "Trimestral"
                  : "Mensual";
            await addInvestmentAction({
              name: label.trim() || `${selectedSymbol} — DCA ${freqLabel}`,
              assetType: assetCategory,
              symbol: selectedSymbol,
              investedAmount: quantityNum * effectiveAvgCost,
              contribution: dcaNum,
              currency: holdingCurrency,
              horizon: dcaFrequency,
              dcaBroker: dcaBroker || undefined,
            });
          }
        }
        const result = await addHoldingAction(payload);
        if (!result.ok) {
          const firstErr = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
          setErrorMsg(firstErr ?? result.message ?? "No pudimos guardar la posición.");
          return;
        }
        toast("Posición agregada");
      }
      onClose();
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const stepTitle = STEP_TITLES[step - 1] ?? "";

  return (
    <Modal
      title={
        isEdit
          ? `Editar posición — ${holdingToEdit?.label ?? holdingToEdit?.symbol}`
          : initialHolding
            ? `Agregar compra — ${initialHolding.symbol}`
            : "Agregar inversión"
      }
      sub={
        isEdit
          ? "Modifica los datos de esta posición."
          : initialHolding
            ? "Nueva compra del mismo activo."
            : `Paso ${step} de ${totalSteps} — ${stepTitle}`
      }
      onClose={onClose}
    >
      <div className="modal-body">
        {step === 1 && (
          <Step1Mode
            onSelect={(m) => {
              setMode(m);
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <Step2Asset
            assetCategory={assetCategory}
            onCategoryChange={handleCategoryChange}
            searchQuery={searchQuery}
            onSearchChange={(q) => {
              setSearchQuery(q);
              runSearch(q);
            }}
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
            unitsSanityWarn={unitsSanityWarn}
            priceRequiredForAmount={priceRequiredForAmount}
          />
        )}

        {step === 3 && !hasLivePrice(assetCategory) && (
          <RentalFields
            currency={holdingCurrency}
            currentValueManual={currentValueManual}
            onCurrentValueManualChange={setCurrentValueManual}
            rentalIncome={rentalIncome}
            onRentalIncomeChange={setRentalIncome}
            rentalFrequency={rentalFrequency}
            onRentalFrequencyChange={setRentalFrequency}
            rentalSubtype={rentalSubtype}
            onRentalSubtypeChange={setRentalSubtype}
          />
        )}

        {step === 4 && mode === "dca" && (
          <Step4DCA
            dcaFrequency={dcaFrequency}
            onFrequencyChange={setDcaFrequency}
            dcaAmount={dcaAmount}
            onAmountChange={setDcaAmount}
            dcaBroker={dcaBroker}
            onDcaBrokerChange={setDcaBroker}
            holdingCurrency={holdingCurrency}
            userCountry={userCountry}
            selectedSymbol={selectedSymbol}
            assetCategory={assetCategory}
          />
        )}

        {/* Fase 4.1: la compra/aporte puede nacer como gasto vinculado. */}
        {(step === totalSteps && step >= 3) ||
        (!!initialHolding && step === 3) ||
        (!!holdingToEdit && step === 3) ? (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              fontSize: 12.5,
              color: "var(--ink-2)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={registerExpense}
              onChange={(e) => setRegisterExpense(e.target.checked)}
            />
            Registrar como gasto en Base Financiera
            <span
              className="tip"
              data-tip={
                isEdit
                  ? "Solo si este edit es un aporte real: crea el gasto vinculado por el aumento de posición (las correcciones de datos no deben marcarse)"
                  : "Crea la transacción de gasto vinculada a esta posición (Compra/Aporte). Desmárcalo si estás cargando histórico"
              }
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "1px solid var(--line)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10.5,
                color: "var(--muted)",
              }}
            >
              ?
            </span>
          </label>
        ) : null}

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

        {step >= 2 && step < totalSteps && !initialHolding && !holdingToEdit && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={step === 2 ? !canAdvanceStep2 : !canSave}
            onClick={() => setStep((s) => s + 1)}
          >
            Siguiente →
          </button>
        )}

        {(step === totalSteps && step >= 3) ||
        (!!initialHolding && step === 3) ||
        (!!holdingToEdit && step === 3) ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !canSave}
            onClick={handleSave}
          >
            {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar posición"}
          </button>
        ) : null}
      </div>
    </Modal>
  );
}

// ── Step 1 ────────────────────────────────────────────────────────

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

// ── Step 2 ────────────────────────────────────────────────────────

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
            style={{
              flex: "none",
              width: "auto",
              minWidth: 130,
              fontSize: 12.5,
              padding: "5px 10px",
            }}
            value={isOtherType ? assetCategory : ""}
            onChange={(e) => {
              if (e.target.value) onCategoryChange(e.target.value as AssetType);
            }}
          >
            <option value="">Otros activos…</option>
            {OTHER_ASSET_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLive && assetCategory !== "cripto" && (
        <div className="fld">
          <label className="fld-label">Buscar {assetCategory === "etf" ? "ETF" : "acción"}</label>
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
              <span className="muted" style={{ fontSize: 12 }}>
                Cargando precio…
              </span>
            )}
            {!livePriceLoading && livePrice !== null && !livePriceError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontFamily: "var(--serif)",
                    fontSize: 17,
                    fontWeight: 700,
                    color: "var(--ink)",
                  }}
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

// ── Step 3 ────────────────────────────────────────────────────────

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
  unitsSanityWarn,
  priceRequiredForAmount,
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
  unitsSanityWarn: boolean;
  priceRequiredForAmount: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const derivedQty =
    inputMode === "amount" && effectiveAvgCost > 0
      ? (parseFloat(totalAmount) || 0) / effectiveAvgCost
      : null;

  return (
    <div>
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

      {/* A1: amount mode is default; units mode gets a clear warning label */}
      <div className="fld">
        <label className="fld-label">¿Cómo ingresas la compra?</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
          <PillButton active={inputMode === "amount"} onClick={() => onInputModeChange("amount")}>
            Monto total invertido
          </PillButton>
          <PillButton active={inputMode === "units"} onClick={() => onInputModeChange("units")}>
            Número de unidades
          </PillButton>
        </div>

        {inputMode === "amount" ? (
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
            {priceRequiredForAmount && (
              <div className="auth-msg warn" style={{ marginBottom: 0, fontSize: 12 }}>
                Necesitas ingresar el precio por unidad para calcular la cantidad.
              </div>
            )}
            {derivedQty !== null && derivedQty > 0 && (
              <div className="auth-msg" style={{ marginBottom: 0, fontSize: 12 }}>
                ≈ {derivedQty.toFixed(6)} unidades de {selectedSymbol}
              </div>
            )}
          </>
        ) : (
          <>
            <div
              className="fld-label"
              style={{ fontSize: 11, color: "var(--warn)", marginBottom: 4 }}
            >
              ⚠ Ingresa la cantidad de acciones/monedas, NO el monto en dinero.
            </div>
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
              />
            </div>
            {unitsSanityWarn && (
              <div className="auth-msg warn" style={{ marginBottom: 0, fontSize: 12 }}>
                ¿Ingresaste el monto en dinero como unidades? Si invertiste {sym(holdingCurrency)}
                {quantity}, el número de {selectedSymbol} sería ≈{" "}
                {effectiveAvgCost > 0 ? (parseFloat(quantity) / effectiveAvgCost).toFixed(4) : "?"}{" "}
                unidades.
              </div>
            )}
          </>
        )}
      </div>

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

      {/* A1: prominent cost summary */}
      {quantityNum > 0 && effectiveAvgCost > 0 && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--surface-2)",
            borderRadius: "var(--r-md)",
            fontSize: 13,
            color: "var(--muted)",
            lineHeight: 1.6,
            border: "1px solid var(--line)",
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: 2 }}>
            Resumen de la compra
          </div>
          ≈ {quantityNum.toFixed(quantityNum < 1 ? 6 : 4)} {selectedSymbol}
          {" · "}
          <strong style={{ color: "var(--ink)" }}>
            costo total {formatMoney(quantityNum * effectiveAvgCost, holdingCurrency)}
          </strong>
          {" · @ "}
          {formatMoney(effectiveAvgCost, holdingCurrency)} / ud.
        </div>
      )}
    </div>
  );
}

// ── Campos de renta (activos no cotizados) ────────────────────────

function RentalFields({
  currency,
  currentValueManual,
  onCurrentValueManualChange,
  rentalIncome,
  onRentalIncomeChange,
  rentalFrequency,
  onRentalFrequencyChange,
  rentalSubtype,
  onRentalSubtypeChange,
}: {
  currency: string;
  currentValueManual: string;
  onCurrentValueManualChange: (v: string) => void;
  rentalIncome: string;
  onRentalIncomeChange: (v: string) => void;
  rentalFrequency: "mensual" | "trimestral" | "anual";
  onRentalFrequencyChange: (v: "mensual" | "trimestral" | "anual") => void;
  rentalSubtype: "alquiler" | "airbnb" | "auto" | "negocio" | "otro";
  onRentalSubtypeChange: (v: "alquiler" | "airbnb" | "auto" | "negocio" | "otro") => void;
}) {
  return (
    <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
      <div
        className="fld-label"
        style={{ marginBottom: 8, fontWeight: 600, color: "var(--ink-2)" }}
      >
        Valor y renta (activo no cotizado)
      </div>
      <div className="fld">
        <label className="fld-label">Valor actual del activo</label>
        <div className="inp-money">
          <span className="pre">{sym(currency)}</span>
          <input
            type="number"
            step="any"
            min="0"
            value={currentValueManual}
            onChange={(e) => onCurrentValueManualChange(e.target.value)}
            placeholder="Ej. valor de mercado hoy"
          />
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          Para inmuebles/negocios el valor no se calcula por precio × cantidad. Si lo dejas vacío,
          se usa el costo.
        </div>
      </div>
      <div className="fld">
        <label className="fld-label">Tipo de renta</label>
        <select
          className="sel"
          value={rentalSubtype}
          onChange={(e) => onRentalSubtypeChange(e.target.value as typeof rentalSubtype)}
        >
          <option value="alquiler">Alquiler</option>
          <option value="airbnb">Airbnb</option>
          <option value="auto">Alquiler de auto</option>
          <option value="negocio">Negocio</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div className="fld-2">
        <div className="fld">
          <label className="fld-label">Renta recurrente (opcional)</label>
          <div className="inp-money">
            <span className="pre">{sym(currency)}</span>
            <input
              type="number"
              step="any"
              min="0"
              value={rentalIncome}
              onChange={(e) => onRentalIncomeChange(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <div className="fld">
          <label className="fld-label">Frecuencia</label>
          <select
            className="sel"
            value={rentalFrequency}
            onChange={(e) => onRentalFrequencyChange(e.target.value as typeof rentalFrequency)}
          >
            <option value="mensual">Mensual</option>
            <option value="trimestral">Trimestral</option>
            <option value="anual">Anual</option>
          </select>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 11 }}>
        La renta configurada es proyección. Solo la renta que <strong>registres</strong> suma a tu
        ingreso pasivo.
      </div>
    </div>
  );
}

// ── Step 4 ────────────────────────────────────────────────────────

function Step4DCA({
  dcaFrequency,
  onFrequencyChange,
  dcaAmount,
  onAmountChange,
  dcaBroker,
  onDcaBrokerChange,
  holdingCurrency,
  userCountry,
  selectedSymbol,
  assetCategory,
}: {
  dcaFrequency: DcaFreq;
  onFrequencyChange: (f: DcaFreq) => void;
  dcaAmount: string;
  onAmountChange: (v: string) => void;
  dcaBroker: DcaBroker;
  onDcaBrokerChange: (b: DcaBroker) => void;
  holdingCurrency: string;
  userCountry: string | null;
  selectedSymbol: string;
  assetCategory: AssetType;
}) {
  const isUS = isUSResident(userCountry);
  const ucits = assetCategory === "etf" ? UCITS_EQUIVALENTS[selectedSymbol] : undefined;
  const brokerNote = dcaBroker ? BROKER_GUIDANCE[dcaBroker] : undefined;

  return (
    <div>
      <div className="auth-msg">
        Este plan es informativo — la app <strong>no ejecuta ni automatiza compras reales</strong>.
        Registra cada compra real por separado para mantener tu costo promedio actualizado.
      </div>
      <div className="fld-2">
        <div className="fld">
          <label className="fld-label">Frecuencia de aporte</label>
          <select
            className="sel"
            value={dcaFrequency}
            onChange={(e) => onFrequencyChange(e.target.value as DcaFreq)}
            autoFocus
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
            />
          </div>
        </div>
      </div>
      <div className="fld">
        <label className="fld-label">Broker del plan (opcional)</label>
        <select
          className="sel"
          value={dcaBroker}
          onChange={(e) => onDcaBrokerChange(e.target.value as DcaBroker)}
        >
          <option value="">— Sin especificar —</option>
          {DCA_BROKERS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        {brokerNote && (
          <div className="auth-msg" style={{ marginBottom: 0 }}>
            {brokerNote}
          </div>
        )}
      </div>
      {userCountry !== null && !isUS && dcaBroker === "Interactive Brokers" && (
        <div className="auth-msg warn" style={{ lineHeight: 1.55 }}>
          Residentes fuera de EE.UU.: activa &ldquo;Recurring Investments&rdquo; desde la interfaz
          web de IBKR. Esta función <strong>no está disponible vía API</strong>.
        </div>
      )}
      {!isUS && ucits && (
        <div
          style={{
            padding: "10px 14px",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--muted)",
          }}
        >
          <strong style={{ color: "var(--ink-2)" }}>Sugerencia informativa — </strong>
          Como residente fuera de EE.UU., un equivalente UCITS común de{" "}
          <strong>{selectedSymbol}</strong> es{" "}
          <strong style={{ color: "var(--ink)" }}>{ucits.symbol}</strong> ({ucits.name}). Consulta
          con un asesor financiero antes de decidir.
        </div>
      )}
    </div>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────

// A3: tooltip rendered in a portal to avoid overflow clipping inside the modal
function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  const calcPos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= 160 ? r.bottom + 6 : r.top - 140;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 296));
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    document.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      document.removeEventListener("mousedown", close);
    };
  }, [open]);

  return (
    <span
      className="help-tip"
      onMouseEnter={() => {
        calcPos();
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={btnRef}
        type="button"
        className="help-btn"
        aria-label="Más información"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          calcPos();
          setOpen((o) => !o);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        ?
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: "min(280px, calc(100vw - 32px))",
              zIndex: 9999,
              background: "var(--ink)",
              color: "var(--bg)",
              fontSize: 12.5,
              lineHeight: 1.5,
              fontWeight: 400,
              padding: "10px 13px",
              borderRadius: 10,
              boxShadow: "var(--shadow-float)",
              pointerEvents: "none",
            }}
          >
            {text}
          </span>,
          document.body,
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
