"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addRuleAction,
  editRuleAction,
  removeRuleAction,
  type ActionResult,
} from "@/modules/financial-base/api/v2-actions";
import {
  categoryMatchesKind,
  type SelectableCategory,
} from "@/modules/financial-base/engine/classify";
import type { TransactionRule } from "@/modules/financial-base/services/rules-service";

import {
  BottomSheet,
  ConfirmDialog,
  Segmented,
  SheetSelect,
  TextField,
  useToast,
} from "../../components/form-kit";

/**
 * Reglas de auto-categorización en /m/transacciones — paridad con el panel de la web
 * (rules-panel.tsx): "si el comercio contiene X → este sobre/fuente".
 *
 * Consume EXACTAMENTE las Server Actions de la web (add/edit/removeRuleAction); cero backend
 * nuevo. Tras cada acción: toast en español + router.refresh() (la página es force-dynamic).
 *
 * El formulario móvil solo expone patrón, tipo y sobre destino (la web además tiene cuenta y
 * prioridad). Como updateRule REESCRIBE todas las columnas y ruleInputSchema tiene defaults
 * (active: true, priority: 0), al editar se reenvían los valores actuales de los campos que
 * aquí no se muestran — si no, editar desde el móvil borraría la cuenta sugerida, la prioridad
 * y el auto-vínculo de la regla, y reactivaría una regla desactivada.
 */
const TYPE_OPTS = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
];

type RuleType = "income" | "expense";

/** El tipo de la regla en el vocabulario de categoryMatchesKind. */
function kindOf(type: RuleType): "gasto" | "ingreso" {
  return type === "income" ? "ingreso" : "gasto";
}

