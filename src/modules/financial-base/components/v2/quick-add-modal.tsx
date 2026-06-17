"use client";

/**
 * Captura ultra simple: 3 campos visibles + "Más detalles". Lo real va a
 * transactions. Sirve para alta y edición. Teclado numérico nativo en móvil
 * (inputmode="decimal").
 */
import { CURRENCY_SYMBOL, CURRENCY_OPTIONS, captureCurrencyDefault } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useCaptureCurrency } from "@/components/layout/currency-context";
import {
  addTransactionAction,
  editTransactionAction,
  addRuleAction,
} from "@/modules/financial-base/api/v2-actions";
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

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type ScanPrefill = {
  amount?: number | null;
  merchant?: string | null;
  date?: string | null;
  currency?: string | null;
  receiptUrl?: string;
  confidence?: number;
};

export function QuickAddModal({
  kind,
  categories,
  accounts,
  item,
  prefill,
  onClose,
}: {
  kind: TxnKind;
  categories: Category[];
  accounts: Account[];
  /**
   * Moneda de visualización (legado). Ya NO se usa para el default de captura
   * —ese es la principal vía useCaptureCurrency()—; se acepta para no romper los
   * call-sites. Puede limpiarse en un follow-up.
   */
  currency?: string;
  item?: Transaction;
  prefill?: ScanPrefill;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const captureCurrency = useCaptureCurrency();
  const editing = Boolean(item);
  const isGasto = kind === "gasto";
  const scanned = Boolean(prefill);

  const [amount, setAmount] = useState(
    item ? String(item.amount) : prefill?.amount ? String(prefill.amount) : "",
  );
  // Moneda de captura: al editar respeta la del ítem; con recibo, la detectada;
  // si no, la principal del usuario (estable) — NUNCA la de visualización.
  const [currency, setCurrency] = useState(
    captureCurrencyDefault(item?.currency, prefill?.currency, captureCurrency),
  );
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? "");
  const [source, setSource] = useState(item?.merchantOrSource ?? INCOME_SOURCES[0]);
  const [accountId, setAccountId] = useState(
    item?.accountId ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "",
  );
  const [more, setMore] = useState(Boolean(prefill?.date || prefill?.merchant));
  const [date, setDate] = useState(item?.occurredOn ?? prefill?.date ?? todayISO());
  const [merchant, setMerchant] = useState(
    isGasto ? (item?.merchantOrSource ?? prefill?.merchant ?? "") : "",
  );
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
      origin: scanned ? ("scanned" as const) : ("manual" as const),
      receiptUrl: prefill?.receiptUrl,
      confidence: prefill?.confidence,
    };
    const res = editing
      ? await editTransactionAction(item!.id, payload)
      : await addTransactionAction(payload);
    setPending(false);
    if (res.ok) {
      toast(
        editing ? "Transacción actualizada" : isGasto ? "Gasto registrado" : "Ingreso registrado",
      );
      // Aprender regla: si recategorizaste un gasto con comercio, ofrece crearla.
      const merchantText = merchant.trim();
      if (isGasto && editing && merchantText && categoryId && categoryId !== item?.categoryId) {
        const catName = categories.find((c) => c.id === categoryId)?.name ?? "esa categoría";
        toast(`Categorizado como ${catName}`, "info", {
          label: "Crear regla",
          onClick: () => {
            void addRuleAction({
              merchantPattern: merchantText,
              type: "expense",
              suggestedCategoryId: categoryId,
              suggestedAccountId: accountId || null,
              active: true,
            });
          },
        });
      }
      onClose();
      router.refresh();
    } else {
      setError(res.message ?? "No pudimos guardar.");
    }
  };

  const title = scanned
    ? "Revisar recibo"
    : `${editing ? "Editar" : "Registrar"} ${isGasto ? "gasto" : "ingreso"}`;
  const sub = scanned
    ? "Encontramos estos datos en tu recibo. Revísalos y guarda."
    : "Captura rápida; lo avanzado está en Más detalles.";

  return (
    <Modal title={title} sub={sub} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="modal-body">
          {error ? (
            <div className="auth-msg warn" role="alert">
              {error}
            </div>
          ) : null}

          <div className="fld">
            <label className="fld-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Monto
              <span
                className="tip"
                data-tip="Elige la moneda en que registraste el monto. Por defecto, tu moneda principal — no la de visualización del topbar."
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 15,
                  height: 15,
                  borderRadius: "50%",
                  border: "1px solid var(--line)",
                  color: "var(--muted)",
                  fontSize: 10,
                  fontWeight: 700,
                  flex: "none",
                }}
              >
                ?
              </span>
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <div className="inp-money" style={{ fontSize: 22, flex: 1, minWidth: 0 }}>
                <span className="pre" style={{ fontSize: 20 }}>
                  {CURRENCY_SYMBOL[currency] ?? ""}
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
              <select
                className="sel"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                aria-label="Moneda del monto"
                style={{ flex: "0 0 auto", width: 104 }}
              >
                {CURRENCY_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.code}
                    {o.code === captureCurrency ? " (principal)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isGasto ? (
            <div className="fld">
              <label className="fld-label">Categoría</label>
              <select
                className="sel"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
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
              <select
                className="sel"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
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
                  <input
                    className="inp"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
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
                <input
                  className="inp"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className={`btn ${isGasto ? "btn-primary" : "btn-secondary"}`}
            disabled={pending}
          >
            {pending ? "Guardando…" : `Guardar ${isGasto ? "gasto" : "ingreso"}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
