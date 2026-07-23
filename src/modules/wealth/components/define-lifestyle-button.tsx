"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { currencySymbol } from "@/lib/format";
import { setDesiredLifestyleAction } from "@/modules/wealth/api/actions";
import { useCaptureCurrency } from "@/components/layout/currency-context";
import { CURRENCIES } from "@/modules/personal-profile/constants";

/**
 * CTA para definir (o editar) el estilo de vida DESEADO mensual — el insumo del
 * número de libertad. Al guardar, la acción lo persiste como dato personal y
 * revalida Mi Rich Life; la escalera repinta sola con el número calculado por el
 * motor. La UI nunca calcula el número: solo captura el gasto mensual deseado.
 */
export function DefineLifestyleButton({
  current,
  label,
  variant = "btn-primary",
}: {
  current?: { amount: number; currency: string } | null;
  label?: string;
  variant?: "btn-primary" | "btn-secondary" | "btn-ghost";
}) {
  const [open, setOpen] = useState(false);
  const editing = current != null && current.amount > 0;
  return (
    <>
      <button className={`btn ${variant}`} onClick={() => setOpen(true)}>
        {label ?? (editing ? "Editar estilo de vida deseado" : "Definir mi estilo de vida")}
      </button>
      {open ? <LifestyleDialog current={current} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function LifestyleDialog({
  current,
  onClose,
}: {
  current?: { amount: number; currency: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const captureCurrency = useCaptureCurrency();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Importe LIBRE: moneda por defecto la PRINCIPAL (o la ya guardada al editar), editable.
  const [cur, setCur] = useState(current?.currency ?? captureCurrency);
  const sym = currencySymbol(cur);
  const editing = current != null && current.amount > 0;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount") ?? 0);
    setPending(true);
    setError(null);
    setMessage(null);
    const res = await setDesiredLifestyleAction(Number.isFinite(amount) ? amount : 0, cur);
    setPending(false);
    if (res.ok) {
      toast("Estilo de vida guardado");
      onClose();
      router.refresh();
    } else {
      if (res.fieldErrors?.amount) setError(res.fieldErrors.amount);
      if (res.message) setMessage(res.message);
    }
  };

  const clear = async () => {
    setPending(true);
    const res = await setDesiredLifestyleAction(null, cur);
    setPending(false);
    if (res.ok) {
      toast("Estilo de vida borrado");
      onClose();
      router.refresh();
    } else if (res.message) {
      setMessage(res.message);
    }
  };

  return (
    <Modal
      title={editing ? "Editar estilo de vida deseado" : "Definir tu estilo de vida"}
      sub="El gasto mensual de la vida que querés vivir. Con él calculamos tu Número de Libertad."
      onClose={onClose}
    >
      <form onSubmit={onSubmit}>
        <div className="modal-body">
          {message ? (
            <div className="auth-msg warn" role="alert">
              {message}
            </div>
          ) : null}
          <div className="fld">
            <label className="fld-label">Gasto mensual deseado</label>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              {/* Selector de moneda: importe libre, la elige el usuario. El símbolo sigue al
                  valor elegido (no a la moneda de visualización). */}
              <select
                className="inp"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                aria-label="Moneda"
                style={{ width: 80, flex: "none", boxSizing: "border-box", paddingInline: 8 }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value}
                  </option>
                ))}
              </select>
              <div className="inp-money" style={{ flex: 1, minWidth: 0 }}>
                <span className="pre">{sym}</span>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editing ? current!.amount : undefined}
                  placeholder="0"
                  autoFocus
                  aria-invalid={error ? true : undefined}
                />
              </div>
            </div>
            {error ? (
              <span className="auth-err" role="alert">
                {error}
              </span>
            ) : null}
            <span className="muted" style={{ fontSize: 12, marginTop: 6, display: "block" }}>
              Todo lo que querés poder cubrir con tu patrimonio: lo esencial más lo que hace rica tu
              vida (viajes, hobbies, generosidad…).
            </span>
          </div>
        </div>
        <div className="modal-foot" style={{ justifyContent: "space-between" }}>
          {editing ? (
            <button type="button" className="btn btn-ghost" onClick={clear} disabled={pending}>
              Borrar
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
