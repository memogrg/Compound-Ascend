"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { formatMoney } from "@/lib/format";
import {
  addTemplateAction,
  editTemplateAction,
  removeTemplateAction,
  runTemplateAction,
  type ActionResult,
} from "@/modules/financial-base/api/v2-actions";
import {
  categoryMatchesKind,
  type SelectableCategory,
} from "@/modules/financial-base/engine/classify";
import type { TransactionTemplate } from "@/modules/financial-base/services/templates-service";
import type { Account } from "@/modules/financial-base/types";

import {
  BottomSheet,
  ConfirmDialog,
  DateField,
  MoneyField,
  Segmented,
  SheetSelect,
  TextField,
  Toggle,
  useToast,
} from "../../components/form-kit";

/**
 * Plantillas de movimientos recurrentes en /m/transacciones — registrar en un toque lo que se
 * repite (Netflix, salario, gasolina…). Consume EXACTAMENTE las Server Actions existentes
 * (add/edit/remove/runTemplateAction); cero backend nuevo. Toast en español + router.refresh().
 *
 * Dos límites que vienen del servidor y la UI respeta:
 *  · runTemplateAction RECHAZA kind='transferencia' ("Las transferencias no se registran por
 *    plantilla"), así que aquí solo se crean plantillas de ingreso/gasto. Si existe una de
 *    transferencia (creada por otra vía) se lista sin "Usar", apuntando a Cuentas → Transferir.
 *  · updateTemplate reescribe sort_order (`input.sortOrder ?? 0`), así que al editar se reenvía
 *    el sortOrder actual: si no, editar una plantilla la reordenaría en la lista.
 *
 * Si la plantilla no tiene monto fijo, se pide el monto (y la fecha) antes de correrla — el
 * parámetro `overrides` de runTemplateAction ya lo soporta.
 */
const KIND_OPTS = [
  { value: "gasto", label: "Gasto" },
  { value: "ingreso", label: "Ingreso" },
];

type FormKind = "ingreso" | "gasto";

