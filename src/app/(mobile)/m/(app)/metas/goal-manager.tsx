"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  addGoalAction,
  editGoalAction,
  removeGoalAction,
  addGoalContributionAction,
  withdrawGoalAction,
  spendFromGoalAction,
  listExpenseCategoriesAction,
  getGoalDetailAction,
  revertGoalMovementAction,
  type ExpenseCategoryGroup,
} from "@/modules/control/api/actions";
import type { SavingsGoal } from "@/modules/control";
import type {
  GoalDetailVM,
  GoalMovementType,
} from "@/modules/control/services/goal-detail-service";
import { formatMoney } from "@/lib/format";

import {
  Fab,
  BottomSheet,
  SwipeRow,
  ConfirmDialog,
  FormShell,
  MoneyField,
  DateField,
  TextField,
  SheetSelect,
  useToast,
} from "../../components/form-kit";
import {
  MContentCard,
  MDataRow,
  MProgress,
  MEmptyState,
  mAmount,
  type MTone,
} from "../../components/content-kit";
import { groupByJar, type CategoryNode } from "@/modules/financial-base";
import { GoalForm, type GoalValues } from "./goal-form";

/**
 * Gestión completa de metas de ahorro en /m/metas (molde de Income/ExpenseManager +
 * flujos de transacciones vinculadas). Todo con el Form Kit y las Server Actions de
 * control (add/edit/removeGoalAction, addGoalContributionAction, withdrawGoalAction):
 *  - FAB → alta; SwipeRow → Editar / Eliminar (ConfirmDialog + aviso de dependencias si
 *    la meta tiene aportes).
 *  - "+ Aporte" → crea transacción vinculada (linked_kind='goal'); "Retirar" → crea
 *    ingreso vinculado (el backend valida que no exceda el saldo y devuelve el error).
 */

/** Estado de la meta (priority-engine) → tono del kit. */
const STATUS_TONE: Record<string, MTone> = {
  saludable: "success",
  atrasado: "warning",
  no_viable: "danger",
  revisar: "neutral",
};

/**
 * Fecha objetivo en corto ("dic 2026"). El formato largo de es-MX devuelve "diciembre de
 * 2026" —17 caracteres— y el subtítulo de la fila no tiene sitio para eso.
 */
function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "sin fecha";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-MX", { month: "short", year: "numeric" });
}

/**
 * Subtítulo de una meta. El % NO va aquí: la barra justo debajo ya lo dice. Y una meta
 * cumplida no dice "faltan ₡0" — dice que está cumplida.
 */
