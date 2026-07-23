"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  registerIncomeSourceAction,
  updateIncomeSourceAction,
  deleteIncomeSourceAction,
  receivePartialIncomeAction,
  copyPreviousMonthIncomeAction,
} from "@/modules/financial-base/api/v2-actions";
import type { BudgetItem, IncomeType } from "@/modules/financial-base/types";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";
import { formatMoney } from "@/lib/format";

import {
  Fab,
  BottomSheet,
  SwipeRow,
  ConfirmDialog,
  FormShell,
  MoneyField,
  DateField,
  useToast,
} from "../../components/form-kit";
import type { MIconName } from "../../components/m-icon";
import {
  MContentCard,
  MDataRow,
  MProgress,
  MEmptyState,
  mAmount,
} from "../../components/content-kit";
import { IncomeSourceForm, type IncomeSourceValues } from "./income-form";

/**
 * CRUD de FUENTES de ingreso V2 en /m/ingresos — mismo modelo y acciones que la web
 * /ingresos (income-sources.tsx): las fuentes son líneas budget_items (income), y lo
 * "recibido" es un movimiento real (transactions) vía receivePartialIncomeAction. Así lo
 * capturado en móvil SÍ se sincroniza con la web (misma tabla). Todo con el Form Kit:
 *  - FAB → alta (registerIncomeSourceAction); SwipeRow → Editar (updateIncomeSourceAction) /
 *    Eliminar (deleteIncomeSourceAction).
 *  - "Recibido" por fuente → receivePartialIncomeAction {budgetItemId, amount, date}; monto
 *    sugerido = restante (planificado − recibido), como la web.
 *  - Barra "% Recibido vs Planificado" por fuente (recibido nativo vs presupuesto).
 */

const TYPE_LABEL: Record<IncomeType, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  extraordinario: "Extraordinario",
};

/**
 * Glifo por tipo de ingreso: el activo viene de tu trabajo (nómina), el pasivo llega solo
 * (moneda). Los vinculados a inversiones no pasan por aquí: los pinta la página.
 */
const TYPE_ICON: Record<IncomeType, MIconName> = {
  activo: "salary",
  pasivo: "income",
  extraordinario: "income",
};

// Fracción sugerida por clic en fuentes recurrentes sub-mensuales (igual que la web).
const RECURRENT_FRACTION: Record<string, number> = { semanal: 0.25, quincenal: 0.5 };

const round2 = (n: number) => Math.round(n * 100) / 100;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monto sugerido al pulsar "Recibido": fracción recurrente o restante del mes. */
function suggestedAmount(it: BudgetItem, received: number): number {
  const frac = it.recurringItemId ? RECURRENT_FRACTION[it.frequency] : undefined;
  if (frac) return round2(it.amount * frac);
  const remaining = round2(it.amount - received);
  return remaining > 0 ? remaining : it.amount;
}

/** BudgetItem (fuente) → valores del form de edición (mismo shape que la web). */
function toValues(it: BudgetItem): IncomeSourceValues {
  return {
    name: it.name,
    amount: it.amount,
    currency: it.currency,
    occurredOn: `${it.periodYear}-${String(it.periodMonth).padStart(2, "0")}-01`,
    incomeType: it.incomeType ?? "activo",
    recurrent: Boolean(it.recurringItemId),
    frequency: it.frequency,
    categoryId: it.categoryId,
  };
}

