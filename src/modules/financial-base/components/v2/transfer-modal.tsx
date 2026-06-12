"use client";

/** Transferencia entre cuentas (neutra: no cuenta como ingreso ni gasto). */
import { CURRENCY_SYMBOL } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { addTransferAction } from "@/modules/financial-base/api/v2-actions";
import type { Account } from "@/modules/financial-base/types";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TransferButton({ accounts, currency }: { accounts: Account[]; currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ border: "1px solid var(--line)" }}
        onClick={() => setOpen(true)}
        title={accounts.length < 2 ? "Necesitas al menos 2 cuentas" : undefined}
      >
        <Icon name="repeat" width={2} /> Transferencia
      </button>
      {open ? (
        <TransferModal accounts={accounts} currency={currency} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function TransferModal({
  accounts,
  currency,
  onClose,
}: {
  accounts: Account[];
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [toId, setToId] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (accounts.length < 2) {
    return (
      <Modal title="Transferencia" sub="Mueve dinero entre tus cuentas." onClose={onClose}>
        <div className="modal-body">
          <p className="muted" style={{ fontSize: 13 }}>
            Necesitas al menos <strong>2 cuentas</strong> para transferir. Agrégalas en
            Configuración.
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </Modal>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Monto inválido.");
    if (fromId === toId) return setError("Elige cuentas distintas.");
    setPending(true);
    setError(null);
    const res = await addTransferAction({
      fromAccountId: fromId,
      toAccountId: toId,
      amount: amt,
      currency,
      occurredOn: date,
      note: note || undefined,
    });
    setPending(false);
    if (res.ok) {
      toast("Transferencia registrada");
      onClose();
      router.refresh();
    } else {
      setError(res.message ?? res.fieldErrors?.toAccountId ?? "No pudimos transferir.");
    }
  };

  return (
    <Modal title="Transferencia" sub="No cuenta como ingreso ni gasto." onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="modal-body">
          {error ? (
            <div className="auth-msg warn" role="alert">
              {error}
            </div>
          ) : null}
          <div className="fld-2">
            <div className="fld">
              <label className="fld-label">Desde</label>
              <select className="sel" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label className="fld-label">Hacia</label>
              <select className="sel" value={toId} onChange={(e) => setToId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="fld-2">
            <div className="fld">
              <label className="fld-label">Monto</label>
              <div className="inp-money">
                <span className="pre">{CURRENCY_SYMBOL[currency] ?? ""}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
            </div>
            <div className="fld">
              <label className="fld-label">Fecha</label>
              <input
                className="inp"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="fld">
            <label className="fld-label">Nota (opcional)</label>
            <input
              className="inp"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. ahorro mensual"
            />
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Registrando…" : "Transferir"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