function goalSubtitle(args: {
  isSobre: boolean;
  missing: number;
  currency: string;
  targetDate?: string | null;
}): string {
  const { isSobre, missing, currency, targetDate } = args;
  if (isSobre) return `Sobre · se acumula sin tope`;
  const fecha = fmtMonth(targetDate);
  if (missing <= 0) return `¡Completada! · ${fecha}`;
  return `Faltan ${mAmount(missing, currency)} · ${fecha}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GoalManager({
  goals,
  currency,
  tree,
}: {
  goals: SavingsGoal[];
  currency: string;
  /** Árbol de categorías para agrupar las metas por frasco (mismo groupByJar que la web). */
  tree: CategoryNode[];
}) {
  const router = useRouter();
  const toast = useToast();
  // Metas agrupadas por frasco (default_category_id → frasco padre), "Generales" primero.
  const goalSections = groupByJar(goals, (g) => g.defaultCategoryId, tree);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [deleting, setDeleting] = useState<SavingsGoal | null>(null);
  const [contributing, setContributing] = useState<SavingsGoal | null>(null);
  const [withdrawing, setWithdrawing] = useState<SavingsGoal | null>(null);
  const [spending, setSpending] = useState<SavingsGoal | null>(null);
  const [viewing, setViewing] = useState<SavingsGoal | null>(null);
  const [delPending, setDelPending] = useState(false);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelPending(true);
    const res = await removeGoalAction(deleting.id);
    setDelPending(false);
    if (res.ok) {
      toast.show("Meta eliminada", "success");
      setDeleting(null);
      router.refresh();
    } else {
      toast.show("No se pudo eliminar.", "error");
    }
  };

  return (
    <>
      {goals.length === 0 ? (
        <MEmptyState
          icon="goal"
          title="Crea tu primera meta"
          description="Ponle nombre y monto a eso que quieres —un fondo de emergencia, un viaje— y la app te dirá cuánto llevas y cuánto te falta."
          actionLabel="Crear meta"
          onAction={() => setAdding(true)}
        />
      ) : (
        // Agrupado por frasco (mismo groupByJar que la web); "Generales" primero, orden del
        // tree, sin secciones vacías. padding 0: la fila va a sangre para el swipe
        // (regla puente .m-swipe-content .m-drow). Encabezado de frasco discreto (.ov).
        goalSections.map((section) => (
          <div key={section.key} style={{ marginBottom: 12 }}>
            <div className="ov" style={{ marginBottom: 6 }}>
              {section.name}
            </div>
            <MContentCard style={{ padding: 0, overflow: "hidden" }}>
              {section.items.map((g) => {
            const isSobre = g.kind === "sobre" || g.targetAmount <= 0;
            const pct = g.targetAmount > 0 ? Math.min(1, g.currentAmount / g.targetAmount) : 0;
            const tone = STATUS_TONE[g.status] ?? "neutral";
            const missing = Math.max(0, g.targetAmount - g.currentAmount);
            return (
              <SwipeRow key={g.id} onEdit={() => setEditing(g)} onDelete={() => setDeleting(g)}>
                {/* Los cuatro botones NO caben en `trailing`: estrecharía toda la columna de
                    texto —el subtítulo incluido— como pasó en Ingresos. Van bajo la barra,
                    en el slot, que además es donde ya vivían. El estado lo cantan el tile
                    y la barra, sin chip. */}
                <MDataRow
                  icon="goal"
                  iconTone={tone}
                  title={g.name}
                  subtitle={`${goalSubtitle({
                    isSobre,
                    missing,
                    currency: g.currency,
                    targetDate: g.targetDate,
                  })}${g.storedIn ? ` · ${g.storedIn}` : ""}`}
                  value={mAmount(g.currentAmount, g.currency, 10)}
                  valueTone={tone === "danger" ? "danger" : "neutral"}
                  slot={
                    <>
                      {isSobre ? null : <MProgress value={pct} tone={tone} height={8} />}
                      <div style={{ display: "flex", gap: 8, marginTop: isSobre ? 0 : 10 }}>
                        <button
                          type="button"
                          className="m-btn m-btn-secondary"
                          // padding lateral 8 y no los 20 de .m-btn: con flex:1 el ancho ya
                          // lo reparte la fila, y esos 40px de sobra partían "+ Aporte" en
                          // dos líneas (necesita 51px y le quedaban 50).
                          style={{ flex: 1, minHeight: 42, fontSize: 13.5, padding: "0 8px" }}
                          onClick={() => setContributing(g)}
                        >
                          + Aporte
                        </button>
                        <button
                          type="button"
                          className="m-btn m-btn-secondary"
                          // padding lateral 8 y no los 20 de .m-btn: con flex:1 el ancho ya
                          // lo reparte la fila, y esos 40px de sobra partían "+ Aporte" en
                          // dos líneas (necesita 51px y le quedaban 50).
                          style={{ flex: 1, minHeight: 42, fontSize: 13.5, padding: "0 8px" }}
                          onClick={() => setWithdrawing(g)}
                        >
                          Retirar
                        </button>
                        {/* Meta cumplida ⇒ la acción que toca es USAR el dinero, no seguir
                            aportando: con "+ Aporte" del mismo peso, un "¡Completada!"
                            seguía empujando a ahorrar para algo que ya está pagado. Se
                            cambia el énfasis, no las opciones: retirar y aportar siguen ahí. */}
                        <button
                          type="button"
                          className={`m-btn ${missing <= 0 ? "m-btn-primary" : "m-btn-secondary"}`}
                          // padding lateral 8 y no los 20 de .m-btn: con flex:1 el ancho ya
                          // lo reparte la fila, y esos 40px de sobra partían "+ Aporte" en
                          // dos líneas (necesita 51px y le quedaban 50).
                          style={{ flex: 1, minHeight: 42, fontSize: 13.5, padding: "0 8px" }}
                          onClick={() => setSpending(g)}
                        >
                          Gastar
                        </button>
                      </div>
                      <button
                        type="button"
                        className="m-btn m-btn-ghost"
                        style={{ width: "100%", minHeight: 38, fontSize: 12.5, marginTop: 8 }}
                        onClick={() => setViewing(g)}
                      >
                        Ver movimientos
                      </button>
                    </>
                  }
                />
              </SwipeRow>
            );
              })}
            </MContentCard>
          </div>
        ))
      )}

      <Fab onClick={() => setAdding(true)} label="Nueva meta" />

      {/* Alta */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Nueva meta">
        <GoalForm
          currency={currency}
          action={addGoalAction}
          submitLabel="Crear meta"
          successMessage="Meta creada"
          onSuccess={() => setAdding(false)}
        />
      </BottomSheet>

      {/* Edición */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title="Editar meta">
        {editing ? (
          <GoalForm
            currency={currency}
            initial={{
              name: editing.name,
              targetAmount: editing.targetAmount,
              currentAmount: editing.currentAmount,
              monthlyContribution: editing.monthlyContribution,
              currency: editing.currency,
              targetDate: editing.targetDate ?? undefined,
              priority: editing.priority ?? "media",
              kind: editing.kind ?? "meta",
              recurrence: editing.recurrence ?? "ninguna",
              defaultCategoryId: editing.defaultCategoryId ?? null,
              storedIn: editing.storedIn ?? null,
            }}
            action={(v: GoalValues) => editGoalAction(editing.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Meta actualizada"
            onSuccess={() => setEditing(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Aporte → transacción vinculada (linked_kind='goal') */}
      <BottomSheet open={!!contributing} onClose={() => setContributing(null)} title="Registrar aporte">
        {contributing ? (
          <ContributionForm goal={contributing} onSuccess={() => setContributing(null)} />
        ) : null}
      </BottomSheet>

      {/* Retiro → ingreso vinculado (el backend valida saldo) */}
      <BottomSheet open={!!withdrawing} onClose={() => setWithdrawing(null)} title="Retirar de la meta">
        {withdrawing ? (
          <WithdrawalForm goal={withdrawing} onSuccess={() => setWithdrawing(null)} />
        ) : null}
      </BottomSheet>

      {/* Gastar del frasco → gasto categorizado off-budget (baja acumulado y meta) */}
      <BottomSheet open={!!spending} onClose={() => setSpending(null)} title="Gastar del frasco">
        {spending ? (
          <SpendForm goal={spending} onSuccess={() => setSpending(null)} />
        ) : null}
      </BottomSheet>

      {/* Movimientos del frasco (Delta C): aportes, gastos y retiros con saldo */}
      <BottomSheet open={!!viewing} onClose={() => setViewing(null)} title="Movimientos del frasco">
        {viewing ? <MovementsList goal={viewing} /> : null}
      </BottomSheet>

      {/* Eliminación (con aviso de dependencias si tiene aportes) */}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar meta"
        message={deleting ? `Se eliminará "${deleting.name}".` : undefined}
        confirmLabel="Eliminar"
        variant="danger"
        dependencies={
          deleting && deleting.currentAmount > 0
            ? [`Tiene ${formatMoney(deleting.currentAmount, deleting.currency)} en aportes acumulados; se perderá ese historial.`]
            : undefined
        }
        pending={delPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/** Aporte: monto + fecha → addGoalContributionAction (crea la transacción vinculada). */
function ContributionForm({ goal, onSuccess }: { goal: SavingsGoal; onSuccess: () => void }) {
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [date, setDate] = useState(todayISO());
  const values = { goalId: goal.id, amount, contributionDate: date };
  return (
    <FormShell
      action={addGoalContributionAction}
      values={values}
      submitLabel="Registrar aporte"
      successMessage="Aporte registrado"
      onSuccess={onSuccess}
    >
      <MoneyField name="amount" label="Monto del aporte" value={amount} onChange={setAmount} currency={goal.currency} />
      <DateField name="contributionDate" label="Fecha" value={date} onChange={setDate} />
    </FormShell>
  );
}

/** Retiro: monto + fecha + nota → withdrawGoalAction (el backend valida que no exceda el saldo). */
function WithdrawalForm({ goal, onSuccess }: { goal: SavingsGoal; onSuccess: () => void }) {
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const values = { goalId: goal.id, amount, withdrawalDate: date, note: note || undefined };
  return (
    <FormShell
      action={withdrawGoalAction}
      values={values}
      submitLabel="Retirar"
      successMessage="Retiro registrado"
      onSuccess={onSuccess}
    >
      <MoneyField name="amount" label="Monto a retirar" value={amount} onChange={setAmount} currency={goal.currency} />
      <DateField name="withdrawalDate" label="Fecha" value={date} onChange={setDate} />
      <TextField name="note" label="Nota (opcional)" value={note} onChange={setNote} placeholder="Motivo del retiro…" maxLength={280} />
    </FormShell>
  );
}

/**
 * Gastar del frasco: monto + fecha + categoría + nota → spendFromGoalAction.
 * Crea un gasto categorizado OFF-BUDGET (no toca el presupuesto del mes) y baja
 * el acumulado Y la meta. Distinto de "Retirar" (que devuelve la plata a la
 * cuenta como ingreso). Las categorías de gasto se cargan al abrir el sheet.
 */
function SpendForm({ goal, onSuccess }: { goal: SavingsGoal; onSuccess: () => void }) {
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState<string>("");
  const [note, setNote] = useState("");
  const [catOptions, setCatOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    let alive = true;
    void listExpenseCategoriesAction().then((groups: ExpenseCategoryGroup[]) => {
      if (!alive) return;
      // SheetSelect es plano: aplanamos "Grupo · Hoja" para conservar el grupo.
      const flat = groups.flatMap((g) =>
        g.options.map((o) => ({ value: o.id, label: `${g.groupName} · ${o.name}` })),
      );
      setCatOptions([{ value: "", label: "Sin categoría" }, ...flat]);
    });
    return () => {
      alive = false;
    };
  }, []);

  const values = {
    goalId: goal.id,
    amount,
    spendDate: date,
    categoryId: categoryId || null,
    note: note || undefined,
  };
  return (
    <FormShell
      action={spendFromGoalAction}
      values={values}
      submitLabel="Registrar gasto"
      successMessage="Gasto del frasco registrado"
      onSuccess={onSuccess}
    >
      <MoneyField name="amount" label="Monto a gastar" value={amount} onChange={setAmount} currency={goal.currency} />
      <DateField name="spendDate" label="Fecha" value={date} onChange={setDate} />
      <SheetSelect
        name="categoryId"
        label="Categoría"
        value={categoryId}
        onChange={setCategoryId}
        options={catOptions}
        placeholder="Sin categoría"
        sheetTitle="Elige la categoría del gasto"
      />
      <TextField name="note" label="Nota (opcional)" value={note} onChange={setNote} placeholder="¿En qué lo usaste?" maxLength={280} />
    </FormShell>
  );
}

const MOVE_LABEL: Record<GoalMovementType, string> = {
  inicial: "Saldo inicial",
  aporte: "Aporte",
  gasto: "Gasto",
  retiro: "Retiro",
  reinicio: "Reinicio de período",
};

function fmtMoveDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CR", { day: "2-digit", month: "short" });
}

/**
 * Lista de movimientos del frasco (Delta C · móvil): resumen acumulado/meta/
 * brecha + filas de aportes (+), gastos (−) y retiros (−) con saldo corrido.
 * Carga el detalle al montar (el sheet solo monta este componente al abrir).
 */
function MovementsList({ goal }: { goal: SavingsGoal }) {
  const router = useRouter();
  const toast = useToast();
  const [vm, setVm] = useState<GoalDetailVM | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getGoalDetailAction(goal.id).then((detail) => {
      if (!alive) return;
      setVm(detail);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [goal.id]);

  const revert = async (transactionId: string) => {
    setPendingId(transactionId);
    const res = await revertGoalMovementAction(transactionId);
    setPendingId(null);
    setConfirmingId(null);
    if (res.ok) {
      toast.show("Movimiento revertido", "success");
      const detail = await getGoalDetailAction(goal.id);
      setVm(detail);
      router.refresh();
    } else {
      toast.show(res.message ?? "No pudimos revertir el movimiento.", "error");
    }
  };

  if (!loaded) {
    return (
      <div className="muted" style={{ fontSize: 13, padding: "8px 2px" }}>
        Cargando movimientos…
      </div>
    );
  }
  if (!vm) {
    return (
      <div className="muted" style={{ fontSize: 13, padding: "8px 2px" }}>
        No pudimos cargar el detalle del frasco.
      </div>
    );
  }

  return (
    <div>
      <div className="between" style={{ marginBottom: 12 }}>
        <div>
          <div className="muted" style={{ fontSize: 11 }}>
            Acumulado
          </div>
          <div className="display" style={{ fontSize: 18 }}>
            {formatMoney(vm.currentAmount, vm.currency)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted" style={{ fontSize: 11 }}>
            {vm.kind === "sobre" ? "Tipo" : "Meta · Brecha"}
          </div>
          <div className="mono" style={{ fontSize: 13 }}>
            {vm.kind === "sobre"
              ? "Sobre (acumulador)"
              : `${formatMoney(vm.targetAmount, vm.currency)} · ${formatMoney(vm.gap, vm.currency)}`}
          </div>
        </div>
      </div>
      {vm.defaultCategoryLabel ? (
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Categoría por defecto: <strong>{vm.defaultCategoryLabel}</strong>
        </div>
      ) : null}
      {vm.movements.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: "8px 2px" }}>
          Este frasco aún no tiene movimientos.
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {vm.movements.map((m, i) => (
            <div
              key={m.id}
              style={{
                padding: "11px 14px",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
              }}
            >
              <div className="between" style={{ gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 13.5 }}>
                    {MOVE_LABEL[m.type]}
                    {m.offBudget ? (
                      <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>
                        {" "}
                        · sin presupuesto
                      </span>
                    ) : null}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {fmtMoveDate(m.date)}
                    {m.type === "reinicio" && m.restoredTarget != null
                      ? ` · Meta → ${formatMoney(m.restoredTarget, vm.currency)}`
                      : ""}
                    {m.categoryLabel ? ` · ${m.categoryLabel}` : ""}
                    {m.note ? ` · ${m.note}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  <div
                    className="mono"
                    style={{
                      fontSize: 13.5,
                      color:
                        m.type === "reinicio"
                          ? "var(--muted)"
                          : m.amount >= 0
                            ? "var(--pos)"
                            : "var(--neg)",
                    }}
                  >
                    {m.type === "reinicio"
                      ? "—"
                      : `${m.amount >= 0 ? "+" : "−"}${formatMoney(Math.abs(m.amount), vm.currency)}`}
                  </div>
                  <div className="muted mono" style={{ fontSize: 11 }}>
                    {formatMoney(m.balance, vm.currency)}
                  </div>
                </div>
              </div>
              {m.type !== "inicial" && !m.locked ? (
                <div style={{ marginTop: 8 }}>
                  {confirmingId === m.id ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="m-btn m-btn-secondary"
                        style={{ flex: 1, minHeight: 36, fontSize: 12.5, color: "var(--neg)" }}
                        disabled={pendingId === m.id}
                        onClick={() => void revert(m.id)}
                      >
                        {pendingId === m.id ? "Revirtiendo…" : "Confirmar reversión"}
                      </button>
                      <button
                        type="button"
                        className="m-btn m-btn-ghost"
                        style={{ flex: "none", minHeight: 36, fontSize: 12.5, paddingInline: 14 }}
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="m-btn m-btn-ghost"
                      style={{ minHeight: 34, fontSize: 12, paddingInline: 12 }}
                      onClick={() => setConfirmingId(m.id)}
                    >
                      Revertir
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
