"use client";

/**
 * Área "Ingreso" (tab Ingresos). Cada fila = una FUENTE (línea budget_items
 * income) con:
 *   · Nombre + barra buffer (% y recibido / planificado).
 *   · Tag de categoría: Activo / Pasivo / Extraordinario (income_type).
 *   · Botón "Recibido" multi-clic (Fase 2): abre un mini-input "¿Cuánto
 *     recibiste?" y acumula; permite ≥100% y sobre-recepción.
 *   · Editar / Eliminar a la par de la barra; Duplicar en el kebab.
 * El recibido por fuente llega ya agregado (real.incomeReceivedBySource), sumado
 * de las transacciones de ingreso confirmadas con income_source_id = la fuente.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { CURRENCY_SYMBOL, formatMoney, formatPercent } from "@/lib/format";
import { RegisterIncomeModal } from "@/modules/financial-base/components/v2/register-income-modal";
import {
  receivePartialIncomeAction,
  deleteIncomeSourceAction,
  registerIncomeSourceAction,
} from "@/modules/financial-base/api/v2-actions";
import type { BudgetItem, IncomeType } from "@/modules/financial-base/types";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";

const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  extraordinario: "Extraordinario",
};

// Fracción sugerida por clic en fuentes recurrentes sub-mensuales (ej. salario
// bisemanal → la mitad). En el resto, se sugiere el restante.
const RECURRENT_FRACTION: Record<string, number> = {
  semanal: 0.25,
  bisemanal: 0.5,
  quincenal: 0.5,
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function suggestedAmount(it: BudgetItem, received: number): number {
  const frac = it.recurringItemId ? RECURRENT_FRACTION[it.frequency] : undefined;
  if (frac) return Math.round(it.amount * frac * 100) / 100;
  const remaining = Math.round((it.amount - received) * 100) / 100;
  return remaining > 0 ? remaining : it.amount;
}

export function IncomeSources({
  items,
  received,
  incomeTree,
}: {
  items: BudgetItem[];
  received: Record<string, number>;
  incomeTree: CategoryNode[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, msg: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast(msg);
        router.refresh();
      } else toast(res.message ?? "No se pudo completar", "error");
    });

  const duplicate = (it: BudgetItem) =>
    run(
      () =>
        registerIncomeSourceAction({
          name: `${it.name} (copia)`,
          amount: it.amount,
          currency: it.currency,
          occurredOn: todayISO(),
          incomeType: it.incomeType ?? "activo",
          recurrent: Boolean(it.recurringItemId),
          frequency: it.frequency,
          categoryId: it.categoryId ?? null,
        }),
      "Fuente duplicada",
    );

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Ingreso</div>
          <div className="card-sub">
            Recibido vs planificado · pulsa “Recibido” cada vez que llegue una parte
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="muted" style={{ padding: "20px 24px", fontSize: 13 }}>
          Aún no tienes fuentes de ingreso este mes. Usa “Registrar ingreso” para añadir una.
        </div>
      ) : (
        <div style={{ padding: "4px 0 10px" }}>
          {items.map((it) => (
            <SourceRow
              key={it.id}
              it={it}
              received={received[it.id] ?? 0}
              onReceive={(amount) =>
                run(
                  () => receivePartialIncomeAction({ budgetItemId: it.id, amount, date: todayISO() }),
                  "Recibido registrado",
                )
              }
              onEdit={() => setEditing(it)}
              onDuplicate={() => duplicate(it)}
              onDelete={() => run(() => deleteIncomeSourceAction(it.id), "Fuente eliminada")}
            />
          ))}
        </div>
      )}

      {editing ? (
        <RegisterIncomeModal
          incomeTree={incomeTree}
          item={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function SourceRow({
  it,
  received,
  onReceive,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  it: BudgetItem;
  /** Recibido en la moneda NATIVA de la fuente (it.currency), sin convertir. */
  received: number;
  onReceive: (amount: number) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [value, setValue] = useState("");

  const budget = it.amount;
  const pct = budget > 0 ? received / budget : received > 0 ? 1 : 0;
  const fullyReceived = budget > 0 && received >= budget;
  const over = budget > 0 && received > budget;
  const incomeType = it.incomeType ?? "activo";

  const openReceive = () => {
    setValue(String(suggestedAmount(it, received)));
    setReceiving(true);
  };

  const submitReceive = () => {
    const amt = Number(value);
    if (!Number.isFinite(amt) || amt <= 0) return;
    onReceive(amt);
    setReceiving(false);
    setValue("");
  };

  return (
    <div style={{ padding: "12px 24px" }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {it.name}
          </div>
          <span
            className={`inc-tag ${incomeType}`}
            style={{ marginTop: 4, display: "inline-block" }}
          >
            {INCOME_TYPE_LABEL[incomeType]}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className={fullyReceived ? "confirm-pill done" : "confirm-pill"}
            onClick={openReceive}
            title="Registrar lo recibido"
          >
            <Icon name="check" width={fullyReceived ? 3 : 2.4} />
            Recibido
          </button>
          <button
            className="icon-btn"
            style={{ width: 30, height: 30 }}
            aria-label="Editar"
            onClick={onEdit}
          >
            <Icon name="edit" />
          </button>
          <button
            className="icon-btn"
            style={{ width: 30, height: 30 }}
            aria-label="Eliminar"
            onClick={onDelete}
          >
            <Icon name="x" width={2} />
          </button>
          <div style={{ position: "relative" }}>
            <button
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              aria-label="Más acciones"
              onClick={() => setOpen((o) => !o)}
            >
              <Icon name="dots" />
            </button>
            {open ? (
              <div className="txn-menu" onMouseLeave={() => setOpen(false)}>
                <button
                  onClick={() => {
                    setOpen(false);
                    onDuplicate();
                  }}
                >
                  Duplicar
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {receiving ? (
        <div className="row" style={{ gap: 8, margin: "4px 0 10px", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
            ¿Cuánto recibiste?
          </span>
          <div className="inp-money" style={{ maxWidth: 160 }}>
            <span className="pre">{CURRENCY_SYMBOL[it.currency] ?? ""}</span>
            <input
              autoFocus
              inputMode="decimal"
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitReceive();
                }
              }}
            />
          </div>
          <button type="button" className="btn btn-secondary" style={{ padding: "7px 12px" }} onClick={submitReceive}>
            Agregar
          </button>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 30, height: 30 }}
            aria-label="Cancelar"
            onClick={() => setReceiving(false)}
          >
            <Icon name="x" width={2} />
          </button>
        </div>
      ) : null}

      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 6 }}>
        <span className="tnum muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
          {budget > 0
            ? `${formatPercent(pct)} · ${formatMoney(received, it.currency)} / ${formatMoney(budget, it.currency)}`
            : `${formatMoney(received, it.currency)} recibido`}
          {over ? " · sobre-recibido" : ""}
        </span>
      </div>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{
            width: `${Math.min(100, Math.round(pct * 100))}%`,
            background: over ? "var(--warn)" : "var(--pos)",
          }}
        />
      </div>
    </div>
  );
}
