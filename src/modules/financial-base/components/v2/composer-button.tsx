"use client";

/** Disparador del Composer premium de transacciones. */
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { TransactionComposer } from "@/modules/financial-base/components/v2/transaction-composer";
import type { Account, TxnKind } from "@/modules/financial-base/types";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";
import type { SuggestionEntry } from "@/modules/financial-base/services/suggestion-service";
import type { TransactionTemplate } from "@/modules/financial-base/services/templates-service";
import type { LinkableEntities } from "@/modules/financial-base/services/linkable-entities-service";

const NO_LINKABLES: LinkableEntities = { debt: [], goal: [], holding: [], policy: [], rental: [] };

export function ComposerButton({
  tree,
  incomeTree = [],
  accounts,
  currency,
  suggestions,
  templates,
  linkables = NO_LINKABLES,
  only,
  label,
}: {
  tree: CategoryNode[];
  incomeTree?: CategoryNode[];
  accounts: Account[];
  currency: string;
  suggestions: SuggestionEntry[];
  templates: TransactionTemplate[];
  linkables?: LinkableEntities;
  only?: TxnKind;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const initialKind: TxnKind = only ?? "gasto";
  return (
    <>
      <button
        className={`btn ${only === "ingreso" ? "btn-secondary" : "btn-primary"}`}
        style={{ padding: "12px 18px", fontSize: 14.5 }}
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" width={2} /> {label ?? "Registrar"}
      </button>
      {open ? (
        <TransactionComposer
          initialKind={initialKind}
          lockKind={Boolean(only)}
          tree={tree}
          incomeTree={incomeTree}
          accounts={accounts}
          linkables={linkables}
          currency={currency}
          suggestions={suggestions}
          templates={templates}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
