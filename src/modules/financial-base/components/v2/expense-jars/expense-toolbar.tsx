"use client";

/**
 * Toolbar del panel de Gastos (Budget.html, líneas 414–424): botón primario
 * "Registrar gasto" + kebab (3 puntos) con "Copiar mes anterior" / "Nueva
 * categoría" / "Nuevo sobre". El kebab cierra al click fuera; solo uno abierto
 * a la vez. Reutiliza las server actions y modales existentes.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { TransactionComposer } from "@/modules/financial-base/components/v2/transaction-composer";
import { NewSobreModal } from "@/modules/financial-base/components/v2/expense-jars/new-sobre-modal";
import {
  NewSavingsSobreModal,
  type CreateSavingsSobre,
} from "@/modules/financial-base/components/v2/expense-jars/new-savings-sobre-modal";
import { CategoryManagerModal } from "@/modules/financial-base/components/v2/category-manager";
import { copyPreviousMonthBudgetAction } from "@/modules/financial-base/api/v2-actions";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import type { Account, Period } from "@/modules/financial-base/types";
import type {
  CategoryNode,
  CategoryPersonalization,
} from "@/modules/financial-base/services/categories-service";
import type { SuggestionEntry } from "@/modules/financial-base/services/suggestion-service";
import type { TransactionTemplate } from "@/modules/financial-base/services/templates-service";
import type { LinkableEntities } from "@/modules/financial-base/services/linkable-entities-service";

type Sheet = null | "spend" | "sobre" | "sobre-ahorro" | "category";

export function ExpenseToolbar({
  jars,
  accounts,
  period,
  tree,
  composerTree,
  incomeTree,
  suggestions,
  templates,
  linkables,
  canPersonalize,
  personalization,
  createSavingsSobre,
}: {
  jars: Jar[];
  accounts: Account[];
  period: Period;
  /** Árbol crudo para el gestor de categorías (ve todo). */
  tree: CategoryNode[];
  /** Árbol de gasto filtrado a sobres reales para el composer (unificado con Transacciones). */
  composerTree: CategoryNode[];
  incomeTree: CategoryNode[];
  suggestions: SuggestionEntry[];
  templates: TransactionTemplate[];
  linkables: LinkableEntities;
  canPersonalize: boolean;
  personalization: CategoryPersonalization;
  createSavingsSobre?: CreateSavingsSobre;
}) {
  const router = useRouter();
  const toast = useToast();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [menu, setMenu] = useState(false);
  const [copying, startCopy] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Cierra el kebab al click fuera.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  function copyMonth() {
    setMenu(false);
    startCopy(async () => {
      const res = await copyPreviousMonthBudgetAction({
        periodMonth: period.month,
        periodYear: period.year,
      });
      if (res.ok) {
        toast(
          res.copied && res.copied > 0
            ? `Copiados ${res.copied} sobres del mes anterior`
            : "El mes ya tenía todo el presupuesto copiado",
        );
        router.refresh();
      } else {
        toast(res.message ?? "No pudimos copiar el mes anterior");
      }
    });
  }

  return (
    <div
      ref={wrapRef}
      style={{ display: "flex", gap: 8, alignItems: "center", flex: "none", position: "relative" }}
    >
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: "10px 14px", fontSize: 13.5 }}
        onClick={() => setSheet("spend")}
      >
        <Icon name="expense" width={2} /> Registrar gasto
      </button>

      <button
        type="button"
        className="icon-btn"
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={menu}
        style={{ width: 38, height: 38, color: "var(--muted)" }}
        onClick={() => setMenu((v) => !v)}
        disabled={copying}
      >
        <Icon name="dots" />
      </button>

      {menu ? (
        <div
          role="menu"
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 25, // bajo el topbar sticky (z30)
            minWidth: 210,
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            boxShadow: "0 12px 32px rgba(0,0,0,.18)",
          }}
        >
          <MenuItem icon="repeat" label="Copiar mes anterior" onClick={copyMonth} />
          <MenuItem
            icon="budget"
            label="Nueva categoría"
            onClick={() => {
              setMenu(false);
              setSheet("category");
            }}
          />
          <MenuItem
            icon="plus"
            label="Nuevo sobre"
            onClick={() => {
              setMenu(false);
              setSheet("sobre");
            }}
          />
          {createSavingsSobre ? (
            <MenuItem
              icon="savings"
              label="Nuevo sobre de ahorro"
              onClick={() => {
                setMenu(false);
                setSheet("sobre-ahorro");
              }}
            />
          ) : null}
        </div>
      ) : null}

      {sheet === "spend" ? (
        // MISMO composer que Transacciones, bloqueado a GASTO. La lista de categorías es
        // `composerTree` (solo sobres reales), unificando Gastos con Transacciones y el chat.
        <TransactionComposer
          initialKind="gasto"
          lockKind
          tree={composerTree}
          incomeTree={incomeTree}
          accounts={accounts}
          suggestions={suggestions}
          templates={templates}
          linkables={linkables}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "sobre" ? (
        <NewSobreModal jars={jars} period={period} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "sobre-ahorro" && createSavingsSobre ? (
        <NewSavingsSobreModal
          jars={jars}
          createSavingsSobre={createSavingsSobre}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "category" ? (
        <CategoryManagerModal
          tree={tree}
          canPersonalize={canPersonalize}
          personalization={personalization}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="btn btn-ghost"
      style={{
        justifyContent: "flex-start",
        gap: 10,
        padding: "9px 10px",
        fontSize: 13.5,
        width: "100%",
      }}
      onClick={onClick}
    >
      <Icon name={icon} width={2} /> {label}
    </button>
  );
}
