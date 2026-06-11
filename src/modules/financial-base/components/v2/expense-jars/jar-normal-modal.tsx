"use client";

/**
 * Modal de un frasco normal: lista de sobres con barra gastado/presupuesto,
 * total del frasco, y bloque "Crear nueva subcategoría" con chips de
 * sugerencia (benchmark + hojas del grupo) e input con marca de agua. Crear
 * una subcategoría la añade como sobre del grupo con su presupuesto del mes.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { addCategoryAction, addBudgetItemAction } from "@/modules/financial-base/api/v2-actions";
import { BudgetWarningModal } from "@/modules/financial-base/components/v2/expense-jars/budget-warning-modal";
import type { Jar, JarEnvelope } from "@/modules/financial-base/engine/expense-jars";
import type { Period } from "@/modules/financial-base/types";

function pct(spent: number, budget: number): number {
  if (budget <= 0) return spent > 0 ? 100 : 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

export function JarNormalModal({
  jar,
  currency,
  period,
  onClose,
}: {
  jar: Extract<Jar, { kind: "normal" }>;
  currency: string;
  period: Period;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [extra, setExtra] = useState<JarEnvelope[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editEnv, setEditEnv] = useState<JarEnvelope | null>(null);

  const envelopes = [...jar.envelopes, ...extra];
  const totalSpent = envelopes.reduce((s, e) => s + e.spent, 0);
  const totalBudget = envelopes.reduce((s, e) => s + e.budget, 0);

  // Marca de agua con ejemplos del grupo (se borra al escribir).
  const watermark =
    jar.suggestions.length > 0 ? `Ej.: ${jar.suggestions.slice(0, 3).join(", ")}` : "Nombre de la subcategoría";

  async function addSubcategory() {
    const n = name.trim();
    if (!n) return setError("Escribe un nombre.");
    const amt = Number(amount) || 0;
    setPending(true);
    setError(null);
    // 1) crea la subcategoría como sobre del grupo (favorita → visible).
    const cat = await addCategoryAction({ name: n, parentId: jar.group, categoryType: "expense", isFavorite: true });
    if (!cat.ok || !cat.id) {
      setPending(false);
      return setError(cat.message ?? "No pudimos crear la subcategoría.");
    }
    // 2) si hay monto, crea su presupuesto del mes.
    if (amt > 0) {
      await addBudgetItemAction({
        type: "expense",
        categoryId: cat.id,
        name: n,
        amount: amt,
        currency,
        frequency: "mensual",
        periodMonth: period.month,
        periodYear: period.year,
      });
    }
    setExtra((prev) => [...prev, { id: cat.id!, name: n, spent: 0, budget: amt }]);
    setName("");
    setAmount("");
    setPending(false);
    toast(`Sobre "${n}" creado`);
    router.refresh();
  }

  return (
    <Modal
      title={jar.name}
      sub={`${envelopes.length} sobre(s) · ${formatMoney(totalSpent, currency)} de ${formatMoney(totalBudget, currency)}`}
      onClose={onClose}
    >
      <div className="modal-body">
        {/* Sobres */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {envelopes.length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5 }}>Este frasco aún no tiene sobres. Crea el primero abajo.</div>
          ) : (
            envelopes.map((e) => {
              const over = e.budget > 0 && e.spent > e.budget;
              const color = over ? "var(--neg)" : jar.color;
              const remaining = e.budget - e.spent;
              return (
                <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{e.name}</div>
                    <div className="bar-track" style={{ marginTop: 6 }}>
                      <div className="bar-fill" style={{ width: `${pct(e.spent, e.budget)}%`, background: color }} />
                    </div>
                    <div className="env-bar-meta" style={{ marginTop: 4 }}>
                      <span style={over ? { color: "var(--neg)" } : undefined}>{formatMoney(e.spent, currency)} gastado</span>
                      <span>
                        {over
                          ? `excedido ${formatMoney(Math.abs(remaining), currency)}`
                          : `${formatMoney(remaining, currency)} restante`}
                      </span>
                    </div>
                  </div>
                  <div className="env-num">
                    <div className="big">{formatMoney(e.budget, currency)}</div>
                    <div className="small">presupuesto</div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn tip"
                    data-tip="Editar el presupuesto de este sobre (requiere confirmación)"
                    aria-label={`Editar presupuesto de ${e.name}`}
                    style={{ width: 30, height: 30, color: "var(--muted)" }}
                    onClick={() => setEditEnv(e)}
                  >
                    <Icon name="lock" />
                  </button>
                </div>
              );
            })
          )}
        </div>
        {editEnv ? (
          <BudgetWarningModal envelope={editEnv} period={period} currency={currency} onClose={() => setEditEnv(null)} />
        ) : null}

        {/* Crear nueva subcategoría */}
        <div className="fld" style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <label className="fld-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Crear nueva subcategoría
            <span
              className="tip"
              data-tip="Un sobre es una subcategoría con su propio presupuesto dentro del frasco. Usa una sugerencia o escribe la tuya."
              style={{ width: 15, height: 15, borderRadius: "50%", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--muted)" }}
            >
              ?
            </span>
          </label>
          {jar.suggestions.length > 0 ? (
            <div className="chip-grid" style={{ marginBottom: 8 }}>
              {jar.suggestions.slice(0, 10).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip-sel ${name === s ? "on" : ""}`}
                  style={{ fontSize: 11.5, padding: "3px 10px" }}
                  onClick={() => setName(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          {error ? <div className="auth-msg warn" role="alert" style={{ marginBottom: 8 }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <input
              className="inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={watermark}
              maxLength={60}
              style={{ flex: 1 }}
            />
            <div className="inp-money" style={{ width: 130, flex: "none" }}>
              <span className="pre">{currency}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <button type="button" className="btn btn-primary" style={{ flex: "none" }} onClick={() => void addSubcategory()} disabled={pending || !name.trim()}>
              {pending ? "…" : <><Icon name="plus" width={2} /> Añadir</>}
            </button>
          </div>
        </div>
      </div>

      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}
