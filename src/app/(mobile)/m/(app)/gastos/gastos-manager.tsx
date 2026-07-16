"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  removeCategoryAction,
  unforkCategoryAction,
  unhideCategoryAction,
} from "@/modules/financial-base/api/v2-actions";
import type { Jar, JarEnvelope } from "@/modules/financial-base/engine/expense-jars";
import type { Account, Period } from "@/modules/financial-base/types";
import type { CategoryPersonalization } from "@/modules/financial-base/services/categories-service";
import { formatMoney } from "@/lib/format";

import { Fab, BottomSheet, SheetSelect, ConfirmDialog, useToast } from "../../components/form-kit";
import { MIcon, type MIconName } from "../../components/m-icon";
import {
  MSummaryCard,
  MSectionHeader,
  MContentCard,
  MDataRow,
  MChip,
  MProgress,
  MEmptyState,
  mAmount,
  TONE_TEXT,
  type MTone,
} from "../../components/content-kit";
import {
  AddSpendForm,
  CreateSobreForm,
  BudgetEditForm,
  EditSobreForm,
  ForkCategoryForm,
  HideCategoryForm,
  type PersonalizeTarget,
} from "./gastos-forms";

/** Metadatos por categoría que el manager necesita (sistema/favorito/icono/color/nombre). */
type CatMeta = {
  isSystem: boolean;
  isFavorite: boolean;
  icon: string | null;
  color: string | null;
  name: string;
};

/**
 * Gestión V2 de Gastos en /m/gastos — mismo modelo y acciones que la web /gastos
 * (expense-jars/*): frascos (grupos) con sobres (categorías hoja), gasto real (transactions)
 * y presupuesto por sobre (budget_items). Reemplaza el CRUD legacy (addExpenseAction):
 *  - FAB "Registrar gasto" → addTransactionAction (selector de sobre agrupado por frasco).
 *  - Tocar un frasco normal → detalle con sus sobres + "Editar presupuesto" (3 checks,
 *    setEnvelopeBudgetAction) + "Crear sobre" (addCategoryAction + addBudgetItemAction).
 *  - Los frascos vinculados (deudas/metas/…) quedan read-only con deep-link a su pantalla.
 * Lo capturado aquí sincroniza con la web (mismas transactions/expense_categories).
 */

type NormalJar = Extract<Jar, { kind: "normal" }>;

const LINKED_HREF: Record<string, string> = {
  debt: "/m/deudas",
  goal: "/m/metas",
  holding: "/m/patrimonio",
  policy: "/m/proteccion",
};

/**
 * Icono monolínea de un frasco. Los frascos vinculados se derivan de su `linkedKind`
 * (dato duro); los normales, del `icon` de la categoría — el nombre que sembró el sistema
 * (`home`, `car`, …) o el que eligió el hogar al personalizarla (FORK_ICONS). Antes todos
 * los frascos normales compartían un mismo glifo genérico.
 */
const JAR_ICON: Record<string, MIconName> = {
  // semillas de los frascos de sistema
  home: "housing",
  car: "transport",
  food: "food",
  heart: "health",
  sparkles: "leisure",
  book: "education",
  bank: "income",
  dots: "template",
  invest: "investment",
  debt: "debt",
  defense: "protection",
  savings: "goal",
  // iconos que ofrece la personalización del hogar (ForkCategoryForm)
  budget: "rules",
  expense: "food",
  spark: "leisure",
  profile: "household",
  networth: "portfolio",
};

function jarIcon(jar: Jar): MIconName {
  if (jar.kind === "linked") {
    if (jar.linkedKind === "debt") return "debt";
    if (jar.linkedKind === "goal") return "goal";
    if (jar.linkedKind === "holding") return "investment";
    return "protection";
  }
  return JAR_ICON[jar.icon] ?? "template";
}

/**
 * Nivel de ejecución de un presupuesto → tono (verde vas bien · ámbar te acercas ·
 * rojo te pasaste). Es presentación pura: no cambia ningún dato ni ningún cálculo.
 */
function levelTone(spent: number, budget: number): MTone {
  if (budget <= 0) return "neutral";
  const ratio = spent / budget;
  if (ratio > 1) return "danger";
  if (ratio >= 0.85) return "warning";
  return "success";
}

