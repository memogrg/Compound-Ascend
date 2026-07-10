"use client";

/**
 * Formularios de /m/inversiones (paridad con el wizard web add-holding-wizard.tsx):
 *  - HoldingWizardSheet: alta/edición/compra en 2 pasos (categoría → campos
 *    condicionales por perfil A/B/C + inmueble de renta con ROI + plan a plazo),
 *    delegando el armado del payload al engine compartido `buildHoldingPayload`.
 *  - SellHoldingForm / DividendForm: movimientos (venta → ingreso vinculado;
 *    dividendo → transacción vinculada). Reutilizan las MISMAS Server Actions que
 *    la web (wealth/api/actions.ts). Form Kit + es-MX, tema claro.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { formatMoney, currencySymbol } from "@/lib/format";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import {
  addHoldingAction,
  editHoldingAction,
  sellHoldingAction,
  addDividendAction,
  listLinkableDebtsAction,
  type LinkableDebt,
} from "@/modules/wealth/api/actions";
import { CATEGORY_META, CASHFLOW_CATEGORIES, GROWTH_CATEGORIES } from "@/modules/wealth/constants";
import { computeRentalRoi } from "@/modules/wealth/engine/rental-roi";
import {
  buildHoldingPayload,
  categoryFromAssetType,
  profileForCategory,
  perPaymentFromRate,
  derivedMonths,
  type HoldingFormValues,
  type HoldingFrequency,
  type RentalCosts,
} from "@/modules/wealth/engine/holding-payload";
import type { AssetType, Holding, InvestmentCategory } from "@/modules/wealth/types";

import {
  BottomSheet,
  FormShell,
  MoneyField,
  DateField,
  SheetSelect,
  Segmented,
  Toggle,
  useToast,
  type ActionResult,
  type Opt,
} from "../../components/form-kit";

const numStr = (n: number | undefined): string => (n == null ? "" : String(n));

const CUR_OPTS: Opt[] = CURRENCIES.map((c) => ({ value: c.value, label: c.label }));
const REGION_OPTS: Opt[] = [
  { value: "us", label: "US" },
  { value: "cr", label: "CR" },
  { value: "eu", label: "EU" },
  { value: "latam", label: "LATAM" },
  { value: "global", label: "Global" },
  { value: "otro", label: "Otro" },
];
const FREQ_OPTS: Opt[] = [
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
  { value: "al_vencimiento", label: "Al vencimiento" },
];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTH_OPTS: Opt[] = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

const API_TYPE_MAP: Partial<Record<AssetType, string>> = { etf: "etf", accion: "stock", cripto: "crypto" };

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Wizard alta / edición / compra ───────────────────────────────────────────
export function HoldingWizardSheet({
  open,
  onClose,
  primaryCurrency,
  prefill,
  editId,
}: {
  open: boolean;
  onClose: () => void;
  /** Moneda principal del usuario (default de captura al crear). */
  primaryCurrency: string;
  prefill?: Holding;
  editId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = Boolean(editId);

  const initialCategory = prefill ? (prefill.category ?? categoryFromAssetType(prefill.assetType)) : null;
  const [category, setCategory] = useState<InvestmentCategory | null>(initialCategory);
  const [step, setStep] = useState<1 | 2>(prefill ? 2 : 1);

  // Comunes
  const [name, setName] = useState(prefill?.label ?? prefill?.symbol ?? "");
  const [invested, setInvested] = useState<number | undefined>(
    prefill && prefill.quantity > 0 ? prefill.quantity * prefill.averageCost : undefined,
  );
  const [cur, setCur] = useState(prefill?.currency ?? primaryCurrency);
  const [aportoCadaMes, setAportoCadaMes] = useState(prefill?.isRecurring ?? false);
  const [aporteMensual, setAporteMensual] = useState<number | undefined>(
    prefill?.monthlyContribution ?? undefined,
  );

  // Perfil A (cotizado)
  const [symbol, setSymbol] = useState(prefill?.symbol ?? "");
  const [quantity, setQuantity] = useState(
    prefill && prefill.quantity > 0 ? String(prefill.quantity) : "",
  );
  const [unitPrice, setUnitPrice] = useState<number | undefined>(
    prefill && prefill.quantity > 0 ? prefill.averageCost : undefined,
  );
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePriceCurrency, setLivePriceCurrency] = useState("USD");
  const [priceState, setPriceState] = useState<"idle" | "loading" | "ok" | "error">("idle");

  // Perfil B/C (manual)
  const [currentValue, setCurrentValue] = useState<number | undefined>(
    prefill?.currentValueManual ?? undefined,
  );
  const [income, setIncome] = useState<number | undefined>(prefill?.rentalIncome ?? undefined);
  const [frequency, setFrequency] = useState<HoldingFrequency>(prefill?.rentalFrequency ?? "mensual");
  const [incomeMonth, setIncomeMonth] = useState(prefill?.incomeMonth ? String(prefill.incomeMonth) : "1");
  const [annualRatePct, setAnnualRatePct] = useState(
    prefill?.annualRatePct != null ? String(prefill.annualRatePct) : "",
  );
  const [maturityDate, setMaturityDate] = useState(
    prefill?.maturityDate ? String(prefill.maturityDate).slice(0, 7) : "",
  );
  const [termYears, setTermYears] = useState(prefill?.termYears != null ? String(prefill.termYears) : "");
  const [startDate, setStartDate] = useState(prefill?.purchaseDate ?? todayISO());

  // Inmueble de renta
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
  const [debtId, setDebtId] = useState(prefill?.debtId ?? "");

  // Común final
  const [region, setRegion] = useState(prefill?.region ?? "global");
  const [registerExpense, setRegisterExpense] = useState(false);

  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const meta = category ? CATEGORY_META[category] : null;
  const profile = profileForCategory(category);

  // Plan a plazo: deriva el vencimiento de inicio + plazo.
  useEffect(() => {
    if (category === "plan_inversion" && startDate && termYears) {
      const d = new Date(startDate);
      d.setFullYear(d.getFullYear() + parseInt(termYears, 10));
      setMaturityDate(d.toISOString().slice(0, 7));
    }
  }, [category, startDate, termYears]);

  // Precio en vivo (perfil A, símbolo opcional).
  const priceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      if (priceTimer.current) clearTimeout(priceTimer.current);
      priceAbort.current?.abort();
    },
    [],
  );
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
          const res = await fetch(`/api/market-price?symbol=${encodeURIComponent(s)}&type=${apiType}`, {
            signal: ctrl.signal,
          });
          if (!res.ok) return setPriceState("error");
          const data = (await res.json()) as { price?: number; currency?: string };
          if (typeof data.price === "number" && data.price > 0) {
            setLivePrice(data.price);
            setLivePriceCurrency(data.currency ?? "USD");
            setPriceState("ok");
          } else setPriceState("error");
        } catch {
          /* abort */
        }
      }, 350);
    },
    [],
  );

  const investedNum = invested ?? 0;
  const canSave = !!category && name.trim().length > 0 && investedNum > 0;

  function buildValues(): HoldingFormValues {
    return {
      category: category!,
      name,
      invested: numStr(invested),
      cur,
      symbol,
      quantity,
      unitPrice: numStr(unitPrice),
      livePrice,
      livePriceCurrency,
      currentValue: numStr(currentValue),
      income: numStr(income),
      frequency,
      incomeMonth,
      annualRatePct,
      maturityDate,
      termYears,
      startDate,
      subtype,
      rc,
      debtId,
      region,
      aportoCadaMes,
      aporteMensual: numStr(aporteMensual),
      registerExpense,
    };
  }

  async function handleSave() {
    setErrorMsg(null);
    if (!canSave) return setErrorMsg("Completa el nombre y el monto invertido.");
    setPending(true);
    try {
      const payload = buildHoldingPayload(buildValues());
      const res = editId ? await editHoldingAction(editId, payload) : await addHoldingAction(payload);
      if (!res.ok) {
        const firstErr = res.fieldErrors ? Object.values(res.fieldErrors)[0] : undefined;
        setErrorMsg(firstErr ?? res.message ?? "No pudimos guardar la posición.");
        return;
      }
      toast.show(isEdit ? "Posición actualizada" : "Posición agregada", "success");
      onClose();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const title = isEdit
    ? `Editar — ${prefill?.label ?? prefill?.symbol ?? "inversión"}`
    : step === 1
      ? "Agregar inversión"
      : (meta?.label ?? "Datos de la inversión");

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {step === 1 && !prefill ? (
        <Step1Categories
          onChoose={(c) => {
            setCategory(c);
            setStep(2);
          }}
        />
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          <Step2Fields
            profile={profile}
            cur={cur}
            category={category}
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
            termYears={termYears}
            onTermYears={setTermYears}
            startDate={startDate}
            onStartDate={setStartDate}
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

          {errorMsg ? (
            <div className="m-field-err" role="alert" style={{ marginTop: 4 }}>
              {errorMsg}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {step === 2 && !prefill ? (
              <button type="button" className="m-btn m-btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setStep(1)}>
                ← Atrás
              </button>
            ) : null}
            <button
              type="button"
              className="m-btn m-btn-block m-btn-primary"
              disabled={pending || !canSave}
              onClick={handleSave}
            >
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

// ── Paso 1: categorías (buscador + grupos por naturaleza) ────────────────────
function Step1Categories({ onChoose }: { onChoose: (c: InvestmentCategory) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (c: InvestmentCategory) =>
    !q || CATEGORY_META[c].label.toLowerCase().includes(q) || c.includes(q);
  const cashflow = CASHFLOW_CATEGORIES.filter(match);
  const growth = GROWTH_CATEGORIES.filter(match);

  const Group = ({ title, hint, cats }: { title: string; hint: string; cats: InvestmentCategory[] }) =>
    cats.length > 0 ? (
      <div style={{ marginTop: 12 }}>
        <div className="ov" style={{ marginBottom: 6 }}>
          {title} · <span className="muted" style={{ fontWeight: 400 }}>{hint}</span>
        </div>
        <div className="m-optlist">
          {cats.map((c) => (
            <button key={c} type="button" className="m-opt" onClick={() => onChoose(c)}>
              <span className="m-opt-t">{CATEGORY_META[c].label}</span>
            </button>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div>
      <input
        className="m-inp"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar (ej. Airbnb, S&P 500, cripto…)"
        autoFocus
        autoComplete="off"
      />
      <Group title="Flujo de caja" hint="generan ingreso" cats={cashflow} />
      <Group title="Crecimiento" hint="buscan plusvalía" cats={growth} />
      {cashflow.length === 0 && growth.length === 0 ? (
        <div className="muted" style={{ padding: "18px 0", textAlign: "center", fontSize: 13 }}>
          Sin categorías que coincidan con “{query}”.
        </div>
      ) : null}
    </div>
  );
}

// ── Paso 2: campos condicionales ─────────────────────────────────────────────
type Step2Props = {
  profile: "A" | "B" | "C" | null;
  cur: string;
  category: InvestmentCategory | null;
  name: string;
  onName: (v: string) => void;
  invested: number | undefined;
  onInvested: (v: number | undefined) => void;
  onCurrency: (v: string) => void;
  aportoCadaMes: boolean;
  onAportoCadaMes: (v: boolean) => void;
  aporteMensual: number | undefined;
  onAporteMensual: (v: number | undefined) => void;
  symbol: string;
  onSymbol: (v: string) => void;
  quantity: string;
  onQuantity: (v: string) => void;
  unitPrice: number | undefined;
  onUnitPrice: (v: number | undefined) => void;
  livePrice: number | null;
  livePriceCurrency: string;
  priceState: "idle" | "loading" | "ok" | "error";
  currentValue: number | undefined;
  onCurrentValue: (v: number | undefined) => void;
  income: number | undefined;
  onIncome: (v: number | undefined) => void;
  frequency: HoldingFrequency;
  onFrequency: (v: HoldingFrequency) => void;
  incomeMonth: string;
  onIncomeMonth: (v: string) => void;
  annualRatePct: string;
  onAnnualRatePct: (v: string) => void;
  maturityDate: string;
  onMaturityDate: (v: string) => void;
  termYears: string;
  onTermYears: (v: string) => void;
  startDate: string;
  onStartDate: (v: string) => void;
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
};

function Step2Fields(p: Step2Props) {
  const { profile, cur } = p;
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <TextInput name="name" label="Nombre" value={p.name} onChange={p.onName} placeholder="Ej. Apto Escazú, VOO, CDP…" autoFocus />

      <MoneyField name="invested" label="Monto invertido" value={p.invested} onChange={p.onInvested} currency={cur} />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={p.onCurrency} options={CUR_OPTS} sheetTitle="Moneda" />

      {/* Perfil A · cotizado */}
      {profile === "A" ? (
        <>
          <TextInput
            name="symbol"
            label="Símbolo (opcional)"
            value={p.symbol}
            onChange={(v) => p.onSymbol(v.toUpperCase().slice(0, 12))}
            placeholder="Ej. VOO, BTC"
          />
          {p.priceState === "loading" ? (
            <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>Buscando precio…</div>
          ) : p.priceState === "ok" && p.livePrice != null ? (
            <div style={{ fontSize: 11.5, marginTop: -6, marginBottom: 8, color: "var(--accent)" }}>
              {formatMoney(p.livePrice, p.livePriceCurrency)} en vivo
              {p.livePriceCurrency !== cur ? (
                <span style={{ color: "var(--warn)", display: "block" }}>
                  El precio está en {p.livePriceCurrency} y tu moneda es {cur}; ingresa el monto en {cur}.
                </span>
              ) : null}
            </div>
          ) : p.priceState === "error" ? (
            <div style={{ fontSize: 11, marginTop: -6, marginBottom: 8, color: "var(--warn)" }}>Precio no disponible</div>
          ) : null}
          <MoneyField name="unitPrice" label="Precio de compra (por unidad)" value={p.unitPrice} onChange={p.onUnitPrice} currency={cur} />
          <TextInput
            name="quantity"
            label="Cantidad (opcional)"
            value={
              (p.unitPrice ?? 0) > 0 && (p.invested ?? 0) > 0
                ? String(+((p.invested ?? 0) / (p.unitPrice ?? 1)).toFixed(8))
                : p.quantity
            }
            onChange={p.onQuantity}
            readOnly={(p.unitPrice ?? 0) > 0}
            placeholder="0"
          />
        </>
      ) : null}

      {/* Perfil B/C · valor actual manual */}
      {profile === "B" || profile === "C" ? (
        <MoneyField
          name="currentValue"
          label={profile === "C" ? "Valor actual estimado" : "Valor actual"}
          value={p.currentValue}
          onChange={p.onCurrentValue}
          currency={cur}
          placeholder="= monto invertido"
        />
      ) : null}

      {/* Plan a plazo · plazo + inicio */}
      {p.category === "plan_inversion" ? (
        <>
          <Segmented
            name="termYears"
            label="Plazo"
            value={p.termYears}
            onChange={p.onTermYears}
            options={[5, 10, 15, 20].map((y) => ({ value: String(y), label: `${y}a` }))}
          />
          {p.termYears && p.maturityDate ? (
            <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>
              Vence: {p.maturityDate} · el aporte deja de contar al vencer.
            </div>
          ) : null}
          <DateField name="startDate" label="Fecha de inicio del plan" value={p.startDate} onChange={p.onStartDate} />
        </>
      ) : null}

      {/* Perfil B · ingreso que genera */}
      {profile === "B" ? (
        <>
          <TextInput
            name="annualRatePct"
            label="% rendimiento anual (opcional)"
            value={p.annualRatePct}
            onChange={(v) => {
              p.onAnnualRatePct(v);
              const pp = perPaymentFromRate(numStr(p.invested), v, p.frequency);
              if (pp) p.onIncome(Number(pp));
            }}
            placeholder="0"
          />
          <MoneyField name="income" label="Ingreso que genera (opcional)" value={p.income} onChange={p.onIncome} currency={cur} />
          <SheetSelect
            name="frequency"
            label="Frecuencia"
            value={p.frequency}
            onChange={(v) => {
              const f = v as HoldingFrequency;
              p.onFrequency(f);
              const pp = perPaymentFromRate(numStr(p.invested), p.annualRatePct, f);
              if (pp) p.onIncome(Number(pp));
            }}
            options={FREQ_OPTS}
            sheetTitle="Frecuencia del ingreso"
          />
          {p.frequency !== "mensual" && p.frequency !== "semanal" && p.frequency !== "al_vencimiento" ? (
            <>
              <SheetSelect name="incomeMonth" label="Mes ancla (primer pago)" value={p.incomeMonth} onChange={p.onIncomeMonth} options={MONTH_OPTS} sheetTitle="Primer mes de pago" />
              {(() => {
                const ms = derivedMonths(p.frequency, parseInt(p.incomeMonth, 10) || 1);
                return ms.length > 1 ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: -4, marginBottom: 8 }}>
                    {ms.map((m) => (
                      <span key={m} className="badge neutral" style={{ fontSize: 11 }}>{MONTHS[m - 1]}</span>
                    ))}
                  </div>
                ) : null;
              })()}
            </>
          ) : null}
          {p.frequency === "al_vencimiento" ? (
            <MonthInput name="maturityDate" label="Fecha de vencimiento" value={p.maturityDate} onChange={p.onMaturityDate} />
          ) : null}
        </>
      ) : null}

      {/* Inmueble de renta · costos operativos + ROI */}
      {p.category === "propiedad_alquiler" ? (
        <RentalCostsBlock
          cur={cur}
          invested={numStr(p.invested)}
          income={numStr(p.income)}
          frequency={p.frequency}
          subtype={p.subtype}
          onSubtype={p.onSubtype}
          rc={p.rc}
          onRc={p.onRc}
          debtId={p.debtId}
          onDebtId={p.onDebtId}
        />
      ) : null}

      {/* Aporto cada mes */}
      <Toggle name="aportoCadaMes" label="Aporto cada mes" value={p.aportoCadaMes} onChange={p.onAportoCadaMes} hint="Aporte recurrente, aparte del total invertido." />
      {p.aportoCadaMes ? (
        <MoneyField name="aporteMensual" label="Aporte mensual" value={p.aporteMensual} onChange={p.onAporteMensual} currency={cur} />
      ) : null}

      {/* Región */}
      <SheetSelect name="region" label="Región / país" value={p.region} onChange={p.onRegion} options={REGION_OPTS} sheetTitle="Región / país" />

      {/* Nueva vs existente (al crear) / aporte real (al editar) */}
      {p.isEdit ? (
        <Toggle
          name="registerExpense"
          label="Registrar como gasto este mes"
          value={p.registerExpense}
          onChange={p.onRegisterExpense}
          hint="Solo si este cambio es un aporte real."
        />
      ) : (
        <div className="m-qfield">
          <div className="m-qlabel">¿Esta inversión es nueva o ya la tenías?</div>
          <div className="m-optlist">
            <button type="button" className={`m-opt${!p.registerExpense ? " sel" : ""}`} onClick={() => p.onRegisterExpense(false)}>
              <span className="m-opt-t">Ya la tenía · solo registrar la posición</span>
            </button>
            <button type="button" className={`m-opt${p.registerExpense ? " sel" : ""}`} onClick={() => p.onRegisterExpense(true)}>
              <span className="m-opt-t">La compré ahora · registrar el monto como gasto</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Átomos locales (Form Kit no cubre input de texto crudo / mes) ────────────
function TextInput({
  name,
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  readOnly,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="m-qfield">
      <div className="m-qlabel">{label}</div>
      <input
        className="m-inp"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        readOnly={readOnly}
        autoComplete="off"
      />
    </div>
  );
}

function MonthInput({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="m-qfield">
      <div className="m-qlabel">{label}</div>
      <input className="m-inp" name={name} type="month" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// ── Inmueble de renta: costos + ROI en vivo (reusa computeRentalRoi) ─────────
function RentalCostsBlock(props: {
  cur: string;
  invested: string;
  income: string;
  frequency: HoldingFrequency;
  subtype: "alquiler" | "airbnb";
  onSubtype: (v: "alquiler" | "airbnb") => void;
  rc: RentalCosts;
  onRc: (v: RentalCosts) => void;
  debtId: string;
  onDebtId: (v: string) => void;
}) {
  const { cur, rc, onRc } = props;
  const set = (k: keyof RentalCosts) => (v: string) => onRc({ ...rc, [k]: v });

  const [debts, setDebts] = useState<LinkableDebt[]>([]);
  useEffect(() => {
    let alive = true;
    void listLinkableDebtsAction().then((d) => alive && setDebts(d));
    return () => {
      alive = false;
    };
  }, []);
  const debtsSameCur = debts.filter((d) => d.currency === cur);
  const linkedDebt = debts.find((d) => d.id === props.debtId) ?? null;
  const debtServiceMonthly = linkedDebt ? linkedDebt.currentPayment : 0;

  const investedCash =
    (parseFloat(rc.purchasePrice) || 0) + (parseFloat(rc.closingCosts) || 0) || parseFloat(props.invested) || 0;

  const roi = computeRentalRoi({
    rentalIncome: parseFloat(props.income) || 0,
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

  const debtOpts: Opt[] = [
    { value: "", label: "Sin deuda ligada" },
    ...debtsSameCur.map((d) => ({ value: d.id, label: `${d.name} · ${formatMoney(d.currentPayment, d.currency)}/mes` })),
  ];

  return (
    <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
      <Segmented
        name="subtype"
        label="Tipo de renta"
        value={props.subtype}
        onChange={(v) => props.onSubtype(v as "alquiler" | "airbnb")}
        options={[
          { value: "alquiler", label: "Alquiler" },
          { value: "airbnb", label: "Airbnb" },
        ]}
      />
      <MoneyStr label="Precio de compra" value={rc.purchasePrice} onChange={set("purchasePrice")} cur={cur} />
      <MoneyStr label="Costos de cierre" value={rc.closingCosts} onChange={set("closingCosts")} cur={cur} />
      <PctStr label="Vacancia" value={rc.vacancyPct} onChange={set("vacancyPct")} />
      <PctStr label="Administración" value={rc.mgmtPct} onChange={set("mgmtPct")} />
      <MoneyStr label="Mantenimiento (mes)" value={rc.maintenance} onChange={set("maintenance")} cur={cur} />
      <MoneyStr label="Condominio / HOA (mes)" value={rc.hoa} onChange={set("hoa")} cur={cur} />
      <MoneyStr label="Imp. Bienes Inmuebles (año)" value={rc.propertyTax} onChange={set("propertyTax")} cur={cur} />
      <MoneyStr label="Seguro (año)" value={rc.insurance} onChange={set("insurance")} cur={cur} />
      <MoneyStr label="Servicios + limpieza (mes)" value={rc.services} onChange={set("services")} cur={cur} />
      <SheetSelect name="debtId" label="Deuda que la financia" value={props.debtId} onChange={props.onDebtId} options={debtOpts} sheetTitle="Deuda ligada" />
      {debts.length > 0 && debtsSameCur.length === 0 ? (
        <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>
          No tienes deudas en {cur}. Regístralas en Deudas para ligarlas.
        </div>
      ) : null}

      {hasData ? (
        <div className="card card-p" style={{ marginTop: 4 }}>
          <div className="between" style={{ fontSize: 12.5 }}>
            <span className="muted">Flujo neto (sin deuda)</span>
            <strong style={{ color: roi.netMonthly >= 0 ? "var(--accent)" : "var(--danger)" }}>
              {formatMoney(roi.netMonthly, cur)}/mes
            </strong>
          </div>
          {linkedDebt ? (
            <div className="between" style={{ fontSize: 12.5, marginTop: 6 }}>
              <span className="muted">Flujo neto con deuda</span>
              <strong style={{ color: roi.leveredNetMonthly >= 0 ? "var(--accent)" : "var(--danger)" }}>
                {formatMoney(roi.leveredNetMonthly, cur)}/mes
              </strong>
            </div>
          ) : null}
          <div className="between" style={{ fontSize: 12.5, marginTop: 6 }}>
            <span className="muted">ROI operativo anual</span>
            <strong>{(roi.operatingRoi * 100).toFixed(1)}%</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Input de dinero con string (para rc, que el engine espera como string). */
function MoneyStr({ label, value, onChange, cur }: { label: string; value: string; onChange: (v: string) => void; cur: string }) {
  return (
    <div className="m-qfield">
      <div className="m-qlabel">{label}</div>
      <div className="m-money">
        <span className="m-money-sym">{currencySymbol(cur)}</span>
        <input
          className="m-inp m-money-inp"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0"
        />
      </div>
    </div>
  );
}
function PctStr({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="m-qfield">
      <div className="m-qlabel">{label}</div>
      <div className="m-money">
        <input
          className="m-inp m-money-inp"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0"
        />
        <span className="m-money-sym">%</span>
      </div>
    </div>
  );
}

// ── Vender posición → sellHoldingAction (ingreso vinculado) ──────────────────
export function SellHoldingForm({
  holding,
  currency,
  onSuccess,
}: {
  holding: Holding;
  currency: string;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [quantitySold, setQuantitySold] = useState<number | undefined>(undefined);
  const [date, setDate] = useState(todayISO());
  const cur = holding.currency || currency;

  const action = (v: { amount: number | undefined; quantitySold: number | undefined; saleDate: string }): Promise<ActionResult> =>
    sellHoldingAction({
      holdingId: holding.id,
      saleDate: v.saleDate,
      amount: v.amount,
      currency: cur,
      quantitySold: v.quantitySold,
    });

  return (
    <FormShell
      action={action}
      values={{ amount, quantitySold, saleDate: date }}
      submitLabel="Registrar venta"
      successMessage="Venta registrada"
      onSuccess={onSuccess}
    >
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        Se registra un <strong>ingreso vinculado</strong> y se reduce la posición. Tienes{" "}
        {holding.quantity} unidad{holding.quantity === 1 ? "" : "es"}.
      </div>
      <MoneyField name="amount" label="Monto recibido" value={amount} onChange={setAmount} currency={cur} />
      <MoneyField name="quantitySold" label="Unidades vendidas (opcional)" value={quantitySold} onChange={setQuantitySold} currency={cur} placeholder="todas" />
      <DateField name="saleDate" label="Fecha de la venta" value={date} onChange={setDate} />
    </FormShell>
  );
}

// ── Dividendo → addDividendAction (transacción vinculada) ─────────────────────
export function DividendForm({
  holding,
  currency,
  onSuccess,
}: {
  holding: Holding;
  currency: string;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [date, setDate] = useState(todayISO());
  const [frequency, setFrequency] = useState("trimestral");
  const cur = holding.currency || currency;

  const action = (v: { amount: number | undefined; paymentDate: string; frequency: string }): Promise<ActionResult> =>
    addDividendAction({
      holdingId: holding.id,
      paymentDate: v.paymentDate,
      amount: v.amount,
      currency: cur,
      frequency: v.frequency,
      holdingLabel: holding.label ?? undefined,
      holdingSymbol: holding.symbol ?? undefined,
    });

  return (
    <FormShell
      action={action}
      values={{ amount, paymentDate: date, frequency }}
      submitLabel="Registrar dividendo"
      successMessage="Dividendo registrado"
      onSuccess={onSuccess}
    >
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        Se registra como <strong>ingreso/transacción vinculada</strong> a esta posición.
      </div>
      <MoneyField name="amount" label="Monto recibido" value={amount} onChange={setAmount} currency={cur} />
      <SheetSelect
        name="frequency"
        label="Frecuencia"
        value={frequency}
        onChange={setFrequency}
        options={[
          { value: "mensual", label: "Mensual" },
          { value: "trimestral", label: "Trimestral" },
          { value: "semestral", label: "Semestral" },
          { value: "anual", label: "Anual" },
        ]}
        sheetTitle="Frecuencia"
      />
      <DateField name="paymentDate" label="Fecha de pago" value={date} onChange={setDate} />
    </FormShell>
  );
}
