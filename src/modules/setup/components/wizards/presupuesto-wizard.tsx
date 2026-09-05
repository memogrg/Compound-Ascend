"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
// Client component: se importan los actions y el motor PURO directo, no los
// barrels de módulo (que arrastran `server-only` y rompen el build del cliente).
import {
  addCategoryAction,
  deleteIncomeSourceAction,
  editCategoryAction,
  forkCategoryAction,
  registerIncomeSourceAction,
  setEnvelopeBudgetAction,
} from "@/modules/financial-base/api/v2-actions";
import {
  budgetBalance,
  nextAfterBudget,
  suggestSobreBudget,
} from "@/modules/setup/engine/suggestions";
import { presupuestoSteps } from "@/modules/setup/engine/progress";
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
import type { SetupSnapshot, SetupSobre } from "@/modules/setup/types";

/**
 * Asistente de PRESUPUESTO: ingresos -> sobres -> montos -> resumen.
 *
 * Cada paso escribe con el MISMO action que la pantalla equivalente de la app:
 * `registerIncomeSourceAction` (el de /ingresos), `addCategoryAction` /
 * `forkCategoryAction` / `editCategoryAction` (los del tab de Gastos) y
 * `setEnvelopeBudgetAction` (el candado del presupuesto por sobre, con su
 * ventana de días 1-5 incluida). No hay alta propia en este archivo.
 */
export function PresupuestoWizard({
  snapshot,
  skin = "web",
  exitHref,
}: {
  snapshot: SetupSnapshot;
  skin?: SetupSkin;
  exitHref: string;
}) {
  const status = presupuestoSteps(snapshot);
  const balance = budgetBalance(
    snapshot.incomeMonthly,
    snapshot.budgetedMonthly,
    snapshot.currency,
  );
  const next = nextAfterBudget(snapshot, balance.free);

  const steps: SetupStepDef[] = [
    {
      id: "ingresos",
      label: "Ingresos",
      eyebrow: "Paso 1 · Lo que entra",
      title: "¿Cuánto entra este mes?",
      sub: "Todo lo que recibís, no solo el salario. Sin este número no hay reparto posible.",
      help: "El ingreso del mes es la base de todo el presupuesto: contra él se calcula cuánto puede llevarse cada sobre y cuánto te queda libre. Se guarda en la misma lista que ves en Ingresos.",
      celebration: "Ya sabemos con cuánto contás este mes.",
      done: status[0]!.done,
      render: () => <IngresosStep snapshot={snapshot} />,
    },
    {
      id: "sobres",
      label: "Sobres",
      eyebrow: "Paso 2 · Tus sobres",
      title: "¿En qué se te va la plata?",
      sub: 'Elegí los sobres que vas a usar. Podés crear los tuyos con "Otro".',
      help: "Un sobre es una categoría a la que le asignás dinero cada mes. Los que marques acá son los mismos que aparecen en el tab de Gastos: no hay dos listas.",
      celebration: "Tus sobres están listos. Ahora hay dónde poner cada colón.",
      done: status[1]!.done,
      render: () => <SobresStep snapshot={snapshot} />,
    },
    {
      id: "montos",
      label: "Montos",
      eyebrow: "Paso 3 · El reparto",
      title: "¿Cuánto va a cada sobre?",
      sub: "Con tus números al lado. Podés aceptar la sugerencia o poner el tuyo.",
      help: "Acá se fija el presupuesto del mes por sobre. Es el mismo dato que edita el tab de Gastos, con la misma ventana de configuración (días 1-5): fuera de ella se puede igual, solo queda registrado.",
      celebration: "Repartido. Cada colón tiene un destino.",
      done: status[2]!.done,
      render: () => <MontosStep snapshot={snapshot} />,
    },
    {
      id: "resumen",
      label: "Resumen",
      eyebrow: "Paso 4 · Tu mes",
      title: "Así queda tu mes",
      help: "El cierre: cuánto entra, cuánto repartiste y cuánto te queda libre. Si sobra, ese sobrante tiene un mejor destino que el gasto suelto.",
      done: status[3]!.done,
      render: () => <ResumenStep snapshot={snapshot} />,
    },
  ];

  const startIndex = Math.max(
    0,
    steps.findIndex((s) => !s.done),
  );

  return (
    <SetupWizard
      steps={steps}
      skin={skin}
      exitHref={exitHref}
      startIndex={startIndex < 0 ? 0 : startIndex}
      finishHref={exitHref}
      closing={
        next
          ? {
              title: next.title,
              text: next.text,
              ctaLabel: `Seguir con ${next.wizard === "defensa" ? "Defensa" : next.wizard === "control" ? "Control" : "Crecimiento"}`,
              ctaHref:
                skin === "mobile" ? `/m/configurar/${next.wizard}` : `/configurar/${next.wizard}`,
            }
          : null
      }
    />
  );
}