/** Solo ingreso/gasto son ejecutables por plantilla (lo impone runTemplateAction). */
function isRunnable(t: TransactionTemplate): boolean {
  return t.kind === "ingreso" || t.kind === "gasto";
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TemplatesManager({
  templates,
  categories,
  accounts,
  currency,
}: {
  templates: TransactionTemplate[];
  categories: SelectableCategory[];
  accounts: Account[];
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Alta / edición.
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TransactionTemplate | null>(null);
  const [deleting, setDeleting] = useState<TransactionTemplate | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FormKind>("gasto");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [favorite, setFavorite] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Usar una plantilla sin monto fijo.
  const [running, setRunning] = useState<TransactionTemplate | null>(null);
  const [runAmount, setRunAmount] = useState<number | undefined>(undefined);
  const [runDate, setRunDate] = useState(todayISO());
  const [runError, setRunError] = useState<string | null>(null);

  const formOpen = creating || editing !== null;
  const catOpts = categories
    .filter((c) => categoryMatchesKind(c.categoryType, kind))
    .map((c) => ({ value: c.id, label: c.name }));
  const accOpts = [
    { value: "", label: "Sin cuenta" },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  const destinationOf = (t: TransactionTemplate): string => {
    const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId)?.name : undefined;
    const acc = t.accountId ? accounts.find((a) => a.id === t.accountId)?.name : undefined;
    return [cat, acc].filter(Boolean).join(" · ") || "Sin sobre ni cuenta";
  };

  const run = (fn: () => Promise<ActionResult>, okMsg: string, errMsg: string, after: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.show(okMsg, "success");
        after();
        router.refresh();
      } else {
        toast.show(res.message ?? errMsg, "error");
      }
    });
  };

  // ---------- Usar ----------
  const use = (t: TransactionTemplate) => {
    if (t.amount === null) {
      // Sin monto fijo: lo pedimos antes de registrar (runTemplateAction acepta overrides).
      setRunning(t);
      setRunAmount(undefined);
      setRunDate(todayISO());
      setRunError(null);
      return;
    }
    run(
      () => runTemplateAction(t.id),
      "Movimiento registrado",
      "No pudimos registrar desde la plantilla",
      () => setOpen(false),
    );
  };

  const confirmRun = () => {
    if (!running) return;
    if (!runAmount || runAmount <= 0) {
      setRunError("Escribe un monto mayor a 0");
      return;
    }
    setRunError(null);
    const t = running;
    const overrides = { amount: runAmount, occurredOn: runDate };
    run(
      () => runTemplateAction(t.id, overrides),
      "Movimiento registrado",
      "No pudimos registrar desde la plantilla",
      () => {
        setRunning(null);
        setOpen(false);
      },
    );
  };

  // ---------- Alta / edición ----------
  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  };

  const startCreate = () => {
    setName("");
    setKind("gasto");
    setAmount(undefined);
    setCategoryId("");
    setAccountId("");
    setMerchant("");
    setNote("");
    setFavorite(true);
    setFormError(null);
    setEditing(null);
    setCreating(true);
  };

  const startEdit = (t: TransactionTemplate) => {
    setName(t.name);
    setKind(t.kind === "ingreso" ? "ingreso" : "gasto");
    setAmount(t.amount ?? undefined);
    setCategoryId(t.categoryId ?? "");
    setAccountId(t.accountId ?? "");
    setMerchant(t.merchantOrSource ?? "");
    setNote(t.note ?? "");
    setFavorite(t.isFavorite);
    setFormError(null);
    setCreating(false);
    setEditing(t);
  };

  /** Al cambiar el tipo, un sobre del tipo anterior deja de ser válido. */
  const changeKind = (next: FormKind) => {
    setKind(next);
    const stillValid = categories.some(
      (c) => c.id === categoryId && categoryMatchesKind(c.categoryType, next),
    );
    if (!stillValid) setCategoryId("");
  };

  const save = () => {
    const clean = name.trim();
    if (!clean) {
      setFormError("Ponle un nombre");
      return;
    }
    if (!categoryId) {
      setFormError(kind === "ingreso" ? "Elige la fuente" : "Elige el sobre");
      return;
    }
    if (amount !== undefined && amount <= 0) {
      setFormError("El monto debe ser mayor a 0 (o déjalo vacío)");
      return;
    }
    setFormError(null);

    const payload = {
      name: clean,
      kind,
      amount: amount ?? null,
      currency,
      categoryId,
      accountId: accountId || null,
      merchantOrSource: merchant.trim() || null,
      note: note.trim() || null,
      isFavorite: favorite,
    };

    if (editing) {
      const t = editing;
      run(
        // sortOrder se reenvía: updateTemplate lo reescribe (`?? 0`) y perderíamos el orden.
        () => editTemplateAction(t.id, { ...payload, sortOrder: t.sortOrder }),
        "Plantilla actualizada",
        "No pudimos actualizar la plantilla",
        closeForm,
      );
      return;
    }
    run(
      () => addTemplateAction(payload),
      "Plantilla creada",
      "No pudimos crear la plantilla",
      closeForm,
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const t = deleting;
    run(
      () => removeTemplateAction(t.id),
      "Plantilla eliminada",
      "No pudimos eliminar la plantilla",
      () => setDeleting(null),
    );
  };

  return (
    <>
      <div className="card card-p" style={{ marginBottom: 14 }}>
        <div className="between">
          <div style={{ minWidth: 0 }}>
            <div className="sec-title">Plantillas</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
              Registra en un toque lo que se repite: Netflix, gasolina, tu salario…
            </div>
          </div>
          <button
            type="button"
            className="m-btn m-btn-secondary"
            style={{ flexShrink: 0, marginLeft: 12 }}
            onClick={() => setOpen(true)}
          >
            {templates.length > 0 ? `Ver (${templates.length})` : "Crear"}
          </button>
        </div>
      </div>

      {/* Gestor */}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Plantillas">
        <div style={{ display: "grid", gap: 10 }}>
          {templates.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
              Aún no tienes plantillas. Crea la primera y registrarás en un toque lo que se repite
              cada mes.
            </div>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="card card-p" style={{ padding: 12 }}>
                <div className="between">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {t.kind === "ingreso"
                        ? "Ingreso"
                        : t.kind === "gasto"
                          ? "Gasto"
                          : "Transferencia"}{" "}
                      ·{" "}
                      {t.amount !== null
                        ? formatMoney(t.amount, t.currency || currency)
                        : "Sin monto fijo"}{" "}
                      · {destinationOf(t)}
                    </div>
                  </div>
                  {t.isFavorite ? (
                    <span className="m-chip" style={{ flexShrink: 0, marginLeft: 10 }}>
                      Favorita
                    </span>
                  ) : null}
                </div>

                {isRunnable(t) ? (
                  <button
                    type="button"
                    className="m-btn m-btn-block m-btn-primary"
                    style={{ marginTop: 10 }}
                    disabled={pending}
                    onClick={() => use(t)}
                  >
                    {t.amount !== null ? "Usar" : "Usar (pide el monto)"}
                  </button>
                ) : (
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.45 }}>
                    Las transferencias no se registran por plantilla. Usa la tarjeta Cuentas →
                    Transferir.
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button
                    type="button"
                    className="m-btn m-btn-secondary"
                    disabled={pending}
                    onClick={() => startEdit(t)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="m-btn m-btn-danger"
                    disabled={pending}
                    onClick={() => setDeleting(t)}
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
            Nueva plantilla
          </button>
        </div>
      </BottomSheet>

      {/* Usar una plantilla sin monto fijo */}
      <BottomSheet
        open={running !== null}
        onClose={() => setRunning(null)}
        title={running ? `Usar «${running.name}»` : "Usar plantilla"}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            Esta plantilla no tiene monto fijo. Dinos cuánto fue esta vez.
          </div>
          <MoneyField
            name="runAmount"
            label="Monto"
            value={runAmount}
            currency={running?.currency || currency}
            onChange={setRunAmount}
          />
          <DateField name="runDate" label="Fecha" value={runDate} onChange={setRunDate} />

          {runError ? (
            <div className="neg" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              {runError}
            </div>
          ) : null}

          <button
            type="button"
            className="m-btn m-btn-block m-btn-primary"
            disabled={pending}
            onClick={confirmRun}
          >
            {pending ? "Registrando…" : "Registrar"}
          </button>
          <button
            type="button"
            className="m-btn m-btn-block m-btn-secondary"
            disabled={pending}
            onClick={() => setRunning(null)}
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>

      {/* Alta / edición */}
      <BottomSheet
        open={formOpen}
        onClose={closeForm}
        title={editing ? "Editar plantilla" : "Nueva plantilla"}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <TextField
            name="name"
            label="Nombre"
            value={name}
            onChange={setName}
            placeholder="Netflix, Gasolina, Salario…"
            maxLength={80}
          />
          <Segmented
            name="kind"
            label="Tipo"
            value={kind}
            onChange={(v) => changeKind(v as FormKind)}
            options={KIND_OPTS}
          />
          <MoneyField
            name="amount"
            label="Monto (opcional)"
            value={amount}
            currency={currency}
            onChange={setAmount}
          />
          <div className="muted" style={{ fontSize: 11.5, marginTop: -4, lineHeight: 1.45 }}>
            Déjalo vacío si cambia cada mes: te pediremos el monto al usarla.
          </div>
          <SheetSelect
            name="categoryId"
            label={kind === "ingreso" ? "Fuente" : "Sobre"}
            value={categoryId || undefined}
            options={catOpts}
            placeholder={catOpts.length === 0 ? "No hay sobres disponibles" : "Elige uno…"}
            sheetTitle={kind === "ingreso" ? "Elige la fuente" : "Elige el sobre"}
            onChange={setCategoryId}
          />
          <SheetSelect
            name="accountId"
            label="Cuenta (opcional)"
            value={accountId || undefined}
            options={accOpts}
            placeholder="Sin cuenta"
            sheetTitle="Elige la cuenta"
            onChange={setAccountId}
          />
          <TextField
            name="merchantOrSource"
            label={kind === "ingreso" ? "Fuente del dinero (opcional)" : "Comercio (opcional)"}
            value={merchant}
            onChange={setMerchant}
            placeholder={kind === "ingreso" ? "Mi empresa…" : "Netflix, Gasolinera…"}
            maxLength={160}
          />
          <TextField
            name="note"
            label="Nota (opcional)"
            value={note}
            onChange={setNote}
            placeholder="Plan familiar, tanque lleno…"
            maxLength={280}
          />
          <Toggle
            name="isFavorite"
            label="Favorita"
            value={favorite}
            onChange={setFavorite}
            hint="Las favoritas aparecen como atajo al registrar en la web."
          />

          {formError ? (
            <div className="neg" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              {formError}
            </div>
          ) : null}

          <button
            type="button"
            className="m-btn m-btn-block m-btn-primary"
            disabled={pending}
            onClick={save}
          >
            {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear plantilla"}
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
        title="Eliminar plantilla"
        message={
          deleting
            ? `Dejarás de tener el atajo «${deleting.name}». Los movimientos que ya registraste con ella no cambian.`
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
