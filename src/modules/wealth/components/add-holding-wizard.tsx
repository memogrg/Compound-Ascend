"use client";

/**
 * Captura de inversiones — modal de 2 pasos (≤1 min). Paso 1: grid de las 20
 * categorías (CATEGORY_META) agrupadas por naturaleza + buscador. Paso 2: campos
 * mínimos condicionales por perfil (A cotizado · B flujo de caja manual · C
 * crecimiento manual) + región + registrar gasto. SOLO UI: valida con
 * holdingInputSchema (vía addHoldingAction/editHoldingAction); no toca services.
 */
import { useState, useRef, useCallback, useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatMoney, currencySymbol, captureCurrencyDefault } from "@/lib/format";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import { useCaptureCurrency } from "@/components/layout/currency-context";
import { useDeepLinkModal } from "@/lib/hooks/use-deep-link-modal";
import { addHoldingAction, editHoldingAction } from "@/modules/wealth/api/actions";
import { CATEGORY_META, CASHFLOW_CATEGORIES, GROWTH_CATEGORIES } from "@/modules/wealth/constants";
import type { AssetType, Holding, InvestmentCategory } from "@/modules/wealth/types";
import type { HoldingInput } from "@/modules/wealth/schemas";

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

  // ── Perfil A (cotizado) ──
  const [symbol, setSymbol] = useState(prefill?.symbol ?? "");
  const [quantity, setQuantity] = useState(prefill && prefill.quantity > 0 ? String(prefill.quantity) : "");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePriceCurrency, setLivePriceCurrency] = useState("USD");
  const [priceState, setPriceState] = useState<"idle" | "loading" | "ok" | "error">("idle");

  // ── Perfil B / C (manual) ──
  const [currentValue, setCurrentValue] = useState(
    prefill?.currentValueManual != null ? String(prefill.currentValueManual) : "",
  );
  const [income, setIncome] = useState(prefill?.rentalIncome != null ? String(prefill.rentalIncome) : "");
  const [frequency, setFrequency] = useState<"mensual" | "trimestral" | "anual">(
    prefill?.rentalFrequency ?? "mensual",
  );
  const [incomeMonth, setIncomeMonth] = useState(prefill?.incomeMonth ? String(prefill.incomeMonth) : "1");

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
    const useUnits = m.quoted && qtyNum > 0;
    const finalQty = useUnits ? qtyNum : 1;
    // Si no hay monto invertido, solo se cae al precio en vivo cuando su moneda
    // coincide con `cur`; si difiere, no se asume (quedaría mal etiquetado).
    const liveForCost = liveMatchesCur ? (livePrice ?? 0) : 0;
    const finalAvg = useUnits ? (investedNum > 0 ? investedNum / qtyNum : liveForCost) : investedNum;

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
          if (frequency !== "mensual") base.incomeMonth = parseInt(incomeMonth, 10) || undefined;
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
            symbol={symbol}
            onSymbol={(v) => {
              setSymbol(v);
              if (meta) lookupPrice(v, meta.defaultAssetType);
            }}
            quantity={quantity}
            onQuantity={setQuantity}
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
  symbol: string;
  onSymbol: (v: string) => void;
  quantity: string;
  onQuantity: (v: string) => void;
  livePrice: number | null;
  livePriceCurrency: string;
  priceState: "idle" | "loading" | "ok" | "error";
  currentValue: string;
  onCurrentValue: (v: string) => void;
  income: string;
  onIncome: (v: string) => void;
  frequency: "mensual" | "trimestral" | "anual";
  onFrequency: (v: "mensual" | "trimestral" | "anual") => void;
  incomeMonth: string;
  onIncomeMonth: (v: string) => void;
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
          <label className="fld-label">
            {props.aportoCadaMes ? "Aporte mensual" : "Monto invertido"}
          </label>
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
            <label className="fld-label">Cantidad (opcional)</label>
            <input
              className="inp"
              type="number"
              step="any"
              min="0"
              value={props.quantity}
              onChange={(e) => props.onQuantity(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
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
                onChange={(e) => props.onFrequency(e.target.value as typeof props.frequency)}
              >
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>
          </div>
          {props.frequency !== "mensual" ? (
            <div className="fld">
              <label className="fld-label">
                Mes en que se materializa{" "}
                <HelpTip text="Para ingresos no mensuales, el mes (1-12) en que normalmente se recibe." />
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
            </div>
          ) : null}
        </>
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
        <HelpTip text="Marca esta posición como aporte recurrente; el monto de arriba se toma como tu aporte mensual." />
      </label>

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