export function IncomeManager({
  sources,
  received,
  incomeTree,
  periodMonth,
  periodYear,
}: {
  sources: BudgetItem[];
  /** Recibido por fuente en su moneda NATIVA (real.incomeReceivedBySourceNative). */
  received: Record<string, number>;
  incomeTree: CategoryNode[];
  /** Período actual (para copiar las fuentes del mes anterior). */
  periodMonth: number;
  periodYear: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [deleting, setDeleting] = useState<BudgetItem | null>(null);
  const [delPending, setDelPending] = useState(false);
  const [receiving, setReceiving] = useState<BudgetItem | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyPending, startCopy] = useTransition();

  const confirmCopy = () => {
    startCopy(async () => {
      const res = await copyPreviousMonthIncomeAction({ periodMonth, periodYear });
      setCopyOpen(false);
      if (res.ok) {
        const n = res.copied ?? 0;
        toast.show(
          n > 0
            ? `Copiadas ${n} ${n === 1 ? "fuente" : "fuentes"} del mes anterior`
            : "No había fuentes recurrentes que copiar del mes anterior",
          n > 0 ? "success" : "info",
        );
        router.refresh();
      } else {
        toast.show(res.message ?? "No pudimos copiar las fuentes", "error");
      }
    });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelPending(true);
    const res = await deleteIncomeSourceAction(deleting.id);
    setDelPending(false);
    if (res.ok) {
      toast.show("Fuente eliminada", "success");
      setDeleting(null);
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo eliminar.", "error");
    }
  };

  return (
    <>
      {sources.length === 0 ? (
        <MEmptyState
          icon="salary"
          title="Agrega tu primera fuente"
          description="Anota de dónde viene tu dinero este mes —tu sueldo, un cliente, una renta— y la app te dirá cuánto llevas cobrado."
          actionLabel="Agregar fuente"
          onAction={() => setAdding(true)}
        />
      ) : (
        // padding 0: la fila va a sangre para que el gesto revele Editar/Eliminar; el aire
        // lateral lo pone la regla puente .m-swipe-content .m-drow.
        <MContentCard style={{ padding: 0, overflow: "hidden" }}>
          {sources.map((it) => {
            const rec = received[it.id] ?? 0;
            const budget = it.amount;
            const pct = budget > 0 ? rec / budget : rec > 0 ? 1 : 0;
            const over = budget > 0 && rec > budget;
            const incomeType = it.incomeType ?? "activo";
            return (
              <SwipeRow key={it.id} onEdit={() => setEditing(it)} onDelete={() => setDeleting(it)}>
                {/* El tipo y el botón NO van en `trailing`: eso estrecha toda la columna de
                    texto —incluido el subtítulo, que no necesita esquivar el botón— y a 320px
                    dejaba 36px útiles (el subtítulo se cortaba 130px). Medido: con el tipo como
                    prefijo del subtítulo y el botón junto a la barra, sobran 41px. El estado
                    "de más" lo cantan el tile ámbar y la barra, sin necesidad de chip. */}
                <MDataRow
                  icon={TYPE_ICON[incomeType]}
                  iconTone={over ? "warning" : rec > 0 ? "success" : "neutral"}
                  title={it.name}
                  subtitle={
                    budget > 0
                      ? `${over ? "De más" : TYPE_LABEL[incomeType]} · ${mAmount(rec, it.currency)} de ${mAmount(budget, it.currency)}`
                      : `${TYPE_LABEL[incomeType]} · ${mAmount(rec, it.currency)} recibido`
                  }
                  slot={
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {budget > 0 ? (
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <MProgress value={pct} tone={over ? "warning" : "success"} height={8} />
                        </span>
                      ) : (
                        <span style={{ flex: 1 }} />
                      )}
                      {/* Con la fuente ya cobrada al 100%, "Recibido" invitaba a registrar
                          otra vez lo mismo y duplicar el ingreso. Se sustituye por el estado:
                          si hace falta corregir algo, Editar sigue estando en el swipe. */}
                      {budget > 0 && pct >= 1 ? (
                        <span
                          className="pos"
                          style={{ flex: "none", fontSize: 12.5, fontWeight: 600, padding: "0 6px" }}
                        >
                          Cobrado
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="m-btn m-btn-secondary"
                          style={{ flex: "none", minHeight: 38, padding: "0 14px", fontSize: 13 }}
                          onClick={() => setReceiving(it)}
                        >
                          Recibido
                        </button>
                      )}
                    </span>
                  }
                />
              </SwipeRow>
            );
          })}
        </MContentCard>
      )}

      {/* Atajo: traer las fuentes recurrentes del mes anterior (idempotente). */}
      <button
        type="button"
        className="m-btn m-btn-block m-btn-secondary"
        style={{ marginTop: 16 }}
        disabled={copyPending}
        onClick={() => setCopyOpen(true)}
      >
        {copyPending ? "Copiando…" : "Copiar fuentes del mes anterior"}
      </button>

      <Fab onClick={() => setAdding(true)} label="Nueva fuente de ingreso" />

      {/* Alta */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Registrar ingreso">
        <IncomeSourceForm
          incomeTree={incomeTree}
          action={registerIncomeSourceAction}
          submitLabel="Guardar ingreso"
          successMessage="Ingreso registrado"
          onSuccess={() => setAdding(false)}
          allowPassiveStub
        />
      </BottomSheet>

      {/* Edición */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title="Editar fuente">
        {editing ? (
          <IncomeSourceForm
            incomeTree={incomeTree}
            initial={toValues(editing)}
            action={(v: IncomeSourceValues) => updateIncomeSourceAction(editing.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Fuente actualizada"
            onSuccess={() => setEditing(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Recibido → movimiento real (transactions) vinculado a la fuente */}
      <BottomSheet open={!!receiving} onClose={() => setReceiving(null)} title="Registrar lo recibido">
        {receiving ? (
          <ReceiveForm
            source={receiving}
            received={received[receiving.id] ?? 0}
            onSuccess={() => setReceiving(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Copiar mes anterior (crea filas → confirmación breve) */}
      <ConfirmDialog
        open={copyOpen}
        title="Copiar fuentes del mes anterior"
        message="Traeremos tus fuentes recurrentes del mes pasado a este mes. No se duplican las que ya tengas."
        confirmLabel="Copiar"
        variant="warning"
        pending={copyPending}
        onConfirm={confirmCopy}
        onCancel={() => setCopyOpen(false)}
      />

      {/* Eliminación */}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar fuente"
        message={
          deleting ? `Se eliminará "${deleting.name}". Los movimientos ya recibidos no se borran.` : undefined
        }
        confirmLabel="Eliminar"
        variant="danger"
        pending={delPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/** "¿Cuánto recibiste?" → receivePartialIncomeAction (movimiento real, moneda nativa). */
function ReceiveForm({
  source,
  received,
  onSuccess,
}: {
  source: BudgetItem;
  received: number;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState<number | undefined>(suggestedAmount(source, received));
  const [date, setDate] = useState(todayISO());
  const remaining = round2(source.amount - received);
  const values = { budgetItemId: source.id, amount, date };
  return (
    <FormShell
      action={receivePartialIncomeAction}
      values={values}
      submitLabel="Registrar recibido"
      successMessage="Recibido registrado"
      onSuccess={onSuccess}
    >
      <MoneyField
        name="amount"
        label="¿Cuánto recibiste?"
        value={amount}
        onChange={setAmount}
        currency={source.currency}
      />
      <DateField name="date" label="Fecha" value={date} onChange={setDate} />
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: -2 }}>
        {remaining > 0
          ? `Restante del mes: ${formatMoney(remaining, source.currency)} de ${formatMoney(source.amount, source.currency)}.`
          : `Ya recibiste lo planificado (${formatMoney(source.amount, source.currency)}); puedes registrar un extra.`}
      </div>
    </FormShell>
  );
}