// ── Paso 1 · Ingresos ────────────────────────────────────────────────────────

const INCOME_TYPES = [
  { value: "activo", label: "Activo (trabajo)" },
  { value: "pasivo", label: "Pasivo (renta, dividendos)" },
  { value: "extraordinario", label: "Extraordinario (una vez)" },
];

function IngresosStep({ snapshot }: { snapshot: SetupSnapshot }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [incomeType, setIncomeType] = useState("activo");
  const [recurrent, setRecurrent] = useState(true);
  const currency = snapshot.currency;
  const today = new Date();
  const occurredOn = `${snapshot.period.year}-${String(snapshot.period.month).padStart(2, "0")}-${String(
    Math.min(today.getDate(), 28),
  ).padStart(2, "0")}`;

  return (
    <div className="setup-step">
      <ExistingList
        empty="Todavía no cargaste ningún ingreso de este mes."
        items={snapshot.incomes.map((i) => ({
          id: i.id,
          title: i.name,
          sub: `${INCOME_TYPES.find((t) => t.value === i.incomeType)?.label ?? i.incomeType}${i.recurrent ? " · recurrente" : ""}`,
          value: formatMoney(i.amount, i.currency),
          actions: <RowAction label="Quitar" danger onRun={() => deleteIncomeSourceAction(i.id)} />,
        }))}
      />

      {snapshot.incomes.length > 0 ? (
        <div className="setup-total">
          Total del mes <strong>{formatMoney(snapshot.incomeMonthly, currency)}</strong>
        </div>
      ) : null}

      <AddBlock
        label={snapshot.incomes.length > 0 ? "Agregar otro ingreso" : "Agregar mi ingreso"}
        openLabel="Nuevo ingreso"
        defaultOpen={snapshot.incomes.length === 0}
      >
        <Field label="¿De dónde viene?">
          <TextInput
            value={name}
            onChange={setName}
            placeholder="Salario, alquiler, freelance…"
            maxLength={120}
          />
        </Field>
        {/* El wizard fija frequency="mensual", así que acá no hay frecuencia que
            elegir — pero la etiqueta lo dice igual: un "¿Cuánto?" pelado es la
            misma ambigüedad que hacía que se cargaran quincenas como si fueran
            meses. */}
        <Field label="¿Cuánto por mes?">
          <MoneyInput value={amount} onChange={setAmount} currency={currency} />
        </Field>
        <Field label="Tipo">
          <SelectInput value={incomeType} onChange={setIncomeType} options={INCOME_TYPES} />
        </Field>
        <label className="setup-check">
          <input
            type="checkbox"
            checked={recurrent}
            onChange={(e) => setRecurrent(e.target.checked)}
          />
          Se repite todos los meses
        </label>
        <InlineForm
          submitLabel="Agregar ingreso"
          disabled={!name.trim() || !amount}
          onSubmit={() =>
            registerIncomeSourceAction({
              name: name.trim(),
              amount: amount ?? 0,
              currency,
              occurredOn,
              incomeType,
              recurrent,
              frequency: "mensual",
            })
          }
          onDone={() => {
            setName("");
            setAmount(null);
          }}
        />
      </AddBlock>
    </div>
  );
}

