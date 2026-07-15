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
import { formatMoney, formatPercent } from "@/lib/format";

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
  currency,
  incomeTree,
  periodMonth,
  periodYear,
}: {
  sources: BudgetItem[];
  /** Recibido por fuente en su moneda NATIVA (real.incomeReceivedBySourceNative). */
  received: Record<string, number>;
  currency: string;
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
        <div className="card card-p">
          <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            Aún no tienes fuentes de ingreso este mes. Toca el botón + para registrar la primera.
          </div>
        </div>
      ) : (
        <div className="card">
          {sources.map((it) => {
            const rec = received[it.id] ?? 0;
            const budget = it.amount;
            const pct = budget > 0 ? rec / budget : rec > 0 ? 1 : 0;
            const over = budget > 0 && rec > budget;
            const pctInt = Math.min(100, Math.round(pct * 100));
            const incomeType = it.incomeType ?? "activo";
            return (
              <SwipeRow key={it.id} onEdit={() => setEditing(it)} onDelete={() => setDeleting(it)}>
                <div style={{ padding: "14px 18px" }}>
                  <div className="between" style={{ marginBottom: 8, gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.name}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {TYPE_LABEL[incomeType]}
                        {it.recurringItemId ? ` · ${it.frequency}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="m-btn m-btn-secondary"
                      style={{ flex: "none", minHeight: 38, padding: "0 14px", fontSize: 13 }}
                      onClick={() => setReceiving(it)}
                    >
                      Recibido
                    </button>
                  </div>
                  <div className="between" style={{ marginBottom: 6 }}>
                    <span className="muted mono" style={{ fontSize: 12 }}>
                      {budget > 0
                        ? `${formatPercent(pct)} · ${formatMoney(rec, it.currency)} / ${formatMoney(budget, it.currency)}`
                        : `${formatMoney(rec, it.currency)} recibido`}
                      {over ? " · sobre-recibido" : ""}
                    </span>
                  </div>
                  <div className="bar" style={{ height: 8 }}>
                    <i style={{ width: `${pctInt}%`, background: over ? "var(--warning)" : "var(--accent)" }} />
                  </div>
                </div>
              </SwipeRow>
            );
          })}
        </div>
      )}

      {/* Atajo: traer las fuentes recurrentes del mes anterior (idempotente). */}
      <button
        type="button"
        className="m-btn m-btn-block m-btn-secondary"
        style={{ marginTop: 12 }}
        disabled={copyPending}
        onClick={() => setCopyOpen(true)}
      >
        {copyPending ? "Copiando…" : "Copiar fuentes del mes anterior"}
      </button>

      <Fab onClick={() => setAdding(true)} label="Nueva fuente de ingreso" />

      {/* Alta */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Registrar ingreso">
        <IncomeSourceForm
          currency={currency}
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
            currency={currency}
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
