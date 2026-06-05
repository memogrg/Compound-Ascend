"use client";

/** Botones grandes para registrar gasto/ingreso (abren la captura rápida). */
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { QuickAddModal } from "@/modules/financial-base/components/v2/quick-add-modal";
import type { Account, TxnKind } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";

export function QuickAddButtons({
  categories,
  accounts,
  currency,
  only,
}: {
  categories: Category[];
  accounts: Account[];
  currency: string;
  only?: TxnKind;
}) {
  const [open, setOpen] = useState<TxnKind | null>(null);
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {only !== "ingreso" ? (
        <button className="btn btn-primary" style={{ padding: "12px 18px", fontSize: 14.5 }} onClick={() => setOpen("gasto")}>
          <Icon name="expense" width={2} /> Registrar gasto
        </button>
      ) : null}
      {only !== "gasto" ? (
        <button className="btn btn-secondary" style={{ padding: "12px 18px", fontSize: 14.5 }} onClick={() => setOpen("ingreso")}>
          <Icon name="income" width={2} /> Registrar ingreso
        </button>
      ) : null}
      {open ? (
        <QuickAddModal
          kind={open}
          categories={categories}
          accounts={accounts}
          currency={currency}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
