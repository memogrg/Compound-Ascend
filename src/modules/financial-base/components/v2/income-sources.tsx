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
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useCaptureToday } from "@/components/tz/timezone-context";
import { CURRENCY_SYMBOL, formatMoney, formatPercent } from "@/lib/format";
import { RegisterIncomeModal } from "@/modules/financial-base/components/v2/register-income-modal";
import {
  receivePartialIncomeAction,
  deleteIncomeSourceAction,
  registerIncomeSourceAction,
  removeOutOfPhaseIncomeLineAction,
} from "@/modules/financial-base/api/v2-actions";
import type { BudgetItem, IncomeType } from "@/modules/financial-base/types";
// Motores puros: import directo del archivo, nunca del barrel (server-only).
import { suggestedReceipt } from "@/modules/financial-base/engine/income-receipt";
import { monthlyPlanned, type Frequency } from "@/modules/financial-base/engine/monthlyize";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";

const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  extraordinario: "Extraordinario",
};

// La sugerencia de "Recibido" vive en el motor puro (income-receipt): acá había
// una copia local con una fracción propia — y una clave "bisemanal" que ni
// siquiera existe en el enum Frequency. Una sola definición, la del motor.

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
  const today = useCaptureToday();
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [fueraDeFase, setFueraDeFase] = useState<BudgetItem | null>(null);
  const [, startTransition] = useTransition();

  /**
   * BARRA AL INSTANTE. `received` viene del servidor, así que hasta esta pasada
   * la barra no se movía hasta que volviera el round-trip completo (action →
   * revalidatePath → refetch del RSC) — y en la práctica parecía que hacía falta
   * refrescar a mano. `useOptimistic` pinta el nuevo total apenas se confirma y
   * lo descarta solo cuando llega el dato del servidor: si la escritura falla,
   * la barra vuelve sola a la verdad, sin lógica de rollback nuestra.
   */
  const [recibido, sumarRecibido] = useOptimistic(
    received,
    (estado: Record<string, number>, nuevo: { id: string; amount: number }) => ({
      ...estado,
      [nuevo.id]: (estado[nuevo.id] ?? 0) + nuevo.amount,
    }),
  );

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
          occurredOn: today(),
          incomeType: it.incomeType ?? "activo",
          recurrent: Boolean(it.recurringItemId),
          frequency: it.frequency,
          nextDate: it.nextDate ?? null,
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
              received={recibido[it.id] ?? 0}
              onReceive={(amount) =>
                // El optimista va DENTRO de la misma transición que la escritura:
                // fuera de ella React lo descartaría en el acto.
                startTransition(async () => {
                  sumarRecibido({ id: it.id, amount });
                  const res = await receivePartialIncomeAction({
                    budgetItemId: it.id,
                    amount,
                    date: today(),
                  });
                  if (res.ok) {
                    toast("Recibido registrado");
                    router.refresh();
                  } else toast(res.message ?? "No se pudo completar", "error");
                })
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
          onFueraDeFase={setFueraDeFase}
        />
      ) : null}

      {/* La línea de este mes dejó de caer en fase al cambiar frecuencia/ancla.
          Se pregunta: borrarla en silencio escondería un "recibido" ya anotado. */}
      {fueraDeFase ? (
        <Modal
          title="Esta fuente ya no cae en este mes"
          sub={`Con la nueva frecuencia, “${fueraDeFase.name}” no tiene pago este mes. Podés quitar la línea del mes; la fuente se mantiene y vuelve cuando le toque.`}
          onClose={() => setFueraDeFase(null)}
        >
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setFueraDeFase(null)}>
              Dejarla
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const id = fueraDeFase.id;
                setFueraDeFase(null);
                run(() => removeOutOfPhaseIncomeLineAction(id), "Línea del mes quitada");
              }}
            >
              Quitar del mes
            </button>
          </div>
        </Modal>
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

  // Lo PLANIFICADO del mes, no el monto por pago: una quincena de 800k se
  // compara contra los 1.6M que se esperan en el mes (dos pagos), si no la
  // barra marcaría 100 % con la primera quincena.
  const budget = monthlyPlanned(it.amount, it.frequency as Frequency);
  const pct = budget > 0 ? received / budget : received > 0 ? 1 : 0;
  const fullyReceived = budget > 0 && received >= budget;
  const over = budget > 0 && received > budget;
  const incomeType = it.incomeType ?? "activo";

  const openReceive = () => {
    setValue(String(suggestedReceipt(it, received)));
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
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "7px 12px" }}
            onClick={submitReceive}
          >
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
