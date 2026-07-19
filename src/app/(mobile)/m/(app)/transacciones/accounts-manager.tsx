"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addAccountAction,
  editAccountAction,
  removeAccountAction,
  addTransferAction,
  type ActionResult,
} from "@/modules/financial-base/api/v2-actions";
import type { Account, AccountKind } from "@/modules/financial-base/types";

import {
  BottomSheet,
  ConfirmDialog,
  CUR_OPTS,
  DateField,
  MoneyField,
  Segmented,
  SheetSelect,
  TextField,
  Toggle,
  useToast,
} from "../../components/form-kit";

/**
 * Cuentas y transferencias en /m/transacciones — consume EXACTAMENTE las Server Actions de la
 * web (add/edit/removeAccountAction, addTransferAction); cero backend nuevo. Tras cada acción:
 * toast en español + router.refresh() (la página es force-dynamic).
 *
 * Dos avisos que vienen del backend y se reflejan en la UI:
 *  · La FK es `account_id ... on delete set null`: borrar una cuenta NO falla, deja sin cuenta
 *    a sus movimientos (y sin cuenta sugerida a las reglas que la usaran). El ConfirmDialog lo
 *    dice tal cual, y removeAccountAction no trae `message`, así que el error lo ponemos aquí.
 *  · createTransfer inserta UNA transacción `kind='transferencia'` (no dos patas), con la cuenta
 *    de origen y "Origen → Destino" como comercio. Es neutra: no suma a ingresos ni a gastos.
 */
const KIND_OPTS = [
  { value: "banco", label: "Banco" },
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
];

