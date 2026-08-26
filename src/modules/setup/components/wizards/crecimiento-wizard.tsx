"use client";

import { useState } from "react";

import { formatMoney } from "@/lib/format";
import {
  addHoldingAction,
  removeHoldingAction,
  setDesiredLifestyleAction,
  setHoldingDcaAction,
} from "@/modules/wealth/api/actions";
// Motor puro: el número de Libertad es UNA fórmula en todo el producto
// (capital que, a la tasa de retiro, sostiene ese gasto). No se recalcula acá.
import { TASA_RETIRO, numeroPatrimonial } from "@/modules/wealth/engine/patrimonio-engine";
import { crecimientoSteps } from "@/modules/setup/engine/progress";
import { budgetBalance, suggestDca, suggestLifestyle } from "@/modules/setup/engine/suggestions";
import {
  SetupWizard,
  type SetupSkin,
  type SetupStepDef,
} from "@/modules/setup/components/setup-wizard";
import {
  AddBlock,
  ExistingList,
  Field,
  InlineForm,
  MoneyInput,
  RowAction,
  SelectInput,
  SuggestionNote,
  TextInput,
} from "@/modules/setup/components/setup-fields";
import type { SetupSnapshot } from "@/modules/setup/types";

/**
 * Asistente de CRECIMIENTO: inversiones -> aporte DCA -> número de Libertad.
 *
 * Escribe con `addHoldingAction` (el alta de Patrimonio), `setHoldingDcaAction`
 * (el mismo que ejecuta el consejo "apartá X/mes para esta inversión") y
 * `setDesiredLifestyleAction` (el estilo de vida deseado que alimenta el número
 * de Libertad en Mi Rich Life).
 */
export function CrecimientoWizard({
  snapshot,
  skin = "web",
  exitHref,
}: {
  snapshot: SetupSnapshot;
  skin?: SetupSkin;
  exitHref: string;
}) {
  const status = crecimientoSteps(snapshot);

  const steps: SetupStepDef[] = [
    {
      id: "inversiones",
      label: "Inversiones",
      eyebrow: "Paso 1 · Lo que ya tenés",
      title: "¿En qué estás invertido hoy?",
      sub: "Cargá lo que ya tenés. Si todavía no invertís, pasá al siguiente paso.",
      help: "Cada posición guarda cantidad y costo promedio; con eso el portafolio se valora a precio de mercado y tu patrimonio deja de ser una estimación. Es la misma lista de Patrimonio.",
      celebration: "Tu portafolio ya está en el mapa.",
      done: status[0]!.done,
      optional: status[0]!.optional,
      render: () => <InversionesStep snapshot={snapshot} />,
    },
    {
      id: "dca",
      label: "Aporte",
      eyebrow: "Paso 2 · Lo que sumás cada mes",
      title: "¿Cuánto aportás al mes?",
      sub: "El aporte constante es lo que hace el trabajo pesado, no el momento de entrada.",
      help: "El aporte mensual (DCA) se registra solo cada mes al precio del día, y aparece como brecha pendiente hasta que confirmás el precio. Podés apagarlo poniendo 0.",
      celebration: "Con eso, tu patrimonio crece sin que tengas que decidirlo cada mes.",
      done: status[1]!.done,
      optional: status[1]!.optional,
      render: () => <DcaStep snapshot={snapshot} />,
    },
    {
      id: "libertad",
      label: "Libertad",
      eyebrow: "Paso 3 · Hacia dónde",
      title: "¿Cuánto querés gastar al mes cuando no tengas que trabajar?",
      sub: "De ese número sale tu número de Libertad: el capital que lo sostiene para siempre.",
      help: "El número de Libertad es el capital que, a la tasa de retiro del producto, genera ese gasto sin consumirse. Definir el gasto deseado es lo único que falta para calcularlo.",
      celebration: "Ya tenés tu número. Todo lo demás es acercarse.",
      done: status[2]!.done,
      render: () => <LibertadStep snapshot={snapshot} />,
    },
  ];

  const startIndex = steps.findIndex((s) => !s.done);

  return (
    <SetupWizard
      steps={steps}
      skin={skin}
      exitHref={exitHref}
      startIndex={startIndex < 0 ? 0 : startIndex}
      finishHref={exitHref}
    />
  );
}

// ── Paso 1 · Inversiones ─────────────────────────────────────────────────────

const ASSET_TYPES = [
  { value: "etf", label: "ETF" },
  { value: "accion", label: "Acción" },
  { value: "cripto", label: "Cripto" },
  { value: "fondo", label: "Fondo" },
  { value: "bono", label: "Bono" },
  { value: "certificado", label: "Certificado / CDP" },
  { value: "inmueble", label: "Inmueble" },
  { value: "pension", label: "Pensión" },
  { value: "otro", label: "Otro" },
];

/** Tipos cotizables: sin símbolo no hay precio de mercado que buscar. */
const QUOTED = ["etf", "accion", "cripto"];

