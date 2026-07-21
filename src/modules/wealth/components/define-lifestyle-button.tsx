"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { currencySymbol } from "@/lib/format";
import { setDesiredLifestyleAction } from "@/modules/wealth/api/actions";

/**
 * CTA para definir (o editar) el estilo de vida DESEADO mensual — el insumo del
 * número de libertad. Al guardar, la acción lo persiste como dato personal y
 * revalida Mi Rich Life; la escalera repinta sola con el número calculado por el
 * motor. La UI nunca calcula el número: solo captura el gasto mensual deseado.
 */
export function DefineLifestyleButton({
  currency,
  current,
  label,
  variant = "btn-primary",
}: {
  currency: string;
  current?: number | null;
  label?: string;
  variant?: "btn-primary" | "btn-secondary" | "btn-ghost";
}) {
  const [open, setOpen] = useState(false);
  const editing = current != null && current > 0;
  return (
    <>
      <button className={`btn ${variant}`} onClick={() => setOpen(true)}>
        {label ?? (editing ? "Editar estilo de vida deseado" : "Definir mi estilo de vida")}
      </button>
      {open ? (
        <LifestyleDialog currency={currency} current={current} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function LifestyleDialog({
  currency,
  current,
  onClose,
}: {
  currency: string;
  current?: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const sym = currencySymbol(currency);
  const editing = current != null && current > 0;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount") ?? 0);
    setPending(true);
    setError(null);
    setMessage(null);
    const res = await setDesiredLifestyleAction(Number.isFinite(amount) ? amount : 0);
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
    const res = await setDesiredLifestyleAction(null);
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
            <div className="inp-money">
              <span className="pre">{sym}</span>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editing ? current! : undefined}
                placeholder="0"
                autoFocus
                aria-invalid={error ? true : undefined}
              />
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
