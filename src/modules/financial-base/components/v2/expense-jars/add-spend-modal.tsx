"use client";

/**
 * Modal "Registrar gasto" (Budget.html `openAddSpend`). Campos: nombre ·
 * (fecha | moneda+monto) · sobre (optgroup por frasco) · nota de decremento.
 * Al guardar crea la transacción de gasto con category_id = sobre; el frasco
 * decrementa solo porque sube el gasto real de esa categoría.
 *
 * Responsive: la fila de 2 columnas envuelve en anchos chicos y el monto usa
 * flex:1/min-width:0, sin scroll horizontal a ningún ancho.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { addTransactionAction } from "@/modules/financial-base/api/v2-actions";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import type { Account } from "@/modules/financial-base/types";

const CURRENCIES: { code: string; sym: string }[] = [
  { code: "CRC", sym: "₡" },
  { code: "USD", sym: "$" },
  { code: "EUR", sym: "€" },
  { code: "MXN", sym: "MX$" },
  { code: "COP", sym: "COL$" },
  { code: "GBP", sym: "£" },
];

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function AddSpendModal({
  jars,
  accounts,
  currency,
  onClose,
}: {
  jars: Jar[];
  accounts: Account[];
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  // Solo frascos normales con sobres → opciones del selector (optgroup por frasco).
  const normalJars = jars.filter(
    (j): j is Extract<Jar, { kind: "normal" }> => j.kind === "normal" && j.envelopes.length > 0,
  );
  const firstEnv = normalJars[0]?.envelopes[0]?.id ?? "";
  const defaultAccount = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "";

  // La moneda principal del usuario va primero aunque no esté en la lista base.
  const currencyOptions = CURRENCIES.some((c) => c.code === currency)
    ? CURRENCIES
    : [{ code: currency, sym: currency }, ...CURRENCIES];

  const [name, setName] = useState("");
  const [date, setDate] = useState(todayISO());
  const [cur, setCur] = useState(currency);
  const [amount, setAmount] = useState("");
  const [sobre, setSobre] = useState(firstEnv);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sym = currencyOptions.find((c) => c.code === cur)?.sym ?? cur;

  async function save() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Ingresa un monto mayor a 0.");
    if (!sobre) return setError("Elige un sobre.");
    setPending(true);
    setError(null);
    const res = await addTransactionAction({
      kind: "gasto",
      amount: amt,
      currency: cur,
      occurredOn: date,
      categoryId: sobre,
      accountId: defaultAccount || undefined,
      merchantOrSource: name.trim() || undefined,
    });
    setPending(false);
    if (res.ok) {
      toast("Gasto registrado");
      router.refresh();
      onClose();
    } else {
      setError(res.message ?? "No pudimos registrar el gasto.");
    }
  }

  return (
    <Modal
      title="Registrar gasto"
      sub="Reduce el presupuesto del sobre que elijas"
      onClose={onClose}
    >
      <div className="modal-body" style={{ maxWidth: "100%", overflowX: "hidden" }}>
        {error ? (
          <div className="auth-msg warn" role="alert" style={{ marginBottom: 10 }}>
            {error}
          </div>
        ) : null}

        {/* Nombre */}
        <div className="fld">
          <label className="fld-label">Nombre</label>
          <input
            className="inp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej.: Supermercado, gasolina…"
            maxLength={120}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
        </div>

        {/* Fecha | Moneda + Monto (envuelve en pantallas chicas) */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          <div className="fld" style={{ flex: "1 1 140px", minWidth: 0, margin: 0 }}>
            <label className="fld-label">Fecha</label>
            <input
              className="inp"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div className="fld" style={{ flex: "1 1 180px", minWidth: 0, margin: 0 }}>
            <label className="fld-label">Monto</label>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <select
                className="inp"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                aria-label="Moneda"
                style={{ width: 76, flex: "none", boxSizing: "border-box", paddingInline: 8 }}
              >
                {currencyOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
              <div className="inp-money" style={{ flex: 1, minWidth: 0 }}>
                <span className="pre">{sym}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  style={{ minWidth: 0 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sobre (optgroup por frasco) */}
        <div className="fld" style={{ marginTop: 12 }}>
          <label className="fld-label">Sobre</label>
          {normalJars.length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5 }}>
              Crea primero un sobre dentro de un frasco para registrar gastos.
            </div>
          ) : (
            <select
              className="inp"
              value={sobre}
              onChange={(e) => setSobre(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box" }}
            >
              {normalJars.map((j) => (
                <optgroup key={j.group} label={j.name}>
                  {j.envelopes.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Este gasto reducirá el presupuesto disponible del sobre seleccionado.
          </div>
        </div>
      </div>

      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || normalJars.length === 0}
          onClick={() => void save()}
        >
          {pending ? (
            "Guardando…"
          ) : (
            <>
              <Icon name="expense" width={2} /> Registrar gasto
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}