const KIND_LABEL: Record<AccountKind, string> = {
  banco: "Banco",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AccountsManager({
  accounts,
  currency,
}: {
  accounts: Account[];
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Alta / edición de cuenta.
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("banco");
  const [cur, setCur] = useState(currency);
  const [isDefault, setIsDefault] = useState(false);
  const [accError, setAccError] = useState<string | null>(null);

  // Transferencia.
  const [transferring, setTransferring] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [trError, setTrError] = useState<string | null>(null);

  const canTransfer = accounts.length >= 2;
  const accountOpts = accounts.map((a) => ({ value: a.id, label: a.name }));
  const formOpen = creating || editing !== null;

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

  // ---------- Cuentas ----------
  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setAccError(null);
  };

  const startCreate = () => {
    setName("");
    setKind("banco");
    setCur(currency);
    setIsDefault(accounts.length === 0); // la primera cuenta es la predeterminada
    setAccError(null);
    setEditing(null);
    setCreating(true);
  };

  const startEdit = (a: Account) => {
    setName(a.name);
    setKind(a.kind);
    setCur(a.currency);
    setIsDefault(a.isDefault);
    setAccError(null);
    setCreating(false);
    setEditing(a);
  };

  const saveAccount = () => {
    const clean = name.trim();
    if (!clean) {
      setAccError("Ponle un nombre");
      return;
    }
    setAccError(null);
    const payload = { name: clean, kind, currency: cur, isDefault };
    if (editing) {
      const a = editing;
      run(
        () => editAccountAction(a.id, payload),
        "Cuenta actualizada",
        "No pudimos actualizar la cuenta",
        closeForm,
      );
      return;
    }
    run(() => addAccountAction(payload), "Cuenta creada", "No pudimos crear la cuenta", closeForm);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const a = deleting;
    run(() => removeAccountAction(a.id), "Cuenta eliminada", "No pudimos eliminar la cuenta", () =>
      setDeleting(null),
    );
  };

  // ---------- Transferencia ----------
  const startTransfer = () => {
    setFromId(accounts[0]?.id ?? "");
    setToId(accounts[1]?.id ?? "");
    setAmount(undefined);
    setDate(todayISO());
    setNote("");
    setTrError(null);
    setTransferring(true);
  };

  const submitTransfer = () => {
    if (!fromId) {
      setTrError("Elige la cuenta de origen");
      return;
    }
    if (!toId) {
      setTrError("Elige la cuenta de destino");
      return;
    }
    if (fromId === toId) {
      setTrError("Elige cuentas distintas");
      return;
    }
    if (!amount || amount <= 0) {
      setTrError("Debe ser mayor a 0");
      return;
    }
    setTrError(null);
    run(
      () =>
        addTransferAction({
          fromAccountId: fromId,
          toAccountId: toId,
          amount,
          currency,
          occurredOn: date,
          note: note.trim() || undefined,
        }),
      "Transferencia registrada",
      "No pudimos registrar la transferencia",
      () => setTransferring(false),
    );
  };

  return (
    <>
      <div className="card card-p" style={{ marginBottom: 14 }}>
        <div className="between">
          <div style={{ minWidth: 0 }}>
            <div className="sec-title">Cuentas</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
              Tus bancos, efectivo y tarjetas. Desde aquí también mueves dinero entre ellas.
            </div>
          </div>
          <button
            type="button"
            className="m-btn m-btn-secondary"
            style={{ flexShrink: 0, marginLeft: 12 }}
            onClick={() => setOpen(true)}
          >
            {accounts.length > 0 ? `Ver (${accounts.length})` : "Crear"}
          </button>
        </div>
      </div>

      {/* Gestor: lista de cuentas + acceso a transferir */}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Cuentas">
        <div style={{ display: "grid", gap: 10 }}>
          {accounts.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
              Aún no tienes cuentas. Crea la primera (tu banco o el efectivo) y podrás asignarle
              cada movimiento.
            </div>
          ) : (
            accounts.map((a) => (
              <div key={a.id} className="card card-p" style={{ padding: 12 }}>
                <div className="between">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {KIND_LABEL[a.kind]} · {a.currency}
                    </div>
                  </div>
                  {a.isDefault ? (
                    <span className="m-chip" style={{ flexShrink: 0, marginLeft: 10 }}>
                      Predeterminada
                    </span>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button
                    type="button"
                    className="m-btn m-btn-secondary"
                    disabled={pending}
                    onClick={() => startEdit(a)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="m-btn m-btn-quiet-danger"
                    disabled={pending}
                    onClick={() => setDeleting(a)}
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
            Nueva cuenta
          </button>

          {canTransfer ? (
            <button
              type="button"
              className="m-btn m-btn-block m-btn-secondary"
              disabled={pending}
              onClick={startTransfer}
            >
              Transferir entre cuentas
            </button>
          ) : (
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
              Necesitas al menos 2 cuentas para transferir dinero entre ellas.
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Alta / edición de cuenta */}
      <BottomSheet
        open={formOpen}
        onClose={closeForm}
        title={editing ? "Editar cuenta" : "Nueva cuenta"}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <TextField
            name="name"
            label="Nombre"
            value={name}
            onChange={setName}
            placeholder="BAC, Efectivo, Visa…"
            maxLength={80}
          />
          <Segmented
            name="kind"
            label="Tipo"
            value={kind}
            onChange={(v) => setKind(v as AccountKind)}
            options={KIND_OPTS}
          />
          <SheetSelect
            name="currency"
            label="Moneda"
            value={cur}
            options={CUR_OPTS}
            sheetTitle="Elige la moneda"
            onChange={setCur}
          />
          <Toggle
            name="isDefault"
            label="Predeterminada"
            value={isDefault}
            onChange={setIsDefault}
            hint="Se propondrá al registrar un movimiento."
          />

          {accError ? (
            <div className="neg" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              {accError}
            </div>
          ) : null}

          <button
            type="button"
            className="m-btn m-btn-block m-btn-primary"
            disabled={pending}
            onClick={saveAccount}
          >
            {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear cuenta"}
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

      {/* Transferir */}
      <BottomSheet
        open={transferring}
        onClose={() => setTransferring(false)}
        title="Transferir entre cuentas"
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            Mover dinero entre tus cuentas no cuenta como ingreso ni como gasto.
          </div>
          <SheetSelect
            name="fromAccountId"
            label="Desde"
            value={fromId || undefined}
            options={accountOpts}
            placeholder="Elige la cuenta de origen"
            sheetTitle="Cuenta de origen"
            onChange={(v) => {
              setFromId(v);
              if (v === toId) setToId("");
            }}
          />
          <SheetSelect
            name="toAccountId"
            label="Hacia"
            value={toId || undefined}
            options={accountOpts.filter((o) => o.value !== fromId)}
            placeholder="Elige la cuenta de destino"
            sheetTitle="Cuenta de destino"
            onChange={setToId}
          />
          <MoneyField
            name="amount"
            label="Monto"
            value={amount}
            currency={currency}
            onChange={setAmount}
          />
          <DateField name="occurredOn" label="Fecha" value={date} onChange={setDate} />
          <TextField
            name="note"
            label="Nota (opcional)"
            value={note}
            onChange={setNote}
            placeholder="Pago de tarjeta, retiro…"
            maxLength={280}
          />

          {trError ? (
            <div className="neg" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              {trError}
            </div>
          ) : null}

          <button
            type="button"
            className="m-btn m-btn-block m-btn-primary"
            disabled={pending}
            onClick={submitTransfer}
          >
            {pending ? "Transfiriendo…" : "Transferir"}
          </button>
          <button
            type="button"
            className="m-btn m-btn-block m-btn-secondary"
            disabled={pending}
            onClick={() => setTransferring(false)}
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>

      {/* Eliminar cuenta */}
      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar cuenta"
        message={
          deleting
            ? `Los movimientos de «${deleting.name}» se quedarán sin cuenta asignada (no se borran). Las reglas que la sugieran dejarán de hacerlo.`
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