export function RulesManager({
  rules,
  categories,
}: {
  rules: TransactionRule[];
  categories: SelectableCategory[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TransactionRule | null>(null);

  // Formulario (compartido por alta y edición).
  const [pattern, setPattern] = useState("");
  const [type, setType] = useState<RuleType>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const formOpen = creating || editing !== null;
  const options = categories
    .filter((c) => categoryMatchesKind(c.categoryType, kindOf(type)))
    .map((c) => ({ value: c.id, label: c.name }));
  const catName = (id: string | null) =>
    (id ? categories.find((c) => c.id === id)?.name : undefined) ?? "Sin sobre";

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setError(null);
  };

  const startCreate = () => {
    setPattern("");
    setType("expense");
    setCategoryId("");
    setError(null);
    setEditing(null);
    setCreating(true);
  };

  const startEdit = (r: TransactionRule) => {
    setPattern(r.merchantPattern);
    setType(r.type);
    setCategoryId(r.suggestedCategoryId ?? "");
    setError(null);
    setCreating(false);
    setEditing(r);
  };

  /** Al cambiar el tipo, un sobre del tipo anterior deja de ser válido. */
  const changeType = (next: RuleType) => {
    setType(next);
    const stillValid = categories.some(
      (c) => c.id === categoryId && categoryMatchesKind(c.categoryType, kindOf(next)),
    );
    if (!stillValid) setCategoryId("");
  };

  const run = (fn: () => Promise<ActionResult>, okMsg: string, after: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.show(okMsg, "success");
        after();
        router.refresh();
      } else {
        toast.show(res.message ?? "No pudimos guardar la regla", "error");
      }
    });
  };

  const save = () => {
    const merchantPattern = pattern.trim();
    if (!merchantPattern) {
      setError("Escribe un texto a detectar");
      return;
    }
    if (!categoryId) {
      setError("Elige el sobre al que se asignará");
      return;
    }
    setError(null);

    if (editing) {
      const r = editing;
      run(
        () =>
          editRuleAction(r.id, {
            merchantPattern,
            type,
            suggestedCategoryId: categoryId,
            // Se conservan los campos que este formulario no muestra (la web sí los edita).
            suggestedAccountId: r.suggestedAccountId,
            active: r.active,
            priority: r.priority,
            linkedKind: r.linkedKind,
            linkedId: r.linkedId,
          }),
        "Regla actualizada",
        closeForm,
      );
      return;
    }

    run(
      () =>
        addRuleAction({
          merchantPattern,
          type,
          suggestedCategoryId: categoryId,
          suggestedAccountId: null,
          active: true,
          priority: 0,
        }),
      "Regla creada",
      closeForm,
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const r = deleting;
    run(() => removeRuleAction(r.id), "Regla eliminada", () => setDeleting(null));
  };

  return (
    <>
      <div className="card card-p" style={{ marginBottom: 14 }}>
        <div className="between">
          <div style={{ minWidth: 0 }}>
            <div className="sec-title">Reglas</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
              Cuando el comercio contenga este texto, se sugerirá este sobre automáticamente.
            </div>
          </div>
          <button
            type="button"
            className="m-btn m-btn-secondary"
            style={{ flexShrink: 0, marginLeft: 12 }}
            onClick={() => setOpen(true)}
          >
            {rules.length > 0 ? `Ver (${rules.length})` : "Crear"}
          </button>
        </div>
      </div>

      {/* Gestor: lista de reglas */}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Reglas de categorización">
        <div style={{ display: "grid", gap: 10 }}>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            Cuando el comercio contenga este texto, se sugerirá este sobre automáticamente al
            registrar un movimiento.
          </div>

          {rules.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
              Aún no tienes reglas. Crea la primera y dejarás de clasificar a mano los comercios
              que se repiten.
            </div>
          ) : (
            rules.map((r) => (
              <div key={r.id} className="card card-p" style={{ padding: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>«{r.merchantPattern}»</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {r.type === "income" ? "Ingreso" : "Gasto"} →{" "}
                    {catName(r.suggestedCategoryId)}
                    {r.active ? "" : " · desactivada"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button
                    type="button"
                    className="m-btn m-btn-secondary"
                    disabled={pending}
                    onClick={() => startEdit(r)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="m-btn m-btn-quiet-danger"
                    disabled={pending}
                    onClick={() => setDeleting(r)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))
          )}

          <button
            type="button"
            className="m-btn m-btn-block m-btn-primary"
            disabled={pending}
            onClick={startCreate}
          >
            Nueva regla
          </button>
        </div>
      </BottomSheet>

      {/* Alta / edición */}
      <BottomSheet
        open={formOpen}
        onClose={closeForm}
        title={editing ? "Editar regla" : "Nueva regla"}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <TextField
            name="merchantPattern"
            label="Si el comercio contiene…"
            value={pattern}
            onChange={setPattern}
            placeholder="Uber, Automercado, Netflix…"
            maxLength={120}
          />
          <Segmented
            name="type"
            label="Aplica a"
            value={type}
            onChange={(v) => changeType(v as RuleType)}
            options={TYPE_OPTS}
          />
          <SheetSelect
            name="suggestedCategoryId"
            label={type === "income" ? "Fuente" : "Sobre"}
            value={categoryId || undefined}
            options={options}
            placeholder={options.length === 0 ? "No hay sobres disponibles" : "Elige uno…"}
            sheetTitle={type === "income" ? "Elige la fuente" : "Elige el sobre"}
            onChange={setCategoryId}
          />

          {error ? (
            <div className="neg" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              {error}
            </div>
          ) : null}

          <button
            type="button"
            className="m-btn m-btn-block m-btn-primary"
            disabled={pending}
            onClick={save}
          >
            {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear regla"}
          </button>
          <button
            type="button"
            className="m-btn m-btn-block m-btn-secondary"
            disabled={pending}
            onClick={closeForm}
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>

      {/* Eliminar */}
      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar regla"
        message={
          deleting
            ? `Dejaremos de sugerir «${deleting.merchantPattern}» automáticamente. Los movimientos ya clasificados no cambian.`
            : undefined
        }
        confirmLabel="Eliminar"
        variant="danger"
        pending={pending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