/** Total gastado/presupuestado de un frasco (normal = suma de sobres; vinculado = totals). */
function jarTotals(jar: Jar): { spent: number; budget: number } {
  if (jar.kind === "normal") {
    return jar.envelopes.reduce(
      (acc, e) => ({ spent: acc.spent + e.spent, budget: acc.budget + e.budget }),
      { spent: 0, budget: 0 },
    );
  }
  if (jar.totals) return { spent: jar.totals.spent, budget: jar.totals.budget };
  return jar.items.reduce(
    (acc, it) => ({ spent: acc.spent + (it.spent ?? 0), budget: acc.budget + (it.budget ?? 0) }),
    { spent: 0, budget: 0 },
  );
}

export function GastosManager({
  jars,
  currency,
  accounts,
  period,
  categoryMeta,
  canPersonalize,
  personalization,
}: {
  jars: Jar[];
  currency: string;
  accounts: Account[];
  period: Period;
  /** Metadatos por categoría (sistema/favorito/icono/color/nombre): decide qué es editable/personalizable. */
  categoryMeta: Record<string, CatMeta>;
  /** Personalización por hogar (Fase 3): puede el usuario editar + estado (ocultas/forks). */
  canPersonalize: boolean;
  personalization: CategoryPersonalization;
}) {
  const router = useRouter();
  const toast = useToast();
  const [addingSpend, setAddingSpend] = useState(false);
  const [detailJar, setDetailJar] = useState<NormalJar | null>(null);
  const [creatingSobreIn, setCreatingSobreIn] = useState<string | null>(null); // jar.group
  const [editingEnv, setEditingEnv] = useState<JarEnvelope | null>(null);
  // Gestión de sobre del USUARIO: menú de acciones, editar (nombre/favorito), eliminar (con reasignación).
  const [managingSobre, setManagingSobre] = useState<JarEnvelope | null>(null);
  const [editingSobre, setEditingSobre] = useState<JarEnvelope | null>(null);
  const [deletingSobre, setDeletingSobre] = useState<JarEnvelope | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [sobrePending, setSobrePending] = useState(false);
  // Personalización (Fase 3): forkear / ocultar / revertir un frasco o sobre BASE + ver ocultas.
  const [forkingTarget, setForkingTarget] = useState<PersonalizeTarget | null>(null);
  const [hidingTarget, setHidingTarget] = useState<{ id: string; name: string; hasMovements: boolean } | null>(null);
  const [revertingTarget, setRevertingTarget] = useState<{ baseId: string; name: string } | null>(null);
  const [revertPending, setRevertPending] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  /** ¿La categoría visible es una copia (fork) del hogar? → su base para revertir. */
  const forkBaseOf = (id: string): string | null => personalization.forkToBase[id] ?? null;
  const isSystemCat = (id: string) => categoryMeta[id]?.isSystem ?? true;
  /** Objetivo de personalización (icono/color/favorito) desde la meta. */
  const targetFrom = (id: string, name: string): PersonalizeTarget => ({
    id,
    name,
    isFavorite: categoryMeta[id]?.isFavorite ?? false,
    icon: categoryMeta[id]?.icon ?? null,
    color: categoryMeta[id]?.color ?? null,
  });

  /** Opciones de reasignación al ocultar: cualquier otro sobre, agrupado por frasco. */
  const hideReassignOpts = (excludeId: string) => [
    { value: "", label: "Sin reasignar (quedan sin categoría)" },
    ...jars
      .filter((j): j is NormalJar => j.kind === "normal")
      .flatMap((j) =>
        j.envelopes
          .filter((e) => e.id !== excludeId)
          .map((e) => ({ value: e.id, label: `${j.name} · ${e.name}` })),
      ),
  ];

  const confirmRevert = async () => {
    if (!revertingTarget) return;
    setRevertPending(true);
    // Deshace fork (unfork) o re-muestra base oculta (unhide); ambos reciben la base.
    const res = await unforkCategoryAction({ baseId: revertingTarget.baseId });
    setRevertPending(false);
    if (res.ok) {
      toast.show("Personalización revertida", "success");
      setRevertingTarget(null);
      setDetailJar(null);
      setManagingSobre(null);
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo revertir.", "error");
    }
  };

  const confirmDeleteSobre = async () => {
    if (!deletingSobre) return;
    setSobrePending(true);
    const res = await removeCategoryAction({ id: deletingSobre.id, reassignToId: reassignTo || null });
    setSobrePending(false);
    if (res.ok) {
      toast.show(reassignTo ? "Sobre eliminado (movimientos reasignados)" : "Sobre eliminado", "success");
      setDeletingSobre(null);
      setReassignTo("");
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo eliminar el sobre.", "error");
    }
  };

  // Destinos de reasignación: cualquier otro sobre (de cualquier frasco), agrupado por frasco.
  const reassignOpts = deletingSobre
    ? [
        { value: "", label: "Sin reasignar (quedan sin categoría)" },
        ...jars
          .filter((j): j is NormalJar => j.kind === "normal")
          .flatMap((j) =>
            j.envelopes
              .filter((e) => e.id !== deletingSobre.id)
              .map((e) => ({ value: e.id, label: `${j.name} · ${e.name}` })),
          ),
      ]
    : [];

  const totals = jars.reduce(
    (acc, j) => {
      const t = jarTotals(j);
      return { spent: acc.spent + t.spent, budget: acc.budget + t.budget };
    },
    { spent: 0, budget: 0 },
  );
  const pct = totals.budget > 0 ? Math.min(1, totals.spent / totals.budget) : 0;
  const available = totals.budget - totals.spent;
  const totalTone = levelTone(totals.spent, totals.budget);
  const totalPct = totals.budget > 0 ? Math.round((totals.spent / totals.budget) * 100) : null;
  // Muestra los frascos siempre que existan (aunque sin presupuesto): son el punto de
  // entrada para crear sobres y registrar gastos, igual que la web.
  const anyData = jars.length > 0;

  return (
    <>
      {/* Resumen del mes: gastado (exacto) + % de ejecución + cuánto queda */}
      <MSummaryCard
        eyebrow="Gastado del mes"
        // Exacto mientras quepa en una línea a 320px (~11 caracteres); más allá, abreviado:
        // "₡12,3 M" se lee, "₡12,345,67…" cortado se malinterpreta.
        value={mAmount(totals.spent, currency, 11)}
        tone={totalTone === "danger" ? "danger" : "neutral"}
        chip={totalPct != null ? <MChip tone={totalTone}>{totalPct}%</MChip> : undefined}
        sub={
          totals.budget > 0
            ? available >= 0
              ? `Te quedan ${formatMoney(available, currency)} de ${formatMoney(totals.budget, currency)} presupuestados.`
              : `Vas ${formatMoney(-available, currency)} por encima de los ${formatMoney(totals.budget, currency)} presupuestados.`
            : "Aún no has presupuestado este mes. Abre un frasco para asignarle un monto."
        }
        slot={totals.budget > 0 ? <MProgress value={pct} tone={totalTone} height={9} /> : undefined}
        style={{ marginBottom: 16 }}
      />

      {/* Frascos */}
      {!anyData ? (
        <MEmptyState
          icon="template"
          title="Empieza por tu primer gasto"
          description="Tus frascos agrupan lo que gastas por categoría: al registrar un gasto verás en qué se va el mes y cuánto te queda."
          actionLabel="Registrar gasto"
          onAction={() => setAddingSpend(true)}
        />
      ) : (
        <>
          <MSectionHeader title="Frascos del mes" />
          {jars.map((jar) => (
            <JarCard key={jar.group} jar={jar} currency={currency} onOpen={jar.kind === "normal" ? () => setDetailJar(jar) : undefined} />
          ))}
        </>
      )}

      {/* Categorías ocultas del hogar → volver a mostrarlas (solo editores) */}
      {canPersonalize && personalization.hidden.length > 0 ? (
        <button
          type="button"
          className="m-btn m-btn-block m-btn-ghost"
          style={{ marginTop: 4 }}
          onClick={() => setShowHidden(true)}
        >
          Ver categorías removidas ({personalization.hidden.length})
        </button>
      ) : null}

      <Fab onClick={() => setAddingSpend(true)} label="Registrar gasto" />

      {/* Registrar gasto (global) */}
      <BottomSheet open={addingSpend} onClose={() => setAddingSpend(false)} title="Registrar gasto">
        <AddSpendForm jars={jars} currency={currency} accounts={accounts} onSuccess={() => setAddingSpend(false)} />
      </BottomSheet>

      {/* Detalle de un frasco: sobres + editar presupuesto + crear sobre */}
      <BottomSheet open={!!detailJar} onClose={() => setDetailJar(null)} title={detailJar?.name ?? "Frasco"}>
        {detailJar ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              {detailJar.envelopes.map((e) => {
                const eTone = levelTone(e.spent, e.budget);
                const ep = e.budget > 0 ? Math.min(1, e.spent / e.budget) : 0;
                const budgetSub = e.budget > 0 ? `de ${mAmount(e.budget, currency)}` : "Sin presupuesto";
                return (
                  <MDataRow
                    key={e.id}
                    title={e.name}
                    subtitle={forkBaseOf(e.id) ? `Personalizado · ${budgetSub}` : budgetSub}
                    value={mAmount(e.spent, currency)}
                    valueTone={eTone}
                    trailing={
                      <span className="row" style={{ gap: 2, flex: "none" }}>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Editar presupuesto de ${e.name}`}
                          onClick={() => setEditingEnv(e)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        {/* Editores del hogar: kebab de personalización en TODO sobre normal. */}
                        {canPersonalize ? (
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Opciones de ${e.name}`}
                            onClick={() => setManagingSobre(e)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          </button>
                        ) : null}
                      </span>
                    }
                    slot={e.budget > 0 ? <MProgress value={ep} tone={eTone} height={6} /> : undefined}
                  />
                );
              })}
            </div>
            <button
              type="button"
              className="m-btn m-btn-block m-btn-secondary"
              style={{ marginTop: 2 }}
              onClick={() => setCreatingSobreIn(detailJar.group)}
            >
              + Crear sobre en {detailJar.name}
            </button>

            {/* Personalización del FRASCO (editores del hogar) */}
            {canPersonalize ? (
              <div
                style={{
                  marginTop: 6,
                  paddingTop: 10,
                  borderTop: "1px solid var(--border)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div className="ov">Personalizar frasco</div>
                {forkBaseOf(detailJar.group) ? (
                  <button
                    type="button"
                    className="m-btn m-btn-block m-btn-secondary"
                    onClick={() =>
                      setRevertingTarget({ baseId: forkBaseOf(detailJar.group)!, name: detailJar.name })
                    }
                  >
                    Revertir personalización
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="m-btn m-btn-block m-btn-secondary"
                      onClick={() => setForkingTarget(targetFrom(detailJar.group, detailJar.name))}
                    >
                      Personalizar (editar)
                    </button>
                    <button
                      type="button"
                      className="m-btn m-btn-block m-btn-secondary"
                      onClick={() =>
                        setHidingTarget({
                          id: detailJar.group,
                          name: detailJar.name,
                          hasMovements: detailJar.envelopes.some((e) => e.spent > 0 || e.budget > 0),
                        })
                      }
                    >
                      Remover frasco
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </BottomSheet>

      {/* Crear sobre (encima del detalle) */}
      <BottomSheet open={!!creatingSobreIn} onClose={() => setCreatingSobreIn(null)} title="Nuevo sobre">
        {creatingSobreIn ? (
          <CreateSobreForm
            jarGroup={creatingSobreIn}
            currency={currency}
            period={period}
            onSuccess={() => setCreatingSobreIn(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Editar presupuesto de un sobre (3 checks + líneas derivadas) */}
      <BottomSheet open={!!editingEnv} onClose={() => setEditingEnv(null)} title="Editar presupuesto">
        {editingEnv ? (
          <BudgetEditForm
            envelope={editingEnv}
            currency={currency}
            period={period}
            onSuccess={() => setEditingEnv(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Acciones de un sobre: usuario (editar/eliminar) · fork (editar/revertir) · base (personalizar/ocultar) */}
      <BottomSheet open={!!managingSobre} onClose={() => setManagingSobre(null)} title={managingSobre?.name ?? "Sobre"}>
        {managingSobre ? (
          (() => {
            const m = managingSobre;
            const forkBase = forkBaseOf(m.id);
            if (forkBase) {
              // Sobre forkeado: editar la copia o revertir a la base.
              return (
                <div style={{ display: "grid", gap: 10 }}>
                  <button
                    type="button"
                    className="m-btn m-btn-block m-btn-secondary"
                    onClick={() => {
                      setEditingSobre(m);
                      setManagingSobre(null);
                    }}
                  >
                    Editar copia (nombre / favorito)
                  </button>
                  <button
                    type="button"
                    className="m-btn m-btn-block m-btn-secondary"
                    onClick={() => {
                      setRevertingTarget({ baseId: forkBase, name: m.name });
                      setManagingSobre(null);
                    }}
                  >
                    Revertir personalización
                  </button>
                </div>
              );
            }
            if (isSystemCat(m.id)) {
              // Sobre BASE de sistema: personalizar (fork) u ocultar.
              return (
                <div style={{ display: "grid", gap: 10 }}>
                  <button
                    type="button"
                    className="m-btn m-btn-block m-btn-secondary"
                    onClick={() => {
                      setForkingTarget(targetFrom(m.id, m.name));
                      setManagingSobre(null);
                    }}
                  >
                    Personalizar (editar)
                  </button>
                  <button
                    type="button"
                    className="m-btn m-btn-block m-btn-secondary"
                    onClick={() => {
                      setHidingTarget({ id: m.id, name: m.name, hasMovements: m.spent > 0 || m.budget > 0 });
                      setManagingSobre(null);
                    }}
                  >
                    Remover
                  </button>
                </div>
              );
            }
            // Sobre del USUARIO: editar / eliminar (comportamiento previo).
            return (
              <div style={{ display: "grid", gap: 10 }}>
                <button
                  type="button"
                  className="m-btn m-btn-block m-btn-secondary"
                  onClick={() => {
                    setEditingSobre(m);
                    setManagingSobre(null);
                  }}
                >
                  Editar sobre (nombre / favorito)
                </button>
                <button
                  type="button"
                  className="m-btn m-btn-block m-btn-danger"
                  onClick={() => {
                    setReassignTo("");
                    setDeletingSobre(m);
                    setManagingSobre(null);
                  }}
                >
                  Eliminar sobre
                </button>
              </div>
            );
          })()
        ) : null}
      </BottomSheet>

      {/* Editar sobre (nombre + favorito) → editCategoryAction */}
      <BottomSheet open={!!editingSobre} onClose={() => setEditingSobre(null)} title="Editar sobre">
        {editingSobre ? (
          <EditSobreForm
            envelope={editingSobre}
            initialFavorite={categoryMeta[editingSobre.id]?.isFavorite ?? true}
            onSuccess={() => setEditingSobre(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Eliminar sobre (con reasignación opcional) → removeCategoryAction */}
      <BottomSheet open={!!deletingSobre} onClose={() => setDeletingSobre(null)} title="Eliminar sobre">
        {deletingSobre ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Se eliminará el sobre <strong>{deletingSobre.name}</strong>.
              {deletingSobre.spent > 0 || deletingSobre.budget > 0
                ? " Tiene movimientos o presupuesto: elige a dónde reasignarlos para no perder el histórico (o déjalo sin reasignar y quedarán sin categoría)."
                : " No tiene movimientos ni presupuesto."}
            </div>
            {deletingSobre.spent > 0 || deletingSobre.budget > 0 ? (
              <SheetSelect
                name="reassignTo"
                label="Reasignar a (opcional)"
                value={reassignTo}
                onChange={setReassignTo}
                options={reassignOpts}
                sheetTitle="Reasignar movimientos a"
              />
            ) : null}
            <button
              type="button"
              className="m-btn m-btn-block m-btn-danger"
              disabled={sobrePending}
              onClick={confirmDeleteSobre}
            >
              {sobrePending ? "Eliminando…" : "Eliminar sobre"}
            </button>
          </div>
        ) : null}
      </BottomSheet>

      {/* Personalizar (fork) un frasco/sobre base → forkCategoryAction */}
      <BottomSheet open={!!forkingTarget} onClose={() => setForkingTarget(null)} title="Personalizar categoría">
        {forkingTarget ? (
          <ForkCategoryForm target={forkingTarget} onSuccess={() => setForkingTarget(null)} />
        ) : null}
      </BottomSheet>

      {/* Ocultar un frasco/sobre base → hideCategoryAction (con reasignación opcional) */}
      <BottomSheet open={!!hidingTarget} onClose={() => setHidingTarget(null)} title="Remover categoría">
        {hidingTarget ? (
          <HideCategoryForm
            target={{ id: hidingTarget.id, name: hidingTarget.name }}
            hasMovements={hidingTarget.hasMovements}
            reassignOpts={hideReassignOpts(hidingTarget.id)}
            onSuccess={() => setHidingTarget(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Categorías ocultas del hogar → Mostrar (unhideCategoryAction) */}
      <BottomSheet open={showHidden} onClose={() => setShowHidden(false)} title="Categorías removidas">
        <div style={{ display: "grid", gap: 10 }}>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            Estas categorías base están removidas para todo tu hogar. Vuelve a mostrarlas cuando quieras.
          </div>
          {personalization.hidden.map((h) => (
            <div key={h.id} className="between" style={{ gap: 10 }}>
              <span style={{ fontSize: 14 }}>{h.name}</span>
              <button
                type="button"
                className="m-btn m-btn-secondary"
                style={{ flex: "none" }}
                onClick={async () => {
                  const res = await unhideCategoryAction({ baseId: h.id });
                  if (res.ok) {
                    toast.show(`"${h.name}" restaurada`, "success");
                    router.refresh();
                  } else {
                    toast.show(res.message ?? "No se pudo restaurar.", "error");
                  }
                }}
              >
                Mostrar
              </button>
            </div>
          ))}
        </div>
      </BottomSheet>

      {/* Revertir personalización (unfork / unhide) */}
      <ConfirmDialog
        open={!!revertingTarget}
        title="Revertir personalización"
        message={
          revertingTarget
            ? `"${revertingTarget.name}" volverá a su versión original del sistema para todo el hogar.`
            : undefined
        }
        variant="warning"
        confirmLabel="Revertir"
        pending={revertPending}
        onConfirm={confirmRevert}
        onCancel={() => setRevertingTarget(null)}
      />
    </>
  );
}

/**
 * Tarjeta de un frasco: icono + nombre + % por nivel + gastado (abreviado si es largo)
 * sobre presupuesto, barra de progreso y sus sobres como filas de datos. Los frascos
 * normales abren su detalle al tocarlos; los vinculados llevan al módulo dueño.
 */
function JarCard({ jar, currency, onOpen }: { jar: Jar; currency: string; onOpen?: () => void }) {
  const { spent, budget } = jarTotals(jar);
  const tone = levelTone(spent, budget);
  const pct = budget > 0 ? Math.min(1, spent / budget) : 0;
  const pctLabel = budget > 0 ? `${Math.round((spent / budget) * 100)}%` : null;
  const sub =
    jar.kind === "normal"
      ? `${jar.envelopes.length} ${jar.envelopes.length === 1 ? "sobre" : "sobres"} · toca para gestionar`
      : "Pagos del mes";

  const body = (
    <>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        {/* El tile está en calma (tinte de marca sobre neutro) y solo se enciende
            cuando el frasco pide atención: ámbar cerca del límite, rojo pasado. */}
        <span
          className={`m-dic${tone === "danger" ? " m-dic-danger" : tone === "warning" ? " m-dic-warning" : ""}`}
          style={{ width: 44, height: 44, borderRadius: 13 }}
          aria-hidden
        >
          <MIcon name={jarIcon(jar)} size={21} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span
              style={{ fontWeight: 700, fontSize: 15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {jar.name}
            </span>
            {pctLabel ? <MChip tone={tone}>{pctLabel}</MChip> : null}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {sub}
          </div>
        </div>
        <div style={{ flex: "none", textAlign: "right" }}>
          {/* El gastado solo se tiñe cuando duele (rojo): en verde sería ruido. */}
          <div className={`mono ${tone === "danger" ? TONE_TEXT.danger : ""}`} style={{ fontSize: 14 }}>
            {mAmount(spent, currency)}
          </div>
          {budget > 0 ? (
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              de {mAmount(budget, currency)}
            </div>
          ) : null}
        </div>
      </div>

      {budget > 0 ? (
        <div style={{ marginTop: 12 }}>
          <MProgress value={pct} tone={tone} />
        </div>
      ) : null}

      {/* Los sobres aquí son una VISTA PREVIA (se gestionan en el detalle del frasco):
          una línea por sobre — gastado sobre presupuesto — para que quepan varios
          frascos en pantalla. El detalle sí usa filas completas y tocables. */}
      <div style={{ marginTop: 4 }}>
        {jar.kind === "normal"
          ? jar.envelopes.map((e) => (
              <MDataRow
                key={e.id}
                dense
                title={e.name}
                value={
                  e.budget > 0 ? (
                    <>
                      {mAmount(e.spent, currency)}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        {" "}
                        / {mAmount(e.budget, currency)}
                      </span>
                    </>
                  ) : (
                    mAmount(e.spent, currency)
                  )
                }
                valueTone={levelTone(e.spent, e.budget)}
              />
            ))
          : jar.items.map((it) => (
              <MDataRow key={it.id} dense title={it.name} subtitle={it.sub} value={it.amount} />
            ))}
      </div>

      {jar.kind === "linked" && LINKED_HREF[jar.linkedKind] && (
        <Link href={LINKED_HREF[jar.linkedKind]!} className="jar-link" onClick={(ev) => ev.stopPropagation()}>
          {jar.cta.label}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      )}
    </>
  );

  return (
    <MContentCard
      onClick={onOpen}
      ariaLabel={onOpen ? `Gestionar ${jar.name}` : undefined}
      style={{ marginBottom: 12 }}
    >
      {body}
    </MContentCard>
  );
}