function InversionesStep({ snapshot }: { snapshot: SetupSnapshot }) {
  const [assetType, setAssetType] = useState("etf");
  const [symbol, setSymbol] = useState("");
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState<number | null>(null);
  const [averageCost, setAverageCost] = useState<number | null>(null);
  const currency = snapshot.currency;
  const cotizable = QUOTED.includes(assetType);

  return (
    <div className="setup-step">
      <ExistingList
        empty="Todavía no cargaste ninguna inversión."
        items={snapshot.holdings.map((h) => ({
          id: h.id,
          title: h.label,
          sub: `${ASSET_TYPES.find((t) => t.value === h.assetType)?.label ?? h.assetType} · ${h.quantity} × ${formatMoney(h.averageCost, h.currency)}`,
          value: formatMoney(h.quantity * h.averageCost, h.currency),
          actions: <RowAction label="Quitar" danger onRun={() => removeHoldingAction(h.id)} />,
        }))}
      />

      <AddBlock
        label={snapshot.holdings.length > 0 ? "Agregar otra posición" : "Agregar una posición"}
        openLabel="Nueva posición"
        defaultOpen={snapshot.holdings.length === 0}
      >
        <Field label="Tipo de activo">
          <SelectInput value={assetType} onChange={setAssetType} options={ASSET_TYPES} />
        </Field>
        {cotizable ? (
          <Field
            label="Símbolo"
            hint="Con el símbolo buscamos el precio de mercado todos los días."
          >
            <TextInput
              value={symbol}
              onChange={setSymbol}
              placeholder="VOO, BTC, AAPL…"
              maxLength={12}
            />
          </Field>
        ) : null}
        <Field label="Nombre">
          <TextInput
            value={label}
            onChange={setLabel}
            placeholder={cotizable ? "S&P 500" : "Apartamento en Escazú"}
            maxLength={120}
          />
        </Field>
        <Field label="Cantidad">
          <input
            className="inp"
            type="number"
            min={0}
            step="any"
            value={quantity === null ? "" : String(quantity)}
            onChange={(e) => setQuantity(e.target.value === "" ? null : Number(e.target.value))}
            placeholder="0"
          />
        </Field>
        <Field label="Costo promedio por unidad">
          <MoneyInput value={averageCost} onChange={setAverageCost} currency={currency} />
        </Field>
        <InlineForm
          submitLabel="Agregar posición"
          disabled={!quantity || quantity <= 0}
          onSubmit={() =>
            addHoldingAction({
              symbol: cotizable ? symbol.trim() || undefined : undefined,
              assetType,
              quantity: quantity ?? 0,
              averageCost: averageCost ?? 0,
              currency,
              label: label.trim() || undefined,
            })
          }
          onDone={() => {
            setSymbol("");
            setLabel("");
            setQuantity(null);
            setAverageCost(null);
          }}
        />
      </AddBlock>
    </div>
  );
}

// ── Paso 2 · Aporte DCA ──────────────────────────────────────────────────────

function DcaStep({ snapshot }: { snapshot: SetupSnapshot }) {
  const currency = snapshot.currency;
  const libre = budgetBalance(snapshot.incomeMonthly, snapshot.budgetedMonthly, currency).free;
  const suggestion = suggestDca(snapshot, libre, currency);

  if (snapshot.holdings.length === 0) {
    return (
      <div className="setup-empty">
        Primero cargá una posición en el paso anterior: el aporte mensual se fija sobre una
        inversión concreta.
      </div>
    );
  }

  return (
    <div className="setup-step">
      <SuggestionNote suggestion={suggestion} currency={currency} />
      {snapshot.holdings.map((h) => (
        <DcaRow key={h.id} holding={h} suggested={suggestion.amount} />
      ))}
    </div>
  );
}

function DcaRow({
  holding,
  suggested,
}: {
  holding: SetupSnapshot["holdings"][number];
  suggested: number | null;
}) {
  const [monthly, setMonthly] = useState<number | null>(holding.monthlyContribution || null);
  return (
    <div className="setup-amount-row">
      <div className="setup-amount-label">
        {holding.label}
        <span className="setup-amount-jar">
          {holding.isRecurring ? "recurrente" : "sin recurrencia"}
        </span>
      </div>
      <div className="setup-amount-input">
        <MoneyInput
          value={monthly}
          onChange={setMonthly}
          currency={holding.currency}
          placeholder="0"
        />
        {suggested !== null ? (
          <button
            type="button"
            className="setup-suggestion-cta"
            onClick={() => setMonthly(suggested)}
          >
            Usar {formatMoney(suggested, holding.currency)}
          </button>
        ) : null}
      </div>
      <InlineForm
        submitLabel="Guardar aporte"
        disabled={monthly === (holding.monthlyContribution || null)}
        onSubmit={() => setHoldingDcaAction(holding.id, monthly ?? 0)}
      />
    </div>
  );
}

// ── Paso 3 · Número de Libertad ──────────────────────────────────────────────

function LibertadStep({ snapshot }: { snapshot: SetupSnapshot }) {
  const currency = snapshot.desiredLifestyle?.currency ?? snapshot.currency;
  const [amount, setAmount] = useState<number | null>(snapshot.desiredLifestyle?.amount ?? null);
  const suggestion = suggestLifestyle(
    snapshot.budgetedMonthly,
    snapshot.essentialMonthly,
    snapshot.currency,
  );
  const numero = amount && amount > 0 ? numeroPatrimonial(amount) : null;

  return (
    <div className="setup-step">
      <SuggestionNote suggestion={suggestion} currency={snapshot.currency} onApply={setAmount} />

      <Field label="Gasto mensual deseado">
        <MoneyInput value={amount} onChange={setAmount} currency={currency} />
      </Field>

      {numero !== null ? (
        <div className="setup-summary">
          <div className="setup-summary-cell">
            <span>Tu número de Libertad</span>
            <strong>{formatMoney(numero, currency)}</strong>
          </div>
          <div className="setup-summary-cell">
            <span>A una tasa de retiro de</span>
            <strong>{Math.round(TASA_RETIRO * 100)}%</strong>
          </div>
        </div>
      ) : null}

      <InlineForm
        submitLabel="Guardar mi número"
        disabled={!amount || amount <= 0}
        onSubmit={() => setDesiredLifestyleAction(amount, currency)}
      />
    </div>
  );
}
