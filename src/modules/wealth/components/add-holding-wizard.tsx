"use client";

/**
 * Captura de inversiones — modal de 2 pasos (≤1 min). Paso 1: grid de las 20
 * categorías (CATEGORY_META) agrupadas por naturaleza + buscador. Paso 2: campos
 * mínimos condicionales por perfil (A cotizado · B flujo de caja manual · C
 * crecimiento manual) + región + registrar gasto. SOLO UI: valida con
 * holdingInputSchema (vía addHoldingAction/editHoldingAction); no toca services.
 */
import { useState, useRef, useCallback, useEffect, useId, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatMoney, currencySymbol, captureCurrencyDefault } from "@/lib/format";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import { useCaptureCurrency } from "@/components/layout/currency-context";
import { useDeepLinkModal } from "@/lib/hooks/use-deep-link-modal";
import {
  addHoldingAction,
  editHoldingAction,
  listLinkableDebtsAction,
  type LinkableDebt,
} from "@/modules/wealth/api/actions";
import { CATEGORY_META, CASHFLOW_CATEGORIES, GROWTH_CATEGORIES } from "@/modules/wealth/constants";
import { computeRentalRoi } from "@/modules/wealth/engine/rental-roi";
import type { AssetType, Holding, InvestmentCategory } from "@/modules/wealth/types";
import type { HoldingInput } from "@/modules/wealth/schemas";

/** Costos operativos del inmueble de renta (perfil B · propiedad_alquiler). */
type RentalCosts = {
  purchasePrice: string;
  closingCosts: string;
  vacancyPct: string;
  mgmtPct: string;
  maintenance: string;
  hoa: string;
  propertyTax: string;
  insurance: string;
  services: string;
};

// ── Constantes UI ──────────────────────────────────────────────────

const REGIONS: { value: string; label: string }[] = [
  { value: "us", label: "US" },
  { value: "cr", label: "CR" },
  { value: "eu", label: "EU" },
  { value: "latam", label: "LATAM" },
  { value: "global", label: "Global" },
  { value: "otro", label: "Otro" },
];

const API_TYPE_MAP: Partial<Record<AssetType, string>> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

/** assetType → categoría, para precargar holdings viejos sin `category`. Mismo
 *  mapeo que el backfill de la migración (PLAN §2.2). */
function categoryFromAssetType(assetType: AssetType): InvestmentCategory {
  const map: Record<AssetType, InvestmentCategory> = {
    cripto: "cripto",
    etf: "etf_crecimiento",
    accion: "accion_crecimiento",
    bono: "bono_gobierno",
    fondo: "fondo_conservador",
    certificado: "deposito_plazo",
    inmueble: "propiedad_alquiler",
    negocio: "negocio_ingreso",
    pension: "roboadvisor",
    commodity: "alternativo",
    arte: "alternativo",
    nft: "cripto",
    otro: "alternativo",
  };
  return map[assetType] ?? "alternativo";
}

// ── Triggers exportados ────────────────────────────────────────────

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
      {open && <AddHoldingModal currency={currency} onClose={() => setOpen(false)} />}
    </>
  );
}

