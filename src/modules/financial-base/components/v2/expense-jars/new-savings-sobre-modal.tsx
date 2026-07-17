"use client";

/**
 * Modal "Nuevo sobre de ahorro" (toolbar de Gastos). Espejo de NewSobreModal,
 * pero crea un AHORRO acumulable (savings_goal kind='sobre') colgado del frasco
 * elegido (default_category_id), no un sobre de gasto mensual. A diferencia del
 * sobre normal, ACUMULA entre meses: le metés y sacás plata; no se resetea.
 * Reutiliza la server action de control (createSavingsSobreAction).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { MoneyField } from "@/components/forms/money-field";
import { useToast } from "@/components/ui/toast";
import { useCaptureCurrency } from "@/components/layout/currency-context";
import { addCategoryAction } from "@/modules/financial-base/api/v2-actions";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";

/** Resultado de la server action (evita importar tipos de control en este módulo). */
type SobreActionResult = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };
export type CreateSavingsSobre = (input: {
  categoryId: string;
  name: string;
  currency: string;
  initialAmount?: number;
}) => Promise<SobreActionResult>;

export function NewSavingsSobreModal({
  jars,
  createSavingsSobre,
  onClose,
}: {
  jars: Jar[];
  createSavingsSobre: CreateSavingsSobre;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const captureCurrency = useCaptureCurrency();
  // Solo frascos normales cuelgan sobres (los vinculados se nutren de entidades).
  const normalJars = jars.filter((j): j is Extract<Jar, { kind: "normal" }> => j.kind === "normal");

  const [group, setGroup] = useState(normalJars[0]?.group ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(captureCurrency);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Crear un frasco (categoría de nivel 1) nuevo sin salir del modal.
  const [newFrascos, setNewFrascos] = useState<{ id: string; name: string }[]>([]);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatPending, setNewCatPending] = useState(false);

  async function createFrasco() {
    const n = newCatName.trim();
    if (!n) return;
    setNewCatPending(true);
    const res = await addCategoryAction({ name: n, categoryType: "expense", isFavorite: true });
    setNewCatPending(false);
    if (res.ok && res.id) {
      setNewFrascos((prev) => [...prev, { id: res.id!, name: n }]);
      setGroup(res.id);
      setNewCatOpen(false);
      setNewCatName("");
    } else {
      setError(res.message ?? "No pudimos crear el frasco.");
    }
  }

  async function save() {
    const n = name.trim();
    if (!group) return setError("Elige un frasco.");
    if (!n) return setError("Ponle un nombre al sobre.");
    setPending(true);
    setError(null);
    const res = await createSavingsSobre({
      categoryId: group,
      name: n,
      currency,
      initialAmount: Number(amount) || 0,
    });
    setPending(false);
    if (!res.ok) return setError(res.message ?? "No pudimos crear el sobre de ahorro.");
    toast(`Sobre de ahorro "${n}" creado`);
    router.refresh();
    onClose();
  }

  return (
    <Modal
      title="Nuevo sobre de ahorro"
      sub="Acumula entre meses (no se resetea); le metés y sacás plata"
      onClose={onClose}
    >
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
            {newFrascos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {newCatOpen ? (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                className="inp"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nombre del frasco nuevo…"
                maxLength={60}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createFrasco();
                  }
                  if (e.key === "Escape") setNewCatOpen(false);
                }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "6px 12px" }}
                disabled={newCatPending || !newCatName.trim()}
                onClick={() => void createFrasco()}
              >
                {newCatPending ? "…" : "Crear"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: "4px 8px", marginTop: 6, color: "var(--muted)" }}
              onClick={() => setNewCatOpen(true)}
            >
              <Icon name="plus" width={2} /> Crear frasco nuevo
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          <div className="fld" style={{ flex: "1 1 160px", minWidth: 0, margin: 0 }}>
            <label className="fld-label">Nombre del sobre</label>
            <input
              className="inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Maquillaje, Regalos…"
              maxLength={60}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <MoneyField
              label="Aporte inicial (opcional)"
              amount={amount}
              onAmount={setAmount}
              currency={currency}
              onCurrency={setCurrency}
              defaultCurrency={captureCurrency}
              tip="Opcional: cuánto meterle ya. Podés aportar más desde Gastos cuando quieras."
            />
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Aparece en Ahorro como sobre (sin meta) y acá en Gastos, bajo su frasco, para aportarle.
        </p>
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
              <Icon name="plus" width={2} /> Crear sobre de ahorro
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}
