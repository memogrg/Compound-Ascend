"use client";

/**
 * Área "Ingreso" (tab Ingresos · Fase 1). Fusiona la antigua IncomeProgressCard
 * (barras buffer) con IncomeRows (acciones por fila) en un solo bloque centrado
 * en la FUENTE de ingreso (línea budget_items income). Cada fila:
 *   · Nombre + barra buffer (% y recibido / planificado).
 *   · Tag de categoría: Activo / Pasivo / Extraordinario (income_type).
 *   · Botón "Recibido" (binario en Fase 1; multi-clic parcial en Fase 2).
 *   · Editar / Eliminar a la par de la barra; Duplicar en el kebab.
 * El % de la barra = ingresos confirmados de esa fuente ÷ planificado.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney, formatPercent } from "@/lib/format";
import { RegisterIncomeModal } from "@/modules/financial-base/components/v2/register-income-modal";
import {
  addTransactionAction,
  deleteIncomeSourceAction,
  registerIncomeSourceAction,
} from "@/modules/financial-base/api/v2-actions";
import type { BudgetItem, IncomeType } from "@/modules/financial-base/types";
import type { KeyedTotals } from "@/modules/financial-base/services/budget-service";

const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  extraordinario: "Extraordinario",
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function IncomeSources({
  items,
  confirmedByKey,
  currency,
}: {
  items: BudgetItem[];
  confirmedByKey: KeyedTotals;
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean }>, msg: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast(msg);
        router.refresh();
      } else toast("No se pudo completar", "error");
    });

  // "Recibido" (binario · Fase 1): registra el monto planificado como un ingreso
  // confirmado para esa fuente, llenando la barra. La Fase 2 lo vuelve parcial.
  const markReceived = (it: BudgetItem) =>
    run(
      () =>
        addTransactionAction({
          kind: "ingreso",
          amount: it.amount,
          currency: it.currency,
          occurredOn: todayISO(),
          merchantOrSource: it.name,
          status: "confirmed",
          origin: "manual",
        }),
      "Ingreso recibido",
    );

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
        }),
      "Fuente duplicada",
    );

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Ingreso</div>
          <div className="card-sub">
            Recibido vs planificado · la barra se llena al confirmar “Recibido”
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
              confirmed={confirmedByKey[it.name.trim().toLowerCase()]?.value ?? 0}
              currency={currency}
              onReceive={() => markReceived(it)}
              onEdit={() => setEditing(it)}
              onDuplicate={() => duplicate(it)}
              onDelete={() => run(() => deleteIncomeSourceAction(it.id), "Fuente eliminada")}
            />
          ))}
        </div>
      )}

      {editing ? (
        <RegisterIncomeModal currency={currency} item={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function SourceRow({
  it,
  confirmed,
  currency,
  onReceive,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  it: BudgetItem;
  confirmed: number;
  currency: string;
  onReceive: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const budget = it.amount;
  const pct = budget > 0 ? Math.min(1, confirmed / budget) : confirmed > 0 ? 1 : 0;
  const received = budget > 0 && confirmed >= budget;
  const incomeType = it.incomeType ?? "activo";

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
          <span className="inc-tag" style={{ marginTop: 4, display: "inline-block" }}>
            {INCOME_TYPE_LABEL[incomeType]}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className={received ? "confirm-pill done" : "confirm-pill"}
            onClick={received ? undefined : onReceive}
            disabled={received}
            title={received ? "Ingreso recibido" : "Marcar como recibido"}
          >
            <Icon name="check" width={received ? 3 : 2.4} />
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
      <div
        className="row"
        style={{ justifyContent: "space-between", gap: 10, marginBottom: 6 }}
        aria-hidden
      >
        <span />
        <span className="tnum muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
          {budget > 0
            ? `${formatPercent(pct)} · ${formatMoney(confirmed, currency)} / ${formatMoney(budget, currency)}`
            : `${formatMoney(confirmed, currency)} recibido`}
        </span>
      </div>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{ width: `${Math.round(pct * 100)}%`, background: "var(--pos)" }}
        />
      </div>
    </div>
  );
}