// ── Paso 2 · Sobres ──────────────────────────────────────────────────────────

function SobresStep({ snapshot }: { snapshot: SetupSnapshot }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const porFrasco = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sobres: SetupSobre[] }>();
    for (const s of snapshot.sobres) {
      const g = map.get(s.jarId) ?? { id: s.jarId, name: s.jarName, sobres: [] };
      g.sobres.push(s);
      map.set(s.jarId, g);
    }
    return [...map.values()];
  }, [snapshot.sobres]);

  /**
   * Activar/desactivar un sobre. La bifurcación es la MISMA que la de
   * `personalize-category` en Gastos: una hoja del catálogo base no se puede
   * editar (RLS), se personaliza con un fork del hogar; una hoja propia se
   * edita directo. No hay una tercera vía inventada acá.
   */
  const toggle = (s: SetupSobre) => {
    setBusy(s.id);
    start(async () => {
      const res = s.isSystem
        ? await forkCategoryAction({
            baseId: s.id,
            name: s.name,
            icon: s.icon,
            color: s.color,
            isFavorite: !s.isFavorite,
            isEssential: s.isEssential,
          })
        : await editCategoryAction(s.id, { isFavorite: !s.isFavorite });
      setBusy(null);
      if (res.ok) router.refresh();
    });
  };

  const activos = snapshot.sobres.filter((s) => s.isFavorite).length;

  return (
    <div className="setup-step">
      <div className="setup-total">
        {activos === 0
          ? "Ningún sobre activo todavía."
          : `${activos} ${activos === 1 ? "sobre activo" : "sobres activos"}`}
      </div>

      {porFrasco.map((jar) => (
        <div key={jar.id} className="setup-jar">
          <div className="setup-jar-head">{jar.name}</div>
          <div className="chip-grid">
            {jar.sobres.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn("chip-sel", s.isFavorite && "on")}
                aria-pressed={s.isFavorite}
                disabled={pending && busy === s.id}
                onClick={() => toggle(s)}
              >
                {s.name}
              </button>
            ))}
            <NuevoSobreChip jarId={jar.id} jarName={jar.name} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** "Otro": crea un sobre propio dentro del frasco, con el action de Gastos. */
function NuevoSobreChip({ jarId, jarName }: { jarId: string; jarName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    return (
      <button type="button" className="chip-sel chip-add" onClick={() => setOpen(true)}>
        <Icon name="plus" width={2.4} /> Otro
      </button>
    );
  }
  return (
    <div className="setup-inline-new">
      <TextInput
        value={name}
        onChange={setName}
        placeholder={`Nuevo sobre en ${jarName}`}
        maxLength={60}
      />
      <InlineForm
        submitLabel="Crear"
        disabled={!name.trim()}
        onSubmit={() =>
          addCategoryAction({
            name: name.trim(),
            parentId: jarId,
            categoryType: "expense",
            isFavorite: true,
          })
        }
        onDone={() => {
          setName("");
          setOpen(false);
        }}
        secondary={
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
            Cancelar
          </button>
        }
      />
    </div>
  );
}

// ── Paso 3 · Montos ──────────────────────────────────────────────────────────

function MontosStep({ snapshot }: { snapshot: SetupSnapshot }) {
  const activos = snapshot.sobres.filter((s) => s.isFavorite);
  if (activos.length === 0) {
    return (
      <div className="setup-empty">
        Volvé al paso anterior y elegí al menos un sobre: sin sobres no hay nada que repartir.
      </div>
    );
  }
  const porFrasco = new Map<string, number>();
  for (const s of activos) porFrasco.set(s.jarId, (porFrasco.get(s.jarId) ?? 0) + 1);

  return (
    <div className="setup-step">
      {activos.map((s) => (
        <SobreAmountRow
          key={s.id}
          sobre={s}
          snapshot={snapshot}
          hermanos={porFrasco.get(s.jarId) ?? 1}
        />
      ))}
      <div className="setup-total">
        Presupuestado <strong>{formatMoney(snapshot.budgetedMonthly, snapshot.currency)}</strong> de{" "}
        {formatMoney(snapshot.incomeMonthly, snapshot.currency)}
      </div>
    </div>
  );
}

function SobreAmountRow({
  sobre,
  snapshot,
  hermanos,
}: {
  sobre: SetupSobre;
  snapshot: SetupSnapshot;
  hermanos: number;
}) {
  const router = useRouter();
  const currency = sobre.budgetCurrency ?? snapshot.currency;
  const [value, setValue] = useState<number | null>(sobre.budget);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const suggestion = suggestSobreBudget(snapshot.incomeMonthly, sobre, hermanos, snapshot.currency);

  const save = (confirmedOutsideWindow = false) => {
    setError(null);
    start(async () => {
      const res = await setEnvelopeBudgetAction({
        categoryId: sobre.id,
        name: sobre.name,
        amount: value ?? 0,
        currency,
        periodMonth: snapshot.period.month,
        periodYear: snapshot.period.year,
        confirmedOutsideWindow,
      });
      if (res.ok) {
        setConfirmar(null);
        router.refresh();
      } else if (res.needsConfirmation) {
        // Fuera de la ventana NUNCA se bloquea: se pregunta y queda registrado.
        setConfirmar(res.message ?? "Estás fuera de la ventana de configuración.");
      } else {
        setError(res.message ?? "No pudimos guardar el monto.");
      }
    });
  };

  if (sobre.locked) {
    return (
      <div className="setup-amount-row locked">
        <div className="setup-amount-label">
          {sobre.name}
          <span className="setup-lock" title="Se edita en su módulo">
            <Icon name="lock" width={2} />
          </span>
        </div>
        <div className="setup-list-value">{formatMoney(sobre.budget ?? 0, currency)}</div>
      </div>
    );
  }

  return (
    <div className="setup-amount-row">
      <div className="setup-amount-label">
        {sobre.name}
        <span className="setup-amount-jar">{sobre.jarName}</span>
      </div>
      <div className="setup-amount-input">
        <MoneyInput value={value} onChange={setValue} currency={currency} placeholder="0" />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending || value === sobre.budget}
          onClick={() => save()}
        >
          {pending ? "…" : "Guardar"}
        </button>
      </div>
      <SuggestionNote suggestion={suggestion} currency={snapshot.currency} onApply={setValue} />
      {confirmar ? (
        <div className="setup-confirm" role="alert">
          <span>{confirmar}</span>
          <button type="button" className="btn btn-primary" onClick={() => save(true)}>
            Guardar igual
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="fld-err" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

// ── Paso 4 · Resumen ─────────────────────────────────────────────────────────

function ResumenStep({ snapshot }: { snapshot: SetupSnapshot }) {
  const b = budgetBalance(snapshot.incomeMonthly, snapshot.budgetedMonthly, snapshot.currency);
  return (
    <div className="setup-step">
      <div className="setup-summary">
        <div className="setup-summary-cell">
          <span>Entra</span>
          <strong>{formatMoney(b.income, snapshot.currency)}</strong>
        </div>
        <div className="setup-summary-cell">
          <span>Presupuestado</span>
          <strong>{formatMoney(b.budgeted, snapshot.currency)}</strong>
        </div>
        <div className={cn("setup-summary-cell", b.tone === "excedido" && "danger")}>
          <span>Libre</span>
          <strong>{formatMoney(b.free, snapshot.currency)}</strong>
        </div>
      </div>
      <p className="setup-summary-text">{b.text}</p>
    </div>
  );
}
