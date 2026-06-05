"use client";

/**
 * Captura ultra simple: 3 campos visibles + "Más detalles". Lo real va a
 * transactions. Sirve para alta y edición. Teclado numérico nativo en móvil
 * (inputmode="decimal").
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { addTransactionAction, editTransactionAction } from "@/modules/financial-base/api/v2-actions";
import type { Account, Transaction, TxnKind } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";

export const INCOME_SOURCES = [
  "Salario",
  "Comisión",
  "Venta",
  "Reembolso",
  "Ingreso pasivo",
  "Extraordinario",
] as const;

const SYM: Record<string, string> = { CRC: "₡", USD: "$", EUR: "€", MXN: "MX$", COP: "COL$", GBP: "£" };

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function QuickAddModal({
  kind,
  categories,
  accounts,
  currency,
  item,
  onClose,
}: {
  kind: TxnKind;
  categories: Category[];
  accounts: Account[];
  currency: string;
  item?: Transaction;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(item);
  const isGasto = kind === "gasto";

  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? "");
  const [source, setSource] = useState(item?.merchantOrSource ?? INCOME_SOURCES[0]);
  const [accountId, setAccountId] = useState(item?.accountId ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "");
  const [more, setMore] = useState(false);
  const [date, setDate] = useState(item?.occurredOn ?? todayISO());
  const [merchant, setMerchant] = useState(isGasto ? (item?.merchantOrSource ?? "") : "");
  const [note, setNote] = useState(item?.description ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Ingresa un monto válido.");
    setPending(true);
    setError(null);
    const payload = {
      kind,
      amount: amt,
      currency,
      occurredOn: date,
      categoryId: isGasto ? categoryId || null : null,
      accountId: accountId || null,
      merchantOrSource: isGasto ? merchant || null : source,
      description: note || undefined,
      status: "confirmed" as const,
      origin: "manual" as const,
    };
    const res = editing
      ? await editTransactionAction(item!.id, payload)
      : await addTransactionAction(payload);
    setPending(false);
    if (res.ok) {
      toast(editing ? "Transacción actualizada" : isGasto ? "Gasto registrado" : "Ingreso registrado");
      onClose();
      router.refresh();
    } else {
      setError(res.message ?? "No pudimos guardar.");
    }
  };

  const title = `${editing ? "Editar" : "Registrar"} ${isGasto ? "gasto" : "ingreso"}`;

  return (
    <Modal title={title} sub="Captura rápida; lo avanzado está en Más detalles." onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="modal-body">
          {error ? (
            <div className="auth-msg warn" role="alert">
              {error}
            </div>
          ) : null}

          <div className="fld">
            <label className="fld-label">Monto</label>
            <div className="inp-money" style={{ fontSize: 22 }}>
              <span className="pre" style={{ fontSize: 20 }}>
                {SYM[currency] ?? ""}
              </span>
              <input
                autoFocus
                inputMode="decimal"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                style={{ fontSize: 22, fontWeight: 600 }}
                required
              />
            </div>
          </div>

          {isGasto ? (
            <div className="fld">
              <label className="fld-label">Categoría</label>
              <select className="sel" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="fld">
              <label className="fld-label">Fuente</label>
              <select className="sel" value={source} onChange={(e) => setSource(e.target.value)}>
                {INCOME_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="fld">
            <label className="fld-label">{isGasto ? "Cuenta / método" : "Cuenta destino"}</label>
            {accounts.length > 0 ? (
              <select className="sel" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.isDefault ? " (predeterminada)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="muted" style={{ fontSize: 12.5 }}>
                Aún no tienes cuentas; agrégalas en Configuración. Puedes guardar sin cuenta.
              </div>
            )}
          </div>

          {!more ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ alignSelf: "flex-start", padding: "4px 0", color: "var(--info)" }}
              onClick={() => setMore(true)}
            >
              + Más detalles (fecha, comercio, nota…)
            </button>
          ) : (
            <>
              <div className="fld-2">
                <div className="fld">
                  <label className="fld-label">Fecha</label>
                  <input className="inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                {isGasto ? (
                  <div className="fld">
                    <label className="fld-label">Comercio</label>
                    <input
                      className="inp"
                      value={merchant}
                      onChange={(e) => setMerchant(e.target.value)}
                      placeholder="Automercado…"
                    />
                  </div>
                ) : (
                  <div />
                )}
              </div>
              <div className="fld">
                <label className="fld-label">Nota</label>
                <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={`btn ${isGasto ? "btn-primary" : "btn-secondary"}`} disabled={pending}>
            {pending ? "Guardando…" : `Guardar ${isGasto ? "gasto" : "ingreso"}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
