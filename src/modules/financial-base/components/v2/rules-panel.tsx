"use client";

/** Panel de reglas de auto-categorización: "si el comercio contiene X → categoría/cuenta". */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { addRuleAction, removeRuleAction } from "@/modules/financial-base/api/v2-actions";
import type { Account } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";
import type { TransactionRule } from "@/modules/financial-base/services/rules-service";

export function RulesButton({
  rules,
  categories,
  accounts,
}: {
  rules: TransactionRule[];
  categories: Category[];
  accounts: Account[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost" onClick={() => setOpen(true)} style={{ border: "1px solid var(--line)" }}>
        <Icon name="filter" width={2} /> Ver reglas
      </button>
      {open ? <RulesPanel rules={rules} categories={categories} accounts={accounts} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function RulesPanel({
  rules,
  categories,
  accounts,
  onClose,
}: {
  rules: TransactionRule[];
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [pattern, setPattern] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? "—" : "—");
  const accName = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? "—" : "—");

  const add = () =>
    startTransition(async () => {
      if (!pattern.trim()) return toast("Escribe un texto a detectar", "error");
      const res = await addRuleAction({ merchantPattern: pattern.trim(), type, suggestedCategoryId: categoryId || null, suggestedAccountId: accountId || null, active: true });
      if (res.ok) {
        toast("Regla creada");
        setPattern("");
        router.refresh();
      } else toast(res.message ?? "No se pudo crear", "error");
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await removeRuleAction(id);
      if (res.ok) {
        toast("Regla eliminada");
        router.refresh();
      } else toast("No se pudo eliminar", "error");
    });

  return (
    <Modal title="Reglas de categorización" sub="Cuando un comercio coincide, se sugiere categoría y cuenta al registrar." onClose={onClose}>
      <div className="modal-body">
        <div className="fld">
          <label className="fld-label">Si el comercio contiene…</label>
          <input className="inp" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Uber, Automercado, Netflix…" />
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Aplica a</label>
            <select className="sel" value={type} onChange={(e) => setType(e.target.value as "income" | "expense")}>
              <option value="expense">Gastos</option>
              <option value="income">Ingresos</option>
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Categoría</label>
            <select className="sel" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={type === "income"}>
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Cuenta</label>
            <select className="sel" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Sin cuenta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="fld" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-primary" onClick={add} disabled={pending} style={{ marginTop: "auto" }}>
              <Icon name="plus" width={2} /> Agregar regla
            </button>
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <div className="label" style={{ marginBottom: 8 }}>Tus reglas ({rules.length})</div>
          {rules.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>Aún no tienes reglas. Crea una arriba.</p>
          ) : (
            rules.map((r) => (
              <div key={r.id} className="list-row" style={{ gridTemplateColumns: "1fr auto" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>“{r.merchantPattern}”</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {r.type === "expense" ? "Gasto" : "Ingreso"} → {catName(r.suggestedCategoryId)} · {accName(r.suggestedAccountId)}
                  </div>
                </div>
                <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Eliminar" onClick={() => remove(r.id)} disabled={pending}>
                  <Icon name="x" width={2} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}
