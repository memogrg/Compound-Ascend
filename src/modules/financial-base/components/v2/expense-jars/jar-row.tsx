"use client";

/**
 * Fila de un frasco. Normal → abre el modal de sobres + crear subcategoría.
 * Vinculado → de momento (este commit) muestra un resumen de solo lectura; su
 * modal con entidades reales + CTA llega en el commit de frascos vinculados.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { JarNormalModal } from "@/modules/financial-base/components/v2/expense-jars/jar-normal-modal";
import { JarLinkedModal } from "@/modules/financial-base/components/v2/expense-jars/jar-linked-modal";
import { JarOrphansModal } from "@/modules/financial-base/components/v2/expense-jars/jar-orphans-modal";
import { CategoryKebab } from "@/modules/financial-base/components/v2/expense-jars/category-kebab";
import {
  usePersonalize,
  PersonalizeMenuButtons,
} from "@/modules/financial-base/components/v2/expense-jars/personalize-category";
import { removeCategoryAction } from "@/modules/financial-base/api/v2-actions";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import type { Period } from "@/modules/financial-base/types";
import type {
  Category,
  CategoryPersonalization,
} from "@/modules/financial-base/services/categories-service";

// Los iconos sembrados en BD (home/car/food/heart/book/bank…) no existen en el
// set del design system: mapéalos a uno válido; fallback genérico.
const ICON_MAP: Record<string, IconName> = {
  home: "budget",
  car: "repeat",
  food: "expense",
  heart: "defense",
  sparkles: "spark",
  book: "profile",
  bank: "networth",
  dots: "dots",
  invest: "invest",
  debt: "debt",
  defense: "defense",
  savings: "savings",
};
function iconFor(name: string): IconName {
  return ICON_MAP[name] ?? "expense";
}

function pct(spent: number, budget: number): number {
  if (budget <= 0) return spent > 0 ? 100 : 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

export function JarRow({
  jar,
  currency,
  period,
  categories,
  canPersonalize,
  personalization,
}: {
  jar: Jar;
  currency: string;
  period: Period;
  categories: Category[];
  canPersonalize: boolean;
  personalization: CategoryPersonalization;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // Override de color por usuario (las categorías base no tienen color por-usuario
  // en BD; se persiste en localStorage). Solo aplica a frascos normales.
  const storageKey = `ca:jarColor:${jar.group}`;
  const [override, setOverride] = useState<string | null>(null);
  useEffect(() => {
    try {
      setOverride(localStorage.getItem(storageKey));
    } catch {
      /* SSR / storage no disponible */
    }
  }, [storageKey]);
  const icon = iconFor(jar.icon);

  // Personalización (Fase 2): hook izado ANTES del early-return de vinculados
  // (regla de hooks). Solo se usa en la rama de frasco normal.
  const jarBaseId = personalization.forkToBase[jar.group] ?? null;
  const jarIsFork = jarBaseId != null;
  const personalize = usePersonalize({
    target: {
      id: jar.group,
      name: jar.name,
      isSystem: jar.kind === "normal" ? jar.isSystem : false,
      icon: jar.icon,
      color: jar.color,
      isFavorite: false,
    },
    isFork: jarIsFork,
    baseIdIfFork: jarBaseId,
    reassignOptions: categories
      .filter((c) => c.id !== jar.group)
      .map((c) => ({ id: c.id, label: c.name })),
  });

  if (jar.kind === "linked") {
    // (linked branch — sin kebab)
    const n = jar.items.length;

    // Budget-aware (Deudas): barra gastado/total + restante, igual que un frasco
    // normal. La obligación es de solo lectura aquí; se paga vía "Registrar gasto".
    if (jar.budgetAware && jar.totals) {
      const { budget: tBudget, spent: tSpent, remaining } = jar.totals;
      const over = tBudget > 0 && tSpent > tBudget;
      const color = over ? "var(--neg)" : jar.color;
      const width = pct(tSpent, tBudget);
      // Verbo según el tipo: metas/inversiones "aportado", deudas/pólizas "pagado".
      const doneVerb =
        jar.linkedKind === "goal" || jar.linkedKind === "holding" ? "aportado" : "pagado";
      const subList =
        n > 0 ? jar.items.map((it) => it.name).join(", ") : jar.emptyText;
      return (
        <>
          <button
            type="button"
            className={over ? "env exp-clickable over" : "env exp-clickable"}
            style={{
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              font: "inherit",
            }}
            onClick={() => setOpen(true)}
            aria-label={jar.name}
          >
            <div
              className="env-ic"
              style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
            >
              <Icon name={icon} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="env-name">
                {jar.name} <span className="chip-linked">vinculado</span>{" "}
                <span style={{ color: "var(--text-muted)" }}>›</span>
              </div>
              <div
                className="env-sub"
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {subList}
              </div>
            </div>
            <div className="env-bar-cell">
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${width}%`, background: color }} />
              </div>
              <div className="env-bar-meta">
                <span style={over ? { color: "var(--neg)" } : undefined}>
                  {formatMoney(tSpent, currency)} {doneVerb}
                </span>
                <span>
                  {over
                    ? `excedido ${formatMoney(Math.abs(remaining), currency)}`
                    : `${formatMoney(remaining, currency)} restante`}
                </span>
              </div>
            </div>
            <div className="env-num" style={{ textAlign: "right" }}>
              <div className="big">{formatMoney(tBudget, currency)}</div>
              <div className="small">
                {n} {n === 1 ? "obligación" : "obligaciones"}
              </div>
            </div>
          </button>
          {open ? <JarLinkedModal jar={jar} currency={currency} onClose={() => setOpen(false)} /> : null}
        </>
      );
    }

    const sub =
      n > 0 ? `${n} ${n === 1 ? "elemento vinculado" : "elementos vinculados"}` : jar.emptyText;
    return (
      <>
        <button
          type="button"
          className="env exp-clickable"
          style={{
            width: "100%",
            textAlign: "left",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            font: "inherit",
          }}
          onClick={() => setOpen(true)}
          aria-label={jar.name}
        >
          <div
            className="env-ic"
            style={{
              background: `color-mix(in srgb, ${jar.color} 14%, transparent)`,
              color: jar.color,
            }}
          >
            <Icon name={icon} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="env-name">
              {jar.name} <span className="chip-linked">vinculado</span>{" "}
              <span style={{ color: "var(--text-muted)" }}>›</span>
            </div>
            <div className="env-sub">{sub}</div>
          </div>
          <div className="env-bar-cell" />
          <div className="env-num">
            <div className="small">Ver</div>
          </div>
        </button>
        {open ? <JarLinkedModal jar={jar} currency={currency} onClose={() => setOpen(false)} /> : null}
      </>
    );
  }

  // Frasco "Por reasignar": líneas que suman en el titular pero cuya categoría
  // ya no se pinta. Estilo de alerta; el modal permite reasignarlas o borrarlas.
  if (jar.kind === "orphan") {
    const n = jar.items.length + jar.realItems.length;
    // Se muestran los dos totales por separado (planificado vs gastado): son
    // invariantes distintos y un número sumado no significaría nada.
    const totalLabel = [
      jar.items.length > 0 ? formatMoney(jar.total, currency) : null,
      jar.realItems.length > 0 ? formatMoney(jar.realTotal, currency) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const subLabel = [
      jar.items.length > 0 ? `${jar.items.length} de presupuesto` : null,
      jar.realItems.length > 0 ? `${jar.realItems.length} de gasto real` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <>
        <button
          type="button"
          className="env exp-clickable"
          style={{
            width: "100%",
            textAlign: "left",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            font: "inherit",
          }}
          onClick={() => setOpen(true)}
          aria-label={`${jar.name} · ${n} ${n === 1 ? "línea" : "líneas"}`}
        >
          <div
            className="env-ic"
            style={{
              background: `color-mix(in srgb, ${jar.color} 14%, transparent)`,
              color: jar.color,
            }}
          >
            <Icon name={icon} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="env-name">
              {jar.name} <span style={{ color: "var(--text-muted)" }}>›</span>
            </div>
            <div className="env-sub">{subLabel} · suman pero no se ven</div>
          </div>
          <div className="env-bar-cell" />
          <div className="env-num" style={{ textAlign: "right" }}>
            <div className="big" style={{ color: jar.color }}>
              {totalLabel}
            </div>
            <div className="small">Revisar</div>
          </div>
        </button>
        {open ? (
          <JarOrphansModal
            jar={jar}
            currency={currency}
            categories={categories}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </>
    );
  }

  const totalSpent = jar.envelopes.reduce((s, e) => s + e.spent, 0);
  const totalBudget = jar.envelopes.reduce((s, e) => s + e.budget, 0);
  const over = totalBudget > 0 && totalSpent > totalBudget;
  const baseColor = override ?? jar.color;
  const color = over ? "var(--neg)" : baseColor;
  const width = pct(totalSpent, totalBudget);
  const remaining = totalBudget - totalSpent;
  const n = jar.envelopes.length;
  // Lista descriptiva de subcategorías (no "Presupuestado $X").
  const subList =
    n > 0 ? jar.envelopes.map((e) => e.name).join(", ") : "Sin sobres · crea el primero";

  function pickColor(c: string) {
    try {
      localStorage.setItem(storageKey, c);
    } catch {
      /* noop */
    }
    setOverride(c);
  }
  function resetColor() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* noop */
    }
    setOverride(null);
  }
  async function deleteCategory() {
    const res = await removeCategoryAction({ id: jar.group });
    if (res.ok) {
      toast(`Categoría "${jar.name}" eliminada`);
      router.refresh();
    } else {
      toast(res.message ?? "No pudimos eliminar la categoría");
    }
  }

  return (
    <>
      <div
        className={over ? "env exp-clickable over" : "env exp-clickable"}
        style={{ position: "relative" }}
      >
        {/* Área de click (abre el modal del frasco) por debajo del kebab */}
        <button
          type="button"
          aria-label={jar.name}
          onClick={() => setOpen(true)}
          style={{
            position: "absolute",
            inset: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            zIndex: 0,
          }}
        />
        <div
          className="env-ic"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          <Icon name={icon} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="env-name">
            {jar.name} <span style={{ color: "var(--muted)" }}>›</span>
          </div>
          <div
            className="env-sub"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {subList}
          </div>
        </div>
        <div className="env-bar-cell">
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${width}%`, background: color }} />
          </div>
          <div className="env-bar-meta">
            <span style={over ? { color: "var(--neg)" } : undefined}>
              {formatMoney(totalSpent, currency)} gastado
            </span>
            <span>
              {over
                ? `excedido ${formatMoney(Math.abs(remaining), currency)}`
                : `${formatMoney(remaining, currency)} restante`}
            </span>
          </div>
        </div>
        <div
          className="env-num"
          style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}
        >
          <div style={{ textAlign: "right" }}>
            <div className="big">{formatMoney(totalBudget, currency)}</div>
            <div className="small">
              {n} {n === 1 ? "sobre" : "sobres"}
            </div>
          </div>
          <CategoryKebab
            name={jar.name}
            currentColor={baseColor}
            hasOverride={override != null}
            deletable={!jar.isSystem}
            onPickColor={pickColor}
            onReset={resetColor}
            onDelete={() => void deleteCategory()}
            personalizeSlot={
              canPersonalize && (jar.isSystem || jarIsFork) ? (
                <PersonalizeMenuButtons
                  isFork={jarIsFork}
                  pending={personalize.pending}
                  onEdit={personalize.openFork}
                  onHide={personalize.openHide}
                  onRevert={personalize.revert}
                />
              ) : null
            }
          />
        </div>
        {jarIsFork ? <span className="chip-linked">personalizado</span> : null}
      </div>
      {/* Modales de personalización izados: sobreviven al cierre del kebab. */}
      {canPersonalize ? personalize.modals : null}
      {open ? (
        <JarNormalModal
          jar={jar}
          currency={currency}
          period={period}
          categories={categories}
          canPersonalize={canPersonalize}
          personalization={personalization}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
