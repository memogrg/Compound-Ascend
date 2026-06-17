"use client";

/**
 * Modal "Nuevo sobre" (toolbar de Gastos). Elige el frasco (grupo), nombre y
 * presupuesto del mes. Crea la subcategoría como favorita (sobre visible) y su
 * línea de presupuesto. Reutiliza las mismas server actions que el modal del
 * frasco.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { MoneyField } from "@/components/forms/money-field";
import { useToast } from "@/components/ui/toast";
import { useCaptureCurrency } from "@/components/layout/currency-context";
import { addCategoryAction, addBudgetItemAction } from "@/modules/financial-base/api/v2-actions";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import type { Period } from "@/modules/financial-base/types";

export function NewSobreModal({
  jars,
  period,
  onClose,
}: {
  jars: Jar[];
  period: Period;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const captureCurrency = useCaptureCurrency();
  // Solo frascos normales pueden tener sobres nuevos (los vinculados se nutren
  // de las entidades reales de su módulo).
  const normalJars = jars.filter((j): j is Extract<Jar, { kind: "normal" }> => j.kind === "normal");

  const [group, setGroup] = useState(normalJars[0]?.group ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  // Moneda del presupuesto: default a la principal (estable), no a la de visualización.
  const [currency, setCurrency] = useState(captureCurrency);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = name.trim();
    if (!group) return setError("Elige un frasco.");
    if (!n) return setError("Ponle un nombre al sobre.");
    const amt = Number(amount) || 0;
    setPending(true);
    setError(null);
    const cat = await addCategoryAction({
      name: n,
      parentId: group,
      categoryType: "expense",
      isFavorite: true,
    });
    if (!cat.ok || !cat.id) {
      setPending(false);
      return setError(cat.message ?? "No pudimos crear el sobre.");
    }
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
    setPending(false);
    toast(`Sobre "${n}" creado`);
    router.refresh();
    onClose();
  }

  return (
    <Modal title="Nuevo sobre" sub="Una subcategoría con su propio presupuesto" onClose={onClose}>
      <div className="modal-body">
        {error ? (
          <div className="auth-msg warn" role="alert" style={{ marginBottom: 10 }}>
            {error}
          </div>
        ) : null}
        <div className="fld">
          <label className="fld-label">Frasco</label>
          <select
            className="inp"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box" }}
          >
            {normalJars.map((j) => (
              <option key={j.group} value={j.group}>
                {j.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          <div className="fld" style={{ flex: "1 1 160px", minWidth: 0, margin: 0 }}>
            <label className="fld-label">Nombre del sobre</label>
            <input
              className="inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Internet, Gimnasio…"
              maxLength={60}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <MoneyField
              label="Presupuesto del mes"
              amount={amount}
              onAmount={setAmount}
              currency={currency}
              onCurrency={setCurrency}
              defaultCurrency={captureCurrency}
              tip="Moneda del presupuesto de este sobre. Por defecto, tu moneda principal."
            />
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
          disabled={pending || !name.trim()}
          onClick={() => void save()}
        >
          {pending ? (
            "Guardando…"
          ) : (
            <>
              <Icon name="plus" width={2} /> Crear sobre
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}