export function AddPurchaseButton({ holding, currency }: { holding: Holding; currency: string }) {
  const [open, setOpen] = useState(false);
  const quoted = CATEGORY_META[holding.category ?? categoryFromAssetType(holding.assetType)].quoted;
  return (
    <>
      <button
        className="btn btn-ghost"
        style={{ fontSize: 12, padding: "5px 10px" }}
        onClick={() => setOpen(true)}
      >
        {quoted ? "+ Compra" : "+ Aporte"}
      </button>
      {open && <AddHoldingModal currency={currency} prefill={holding} onClose={() => setOpen(false)} />}
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
        <AddHoldingModal
          currency={currency}
          prefill={holding}
          editId={holding.id}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** "Completar detalle" de un stub creado desde un ingreso pasivo (Fase 3). */
export function CompleteHoldingButton({
  holding,
  currency,
}: {
  holding: Holding;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ fontSize: 12.5, padding: "6px 12px" }}
        onClick={() => setOpen(true)}
      >
        Completar detalle
      </button>
      {open && (
        <AddHoldingModal
          currency={currency}
          prefill={holding}
          editId={holding.id}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Modal de 2 pasos ───────────────────────────────────────────────

export function AddHoldingModal({
  onClose,
  prefill,
  editId,
}: {
  /**
   * Moneda de visualización (legado). Ya NO define el default de captura —al
   * crear se usa la principal vía useCaptureCurrency(); al editar/comprar, la del
   * holding (prefill.currency). Se acepta para no romper los call-sites.
   */
  currency?: string;
  onClose: () => void;
  prefill?: Holding;
  editId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const captureCurrency = useCaptureCurrency();
  const isEdit = Boolean(editId);

  // Categoría precargada (edición/compra) o elección en el paso 1.
  const initialCategory = prefill
    ? (prefill.category ?? categoryFromAssetType(prefill.assetType))
    : null;
  const [category, setCategory] = useState<InvestmentCategory | null>(initialCategory);
  const [step, setStep] = useState<1 | 2>(prefill ? 2 : 1);

  // ── Comunes ──
  const [name, setName] = useState(prefill?.label ?? prefill?.symbol ?? "");
  const investedPrefill =
    prefill && prefill.quantity > 0 ? String(prefill.quantity * prefill.averageCost) : "";
  const [invested, setInvested] = useState(investedPrefill);
  // Moneda de captura: al editar/comprar respeta la del holding; al crear, la
  // principal del usuario (estable) — nunca la de visualización.
  const [cur, setCur] = useState(captureCurrencyDefault(undefined, prefill?.currency, captureCurrency));
  const [aportoCadaMes, setAportoCadaMes] = useState(prefill?.isRecurring ?? false);
  // Aporte mensual: separado del total invertido; persiste en monthly_contribution.
  const [aporteMensual, setAporteMensual] = useState(
    prefill?.monthlyContribution != null ? String(prefill.monthlyContribution) : "",
  );

  // ── Perfil A (cotizado) ──
  const [symbol, setSymbol] = useState(prefill?.symbol ?? "");
  const [quantity, setQuantity] = useState(prefill && prefill.quantity > 0 ? String(prefill.quantity) : "");
  // Precio de compra por unidad (cotizados). Al editar, precarga el costo promedio.
  const [unitPrice, setUnitPrice] = useState(
    prefill && prefill.quantity > 0 ? String(prefill.averageCost) : "",
  );
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePriceCurrency, setLivePriceCurrency] = useState("USD");
  const [priceState, setPriceState] = useState<"idle" | "loading" | "ok" | "error">("idle");

  // ── Perfil B / C (manual) ──
  const [currentValue, setCurrentValue] = useState(
    prefill?.currentValueManual != null ? String(prefill.currentValueManual) : "",
  );
  const [income, setIncome] = useState(prefill?.rentalIncome != null ? String(prefill.rentalIncome) : "");
  const [frequency, setFrequency] = useState<"semanal" | "mensual" | "trimestral" | "semestral" | "anual" | "al_vencimiento">(
    prefill?.rentalFrequency ?? "mensual",
  );
  const [incomeMonth, setIncomeMonth] = useState(prefill?.incomeMonth ? String(prefill.incomeMonth) : "1");
  const [annualRatePct, setAnnualRatePct] = useState(
    prefill?.annualRatePct != null ? String(prefill.annualRatePct) : "",
  );
  const [maturityDate, setMaturityDate] = useState(
    prefill?.maturityDate ? String(prefill.maturityDate).slice(0, 7) : "",
  );

  // ── Inmueble de renta (propiedad_alquiler): subtipo + costos operativos ──
  const [subtype, setSubtype] = useState<"alquiler" | "airbnb">(
    prefill?.rentalSubtype === "airbnb" ? "airbnb" : "alquiler",
  );
  const [rc, setRc] = useState<RentalCosts>({
    purchasePrice: prefill?.purchasePrice != null ? String(prefill.purchasePrice) : "",
    closingCosts: prefill?.closingCosts != null ? String(prefill.closingCosts) : "",
    vacancyPct: prefill?.vacancyPct != null ? String(Math.round(prefill.vacancyPct * 100)) : "",
    mgmtPct: prefill?.mgmtPct != null ? String(Math.round(prefill.mgmtPct * 100)) : "",
    maintenance: prefill?.maintenanceMonthly != null ? String(prefill.maintenanceMonthly) : "",
    hoa: prefill?.hoaMonthly != null ? String(prefill.hoaMonthly) : "",
    propertyTax: prefill?.propertyTaxAnnual != null ? String(prefill.propertyTaxAnnual) : "",
    insurance: prefill?.insuranceAnnual != null ? String(prefill.insuranceAnnual) : "",
    services: prefill?.servicesMonthly != null ? String(prefill.servicesMonthly) : "",
  });
  // Deuda que financia el inmueble (C-1b); "" = ninguna.
  const [debtId, setDebtId] = useState(prefill?.debtId ?? "");

  // ── Común final ──
  const [region, setRegion] = useState(prefill?.region ?? "global");
  const [registerExpense, setRegisterExpense] = useState(!isEdit);

  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Perfil derivado de la categoría ──
  const meta = category ? CATEGORY_META[category] : null;
  const profile: "A" | "B" | "C" | null = !meta
    ? null
    : meta.quoted
      ? "A"
      : meta.nature === "cashflow"
        ? "B"
        : "C";

  // ── Precio en vivo (perfil A, símbolo opcional) ──
  const priceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      if (priceTimer.current) clearTimeout(priceTimer.current);
      priceAbort.current?.abort();
    };
  }, []);

  const lookupPrice = useCallback(
    (symRaw: string, assetType: AssetType) => {
      const s = symRaw.trim().toUpperCase();
      const apiType = API_TYPE_MAP[assetType];
      if (priceTimer.current) clearTimeout(priceTimer.current);
      if (s.length < 1 || !apiType) {
        setPriceState("idle");
        setLivePrice(null);
        return;
      }
      setPriceState("loading");
      priceTimer.current = setTimeout(async () => {
        priceAbort.current?.abort();
        const ctrl = new AbortController();
        priceAbort.current = ctrl;
        try {
          const res = await fetch(
            `/api/market-price?symbol=${encodeURIComponent(s)}&type=${apiType}`,
            { signal: ctrl.signal },
          );
          if (!res.ok) {
            setPriceState("error");
            return;
          }
          const data = (await res.json()) as { price?: number; currency?: string };
          if (typeof data.price === "number" && data.price > 0) {
            setLivePrice(data.price);
            setLivePriceCurrency(data.currency ?? "USD");
            setPriceState("ok");
          } else {
            setPriceState("error");
          }
        } catch {
          /* abort */
        }
      }, 350);
    },
    [],
  );

  function chooseCategory(c: InvestmentCategory) {
    setCategory(c);
    setStep(2);
  }

  // ── Derivados ──
  const investedNum = parseFloat(invested) || 0;
  const qtyNum = parseFloat(quantity) || 0;
  const canSave = !!category && name.trim().length > 0 && investedNum > 0;

  // El precio en vivo puede venir en una moneda (p. ej. USD) distinta a la
  // elegida (cur). NO lo mezclamos silenciosamente en el costo: solo se usa como
  // referencia de costo si coincide con `cur` (el aviso al usuario se pinta en
  // el campo del símbolo cuando difieren).
  const liveMatchesCur = livePriceCurrency === cur;

  // ── Payload (HoldingInput) ──
  function buildPayload(): HoldingInput {
    const cat = category!;
    const m = CATEGORY_META[cat];
    // Cotizado con cantidad → cantidad real + costo unitario (cost_basis = invertido).
    // Resto → 1 "unidad" cuyo costo ES el monto invertido.
    // Cotizado: el "precio de compra" (por unidad) tiene prioridad. Con precio +
    // monto, la cantidad se deriva (monto ÷ precio) y el costo unitario ES ese
    // precio. Sin precio, se usa la cantidad ingresada (costo = monto ÷ cantidad).
    // Sin nada, 1 "unidad" cuyo costo es el monto invertido.
    const priceNum = parseFloat(unitPrice) || 0;
    // Si no hay monto invertido, solo se cae al precio en vivo cuando su moneda
    // coincide con `cur`; si difiere, no se asume (quedaría mal etiquetado).
    const liveForCost = liveMatchesCur ? (livePrice ?? 0) : 0;
    let finalQty = 1;
    let finalAvg = investedNum;
    if (m.quoted && priceNum > 0) {
      finalAvg = priceNum;
      finalQty = investedNum > 0 ? investedNum / priceNum : qtyNum || 0;
    } else if (m.quoted && qtyNum > 0) {
      finalQty = qtyNum;
      finalAvg = investedNum > 0 ? investedNum / qtyNum : liveForCost;
    }

    const base: HoldingInput = {
      assetType: m.defaultAssetType,
      category: cat,
      nature: m.nature,
      quantity: finalQty,
      averageCost: finalAvg,
      currency: cur,
      label: name.trim() || undefined,
      region,
      isRecurring: aportoCadaMes,
      monthlyContribution: aportoCadaMes ? parseFloat(aporteMensual) || undefined : undefined,
      registerExpense,
      purchaseDate: new Date().toISOString().slice(0, 10),
    };
    if (m.quoted) {
      base.symbol = symbol.trim() ? symbol.trim().toUpperCase() : undefined;
    } else {
      // Manual (B/C): valor actual; default = invertido.
      base.currentValueManual = parseFloat(currentValue) || investedNum || undefined;
      if (m.nature === "cashflow") {
        // Perfil B: ingreso + frecuencia; si no es mensual, mes de materialización.
        const inc = parseFloat(income) || 0;
        if (inc > 0) {
          base.rentalIncome = inc;
          base.rentalFrequency = frequency;
          if (frequency !== "mensual" && frequency !== "semanal")
            base.incomeMonth = parseInt(incomeMonth, 10) || undefined;
        }
        base.annualRatePct = parseFloat(annualRatePct) || undefined;
        base.maturityDate = maturityDate ? `${maturityDate}-01` : undefined;
        if (cat === "propiedad_alquiler") {
          base.rentalSubtype = subtype;
          const n = (s: string) => parseFloat(s) || undefined;
          const pct = (s: string) => (s ? (parseFloat(s) || 0) / 100 : undefined);
          base.purchasePrice = n(rc.purchasePrice);
          base.closingCosts = n(rc.closingCosts);
          base.vacancyPct = pct(rc.vacancyPct);
          base.mgmtPct = pct(rc.mgmtPct);
          base.maintenanceMonthly = n(rc.maintenance);
          base.hoaMonthly = n(rc.hoa);
          base.propertyTaxAnnual = n(rc.propertyTax);
          base.insuranceAnnual = n(rc.insurance);
          base.servicesMonthly = n(rc.services);
          base.debtId = debtId || undefined;
        }
      }
    }
    return base;
  }

  async function handleSave() {
    setErrorMsg(null);
    if (!canSave) {
      setErrorMsg("Completa el nombre y el monto invertido.");
      return;
    }
    setPending(true);
    try {
      const payload = buildPayload();
      const result = editId
        ? await editHoldingAction(editId, payload)
        : await addHoldingAction(payload);
      if (!result.ok) {
        const firstErr = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
        setErrorMsg(firstErr ?? result.message ?? "No pudimos guardar la posición.");
        return;
      }
      toast(isEdit ? "Posición actualizada" : "Posición agregada");
      onClose();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      title={isEdit ? `Editar — ${prefill?.label ?? prefill?.symbol}` : "Agregar inversión"}
      sub={
        step === 1
          ? "Elige el tipo de inversión"
          : meta
            ? meta.label
            : "Datos de la inversión"
      }
      onClose={onClose}
    >
      <div className="modal-body">
        {step === 1 ? (
          <Step1Categories onChoose={chooseCategory} />
        ) : (
          <Step2Fields
            profile={profile}
            cur={cur}
            name={name}
            onName={setName}
            invested={invested}
            onInvested={setInvested}
            onCurrency={setCur}
            aportoCadaMes={aportoCadaMes}
            onAportoCadaMes={setAportoCadaMes}
            aporteMensual={aporteMensual}
            onAporteMensual={setAporteMensual}
            symbol={symbol}
            onSymbol={(v) => {
              setSymbol(v);
              if (meta) lookupPrice(v, meta.defaultAssetType);
            }}
            quantity={quantity}
            onQuantity={setQuantity}
            unitPrice={unitPrice}
            onUnitPrice={setUnitPrice}
            livePrice={livePrice}
            livePriceCurrency={livePriceCurrency}
            priceState={priceState}
            currentValue={currentValue}
            onCurrentValue={setCurrentValue}
            income={income}
            onIncome={setIncome}
            frequency={frequency}
            onFrequency={setFrequency}
            incomeMonth={incomeMonth}
            onIncomeMonth={setIncomeMonth}
            annualRatePct={annualRatePct}
            onAnnualRatePct={setAnnualRatePct}
            maturityDate={maturityDate}
            onMaturityDate={setMaturityDate}
            category={category}
            subtype={subtype}
            onSubtype={setSubtype}
            rc={rc}
            onRc={setRc}
            debtId={debtId}
            onDebtId={setDebtId}
            region={region}
            onRegion={setRegion}
            registerExpense={registerExpense}
            onRegisterExpense={setRegisterExpense}
            isEdit={isEdit}
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
          onClick={() => (step === 2 && !prefill ? setStep(1) : onClose())}
        >
          {step === 2 && !prefill ? "← Atrás" : "Cancelar"}
        </button>
        {step === 2 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !canSave}
            onClick={handleSave}
          >
            {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar"}
          </button>
        ) : null}
      </div>
    </Modal>
  );
}

// ── Paso 1: grid de categorías ─────────────────────────────────────

function Step1Categories({ onChoose }: { onChoose: (c: InvestmentCategory) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (c: InvestmentCategory) =>
    !q || CATEGORY_META[c].label.toLowerCase().includes(q) || c.includes(q);
  const cashflow = CASHFLOW_CATEGORIES.filter(match);
  const growth = GROWTH_CATEGORIES.filter(match);

  return (
    <div>
      <div className="fld">
        <input
          className="inp"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar (ej. Airbnb, S&P 500, cripto…)"
          autoFocus
          autoComplete="off"
        />
      </div>
      {cashflow.length > 0 ? (
        <CategoryGroup
          title="Flujo de caja"
          hint="generan ingreso recurrente"
          cats={cashflow}
          onChoose={onChoose}
        />
      ) : null}
      {growth.length > 0 ? (
        <CategoryGroup
          title="Crecimiento"
          hint="buscan plusvalía"
          cats={growth}
          onChoose={onChoose}
        />
      ) : null}
      {cashflow.length === 0 && growth.length === 0 ? (
        <div className="muted" style={{ padding: "18px 0", textAlign: "center", fontSize: 13 }}>
          Sin categorías que coincidan con “{query}”.
        </div>
      ) : null}
    </div>
  );
}

function CategoryGroup({
  title,
  hint,
  cats,
  onChoose,
}: {
  title: string;
  hint: string;
  cats: InvestmentCategory[];
  onChoose: (c: InvestmentCategory) => void;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "4px 0 8px", fontSize: 12.5 }}
      >
        <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>{title}</span>
        <span className="muted" style={{ fontSize: 11 }}>
          · {hint}
        </span>
      </div>
      <select
        className="sel"
        value=""
        onChange={(e) => {
          if (e.target.value) onChoose(e.target.value as InvestmentCategory);
        }}
        aria-label={`Tipo de inversión · ${title}`}
      >
        <option value="" disabled>
          Elegí un tipo…
        </option>
        {cats.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_META[c].label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Paso 2: campos condicionales ───────────────────────────────────

/** Pago por periodo estimado desde monto × % anual, según la frecuencia. */
function perPaymentFromRate(invested: string, ratePct: string, freq: string): string {
  if (freq === "al_vencimiento") return "";
  const principal = parseFloat(invested) || 0;
  const rate = parseFloat(ratePct) || 0;
  if (principal <= 0 || rate <= 0) return "";
  const annual = (principal * rate) / 100;
  const divisor =
    freq === "semanal" ? 52 : freq === "mensual" ? 12 : freq === "trimestral" ? 4 : freq === "semestral" ? 2 : 1;
  return String(Math.round((annual / divisor) * 100) / 100);
}
/** Meses de pago derivados del mes ancla (1-12) + frecuencia. */
function derivedMonths(freq: string, anchor: number): number[] {
  const a = ((((anchor || 1) - 1) % 12) + 12) % 12;
  if (freq === "trimestral") return [0, 3, 6, 9].map((k) => ((a + k) % 12) + 1);
  if (freq === "semestral") return [0, 6].map((k) => ((a + k) % 12) + 1);
  if (freq === "anual") return [a + 1];
  return [];
}

function Step2Fields(props: {
  profile: "A" | "B" | "C" | null;
  cur: string;
  name: string;
  onName: (v: string) => void;
  invested: string;
  onInvested: (v: string) => void;
  onCurrency: (v: string) => void;
  aportoCadaMes: boolean;
  onAportoCadaMes: (v: boolean) => void;
  aporteMensual: string;
  onAporteMensual: (v: string) => void;
  symbol: string;
  onSymbol: (v: string) => void;
  quantity: string;
  onQuantity: (v: string) => void;
  unitPrice: string;
  onUnitPrice: (v: string) => void;
  livePrice: number | null;
  livePriceCurrency: string;
  priceState: "idle" | "loading" | "ok" | "error";
  currentValue: string;
  onCurrentValue: (v: string) => void;
  income: string;
  onIncome: (v: string) => void;
  frequency: "semanal" | "mensual" | "trimestral" | "semestral" | "anual" | "al_vencimiento";
  onFrequency: (v: "semanal" | "mensual" | "trimestral" | "semestral" | "anual" | "al_vencimiento") => void;
  incomeMonth: string;
  onIncomeMonth: (v: string) => void;
  annualRatePct: string;
  onAnnualRatePct: (v: string) => void;
  maturityDate: string;
  onMaturityDate: (v: string) => void;
  category: InvestmentCategory | null;
  subtype: "alquiler" | "airbnb";
  onSubtype: (v: "alquiler" | "airbnb") => void;
  rc: RentalCosts;
  onRc: (v: RentalCosts) => void;
  debtId: string;
  onDebtId: (v: string) => void;
  region: string;
  onRegion: (v: string) => void;
  registerExpense: boolean;
  onRegisterExpense: (v: boolean) => void;
  isEdit: boolean;
}) {
  const { profile, cur } = props;
  return (
    <div>
      {/* Nombre */}
      <div className="fld">
        <label className="fld-label">Nombre</label>
        <input
          className="inp"
          value={props.name}
          onChange={(e) => props.onName(e.target.value)}
          placeholder="Ej. Apto Escazú, VOO, CDP Banco Nacional…"
          maxLength={120}
          autoFocus
        />
      </div>

      {/* Monto invertido + moneda */}
      <div className="fld-2">
        <div className="fld">
          <label className="fld-label">Monto invertido</label>
          <div className="inp-money">
            <span className="pre">{currencySymbol(cur)}</span>
            <input
              type="number"
              step="any"
              min="0"
              value={props.invested}
              onChange={(e) => props.onInvested(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <div className="fld">
          <label className="fld-label">Moneda</label>
          <select className="sel" value={cur} onChange={(e) => props.onCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Perfil A · cotizado */}
      {profile === "A" ? (
        <>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">
              Símbolo (opcional) <HelpTip text="Si lo das, buscamos el precio en vivo y calculamos el valor con tu cantidad. Si lo dejas vacío, se usa el monto invertido." />
            </label>
            <input
              className="inp"
              value={props.symbol}
              onChange={(e) => props.onSymbol(e.target.value.toUpperCase().slice(0, 12))}
              placeholder="Ej. VOO, BTC"
              autoComplete="off"
            />
            {props.priceState === "loading" ? (
              <span className="muted" style={{ fontSize: 11 }}>
                Buscando precio…
              </span>
            ) : props.priceState === "ok" && props.livePrice !== null ? (
              <>
                <span style={{ fontSize: 11.5, color: "var(--pos)" }}>
                  {formatMoney(props.livePrice, props.livePriceCurrency)} en vivo
                </span>
                {props.livePriceCurrency !== cur ? (
                  <span style={{ fontSize: 11, color: "var(--warn)", display: "block", marginTop: 2 }}>
                    El precio está en {props.livePriceCurrency} y tu moneda es {cur}. Ingresa el monto
                    invertido en {cur}; no convertimos automáticamente.
                  </span>
                ) : null}
              </>
            ) : props.priceState === "error" ? (
              <span style={{ fontSize: 11, color: "var(--warn)" }}>Precio no disponible</span>
            ) : null}
          </div>
          <div className="fld">
            <label className="fld-label">
              Precio de compra <HelpTip text="El precio por unidad al que compraste. Base para el promedio ponderado del costo." />
            </label>
            <div className="inp-money">
              <span className="pre">{currencySymbol(cur)}</span>
              <input
                type="number"
                step="any"
                min="0"
                value={props.unitPrice}
                onChange={(e) => props.onUnitPrice(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </div>
        <div className="fld">
          <label className="fld-label">Cantidad (opcional)</label>
          <input
            className="inp"
            type="number"
            step="any"
            min="0"
            value={
              (parseFloat(props.unitPrice) || 0) > 0 && (parseFloat(props.invested) || 0) > 0
                ? String(+((parseFloat(props.invested) || 0) / (parseFloat(props.unitPrice) || 1)).toFixed(8))
                : props.quantity
            }
            onChange={(e) => props.onQuantity(e.target.value)}
            readOnly={(parseFloat(props.unitPrice) || 0) > 0}
            placeholder="0"
          />
          {(parseFloat(props.unitPrice) || 0) > 0 ? (
            <span className="muted" style={{ fontSize: 11 }}>
              Calculado: monto ÷ precio. Ingresá precio o cantidad; el otro se deriva.
            </span>
          ) : null}
        </div>
        </>
      ) : null}

      {/* Perfil B / C · valor actual manual */}
      {profile === "B" || profile === "C" ? (
        <div className="fld">
          <label className="fld-label">
            {profile === "C" ? "Valor actual estimado" : "Valor actual"}{" "}
            <HelpTip text="Cuánto vale hoy el activo. Si lo dejas vacío, usamos el monto invertido." />
          </label>
          <div className="inp-money">
            <span className="pre">{currencySymbol(cur)}</span>
            <input
              type="number"
              step="any"
              min="0"
              value={props.currentValue}
              onChange={(e) => props.onCurrentValue(e.target.value)}
              placeholder="= monto invertido"
            />
          </div>
        </div>
      ) : null}

      {/* Perfil B · ingreso que genera */}
      {profile === "B" ? (
        <>
          <div className="fld">
            <label className="fld-label">
              % rendimiento anual (opcional){" "}
              <HelpTip text="Renta fija (bono/CDP): % anual sobre el monto invertido. Calcula el ingreso por pago; podés ajustarlo a mano." />
            </label>
            <div className="inp-money">
              <span className="pre">%</span>
              <input
                type="number"
                step="any"
                min="0"
                value={props.annualRatePct}
                onChange={(e) => {
                  const v = e.target.value;
                  props.onAnnualRatePct(v);
                  const pp = perPaymentFromRate(props.invested, v, props.frequency);
                  if (pp) props.onIncome(pp);
                }}
                placeholder="0"
              />
            </div>
          </div>
          <div className="fld-2">
            <div className="fld">
              <label className="fld-label">Ingreso que genera (opcional)</label>
              <div className="inp-money">
                <span className="pre">{currencySymbol(cur)}</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={props.income}
                  onChange={(e) => props.onIncome(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="fld">
              <label className="fld-label">Frecuencia</label>
              <select
                className="sel"
                value={props.frequency}
                onChange={(e) => {
                  const f = e.target.value as typeof props.frequency;
                  props.onFrequency(f);
                  const pp = perPaymentFromRate(props.invested, props.annualRatePct, f);
                  if (pp) props.onIncome(pp);
                }}
              >
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
                <option value="al_vencimiento">Al vencimiento</option>
              </select>
            </div>
          </div>
          {props.frequency !== "mensual" &&
          props.frequency !== "semanal" &&
          props.frequency !== "al_vencimiento" ? (
            <div className="fld">
              <label className="fld-label">
                Mes ancla (primer pago){" "}
                <HelpTip text="Elegí el primer mes de pago; los demás se calculan según la frecuencia y caen automáticamente en el área de Ingresos." />
              </label>
              <select
                className="sel"
                value={props.incomeMonth}
                onChange={(e) => props.onIncomeMonth(e.target.value)}
              >
                {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map(
                  (mLbl, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {mLbl}
                    </option>
                  ),
                )}
              </select>
              {(() => {
                const L = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
                const ms = derivedMonths(props.frequency, parseInt(props.incomeMonth, 10) || 1);
                return ms.length > 1 ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {ms.map((m) => (
                      <span
                        key={m}
                        style={{
                          fontSize: 12,
                          padding: "4px 9px",
                          borderRadius: 8,
                          background: "var(--info-soft)",
                          color: "var(--info)",
                          fontWeight: 600,
                        }}
                      >
                        {L[m - 1]}
                      </span>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
          ) : null}
          {props.frequency === "al_vencimiento" ? (
            <div className="fld">
              <label className="fld-label">
                Fecha de vencimiento{" "}
                <HelpTip text="Mes y año en que recibís el pago único. El ingreso aparece en Ingresos solo en ese mes." />
              </label>
              <input
                className="inp"
                type="month"
                value={props.maturityDate}
                onChange={(e) => props.onMaturityDate(e.target.value)}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {props.category === "propiedad_alquiler" ? (
        <RentalCostsBlock
          cur={cur}
          invested={props.invested}
          income={props.income}
          frequency={props.frequency}
          subtype={props.subtype}
          onSubtype={props.onSubtype}
          rc={props.rc}
          onRc={props.onRc}
          debtId={props.debtId}
          onDebtId={props.onDebtId}
        />
      ) : null}

      {/* Común · aporto cada mes */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 6,
          fontSize: 12.5,
          color: "var(--ink-2)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={props.aportoCadaMes}
          onChange={(e) => props.onAportoCadaMes(e.target.checked)}
        />
        Aporto cada mes
        <HelpTip text="Marca esta posición como aporte recurrente y anota cuánto agregas cada mes (se guarda aparte del total invertido)." />
      </label>
      {props.aportoCadaMes ? (
        <div className="fld" style={{ marginTop: 6 }}>
          <label className="fld-label">Aporte mensual</label>
          <div className="inp-money">
            <span className="pre">{currencySymbol(cur)}</span>
            <input
              type="number"
              step="any"
              min="0"
              value={props.aporteMensual}
              onChange={(e) => props.onAporteMensual(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      ) : null}

      {/* Común final · región */}
      <div className="fld" style={{ marginTop: 10 }}>
        <label className="fld-label">Región / país</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {REGIONS.map((r) => (
            <PillButton
              key={r.value}
              active={props.region === r.value}
              onClick={() => props.onRegion(r.value)}
            >
              {r.label}
            </PillButton>
          ))}
        </div>
      </div>

      {/* Switch · registrar gasto */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
          fontSize: 12.5,
          color: "var(--ink-2)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={props.registerExpense}
          onChange={(e) => props.onRegisterExpense(e.target.checked)}
        />
        Registrar como gasto este mes
        <HelpTip
          text={
            props.isEdit
              ? "Solo si este cambio es un aporte real: crea el gasto vinculado por el aumento de posición."
              : "Crea la transacción de gasto vinculada (Compra/Aporte) en Base Financiera. Desmárcalo si cargas histórico."
          }
        />
      </label>
    </div>
  );
}

// ── Átomos compartidos ─────────────────────────────────────────────

/** Tooltip en portal para evitar el clipping por overflow del modal. */
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

// ── Inmueble de renta: costos operativos + ROI en vivo ─────────────

function RentalCostsBlock(props: {
  cur: string;
  invested: string;
  income: string;
  frequency: "semanal" | "mensual" | "trimestral" | "semestral" | "anual" | "al_vencimiento";
  subtype: "alquiler" | "airbnb";
  onSubtype: (v: "alquiler" | "airbnb") => void;
  rc: RentalCosts;
  onRc: (v: RentalCosts) => void;
  debtId: string;
  onDebtId: (v: string) => void;
}) {
  const { cur, rc, onRc } = props;
  const set = (k: keyof RentalCosts) => (e: ChangeEvent<HTMLInputElement>) =>
    onRc({ ...rc, [k]: e.target.value });

  // Deudas del usuario para ligar la hipoteca (C-1b). Solo las de la misma
  // moneda del inmueble: mezclar monedas en el flujo sería incorrecto.
  const [debts, setDebts] = useState<LinkableDebt[]>([]);
  useEffect(() => {
    let alive = true;
    void listLinkableDebtsAction().then((d) => {
      if (alive) setDebts(d);
    });
    return () => {
      alive = false;
    };
  }, []);
  const debtsSameCur = debts.filter((d) => d.currency === cur);
  const linkedDebt = debts.find((d) => d.id === props.debtId) ?? null;
  const debtServiceMonthly = linkedDebt ? linkedDebt.currentPayment : 0;

  const investedCash =
    (parseFloat(rc.purchasePrice) || 0) + (parseFloat(rc.closingCosts) || 0) ||
    parseFloat(props.invested) ||
    0;

  const roi = computeRentalRoi({
    rentalIncome: parseFloat(props.income) || 0,
    // al_vencimiento no aplica a inmueble; para el ROI se trata como anual.
    rentalFrequency: props.frequency === "al_vencimiento" ? "anual" : props.frequency,
    vacancyPct: (parseFloat(rc.vacancyPct) || 0) / 100,
    mgmtPct: (parseFloat(rc.mgmtPct) || 0) / 100,
    maintenanceMonthly: parseFloat(rc.maintenance) || 0,
    hoaMonthly: parseFloat(rc.hoa) || 0,
    servicesMonthly: parseFloat(rc.services) || 0,
    propertyTaxAnnual: parseFloat(rc.propertyTax) || 0,
    insuranceAnnual: parseFloat(rc.insurance) || 0,
    investedCash,
    debtServiceMonthly,
  });
  const hasData = (parseFloat(props.income) || 0) > 0;

  const money = (ph: string, k: keyof RentalCosts) => (
    <div className="inp-money">
      <span className="pre">{currencySymbol(cur)}</span>
      <input type="number" step="any" min="0" value={rc[k]} onChange={set(k)} placeholder={ph} />
    </div>
  );
  const pct = (k: keyof RentalCosts, ph: string) => (
    <div className="inp-money">
      <input type="number" step="any" min="0" max="100" value={rc[k]} onChange={set(k)} placeholder={ph} />
      <span className="pre" style={{ paddingLeft: 4, paddingRight: 11 }}>%</span>
    </div>
  );

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
      <div className="fld">
        <label className="fld-label">Tipo de renta</label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["alquiler", "airbnb"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`btn ${props.subtype === s ? "btn-primary" : "btn-secondary"}`}
              style={{ flex: 1, fontSize: 13 }}
              onClick={() => props.onSubtype(s)}
            >
              {s === "alquiler" ? "Alquiler tradicional" : "Airbnb / corto plazo"}
            </button>
          ))}
        </div>
      </div>

      <div className="fld-2">
        <div className="fld"><label className="fld-label">Precio de compra <HelpTip text="Lo que pagaste por la propiedad. Base para plusvalía y ROI." /></label>{money("0", "purchasePrice")}</div>
        <div className="fld"><label className="fld-label">Costos de cierre <HelpTip text="Traspaso, abogado, comisiones de compra." /></label>{money("0", "closingCosts")}</div>
      </div>

      <div className="fld-2">
        <div className="fld"><label className="fld-label">Vacancia <HelpTip text="% de meses sin alquilar. Airbnb suele rondar 25-40%." /></label>{pct("vacancyPct", "0")}</div>
        <div className="fld"><label className="fld-label">Administración <HelpTip text="Property manager o co-host, sobre la renta cobrada. CR: 8-12% alquiler, 15-25% Airbnb." /></label>{pct("mgmtPct", "0")}</div>
      </div>

      <div className="fld-2">
        <div className="fld"><label className="fld-label">Mantenimiento (mes)</label>{money("0", "maintenance")}</div>
        <div className="fld"><label className="fld-label">Condominio / HOA (mes)</label>{money("0", "hoa")}</div>
      </div>

      <div className="fld-2">
        <div className="fld"><label className="fld-label">Imp. Bienes Inmuebles (año) <HelpTip text="CR: 0,25% anual del valor registrado. Editable." /></label>{money("0", "propertyTax")}</div>
        <div className="fld"><label className="fld-label">Seguro (año)</label>{money("0", "insurance")}</div>
      </div>

      <div className="fld">
        <label className="fld-label">Servicios + limpieza (mes) <HelpTip text="Agua/luz/internet/limpieza que cubre el dueño (común en Airbnb)." /></label>
        {money("0", "services")}
      </div>

      <div className="fld">
        <label className="fld-label">
          Deuda que la financia <HelpTip text="Liga la hipoteca o préstamo de este inmueble; su cuota mensual se descuenta del flujo. Solo deudas en la misma moneda." />
        </label>
        <select
          className="sel"
          value={props.debtId}
          onChange={(e) => props.onDebtId(e.target.value)}
        >
          <option value="">Sin deuda ligada</option>
          {debtsSameCur.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {formatMoney(d.currentPayment, d.currency)}/mes
            </option>
          ))}
        </select>
        {debts.length > 0 && debtsSameCur.length === 0 ? (
          <span className="muted" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
            No tienes deudas en {cur}. Regístralas en Deudas para ligarlas.
          </span>
        ) : null}
      </div>

      {hasData ? (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5 }}>
            <span className="muted">Flujo neto (sin deuda)</span>
            <strong style={{ color: roi.netMonthly >= 0 ? "var(--pos)" : "var(--neg)" }}>
              {formatMoney(roi.netMonthly, cur)}/mes
            </strong>
          </div>
          {linkedDebt ? (
            <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5, marginTop: 6 }}>
              <span className="muted">Flujo neto con deuda</span>
              <strong style={{ color: roi.leveredNetMonthly >= 0 ? "var(--pos)" : "var(--neg)" }}>
                {formatMoney(roi.leveredNetMonthly, cur)}/mes
              </strong>
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5, marginTop: 6 }}>
            <span className="muted">ROI operativo anual</span>
            <strong style={{ color: "var(--info)" }}>{(roi.operatingRoi * 100).toFixed(1)}%</strong>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.45 }}>
            La plusvalía se suma en un paso posterior.
          </div>
        </div>
      ) : null}
    </div>
  );
}
