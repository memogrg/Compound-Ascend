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
  // Muestra los frascos siempre que existan (aunque sin presupuesto): son el punto de
  // entrada para crear sobres y registrar gastos, igual que la web.
  const anyData = jars.length > 0;

  return (
    <>
      {/* Resumen del mes */}
      <div className="card card-p" style={{ marginBottom: 16 }}>
        <div className="between" style={{ marginBottom: 10 }}>
          <span className="ov">Gastado del mes</span>
          <span className="mono" style={{ fontSize: 12.5 }}>
            {formatMoney(totals.spent, currency)} / {formatMoney(totals.budget, currency)}
          </span>
        </div>
        <div className="bar" style={{ height: 9 }}>
          <i style={{ width: `${Math.round(pct * 100)}%`, background: totals.spent > totals.budget ? "var(--danger)" : "var(--accent)" }} />
        </div>
        <div className="between" style={{ marginTop: 10 }}>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {available >= 0 ? `Disponible ${formatMoney(available, currency)}` : `Excedido ${formatMoney(-available, currency)}`}
          </span>
        </div>
      </div>

      {/* Frascos */}
      {!anyData ? (
        <div className="card card-p">
          <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            Aún no tienes presupuesto por categorías. Toca “Registrar gasto” o crea un sobre para empezar.
          </div>
        </div>
      ) : (
        jars.map((jar) => (
          <JarCard key={jar.group} jar={jar} currency={currency} onOpen={jar.kind === "normal" ? () => setDetailJar(jar) : undefined} />
        ))
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
            {detailJar.envelopes.map((e) => {
              const over = e.spent > e.budget && e.budget > 0;
              const ep = e.budget > 0 ? Math.min(100, Math.round((e.spent / e.budget) * 100)) : 0;
              return (
                <div key={e.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
                  <div className="between" style={{ marginBottom: 6, gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      {e.name}
                      {forkBaseOf(e.id) ? (
                        <span className="badge neutral" style={{ marginLeft: 6 }}>
                          personalizado
                        </span>
                      ) : null}
                    </span>
                    <div className="row" style={{ gap: 8, flex: "none", alignItems: "center" }}>
                      <span className="mono muted" style={{ fontSize: 12 }} data-over={over ? "1" : undefined}>
                        {formatMoney(e.spent, currency)} / {formatMoney(e.budget, currency)}
                      </span>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Editar presupuesto"
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
                          aria-label="Opciones del sobre"
                          onClick={() => setManagingSobre(e)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                            <circle cx="12" cy="5" r="1" />
                            <circle cx="12" cy="12" r="1" />
                            <circle cx="12" cy="19" r="1" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="bar" style={{ height: 6 }}>
                    <i style={{ width: `${ep}%`, background: over ? "var(--danger)" : "var(--accent)" }} />
                  </div>
                </div>
              );
            })}
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

function JarCard({ jar, currency, onOpen }: { jar: Jar; currency: string; onOpen?: () => void }) {
  const { spent, budget } = jarTotals(jar);
  const over = spent > budget && budget > 0;
  const pct = budget > 0 ? Math.min(1, spent / budget) : 0;
  const sub =
    jar.kind === "normal"
      ? `${jar.envelopes.length} ${jar.envelopes.length === 1 ? "sobre" : "sobres"} · toca para gestionar`
      : "Pagos del mes";

  return (
    <div
      className="jar"
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen(); } } : undefined}
      style={onOpen ? { cursor: "pointer" } : undefined}
    >
      <div className="jar-top">
        <span
          className="jar-ic"
          style={over ? { background: "var(--danger-soft)", color: "var(--danger)" } : { background: "var(--accent-soft)", color: "var(--accent)" }}
          aria-hidden
        >
          <JarIcon jar={jar} />
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {jar.name}
            {over && <span className="badge down" style={{ marginLeft: 6 }}>{Math.round((spent / budget) * 100)}%</span>}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{sub}</div>
        </div>
        <div className="jar-amt">
          <div className={`a${over ? " neg" : ""}`}>{formatMoney(spent, currency)}</div>
          {budget > 0 ? <div className="b">de {formatMoney(budget, currency)}</div> : null}
        </div>
      </div>

      {budget > 0 && (
        <div className="bar" style={{ height: 7, marginTop: 12 }}>
          <i style={{ width: `${Math.round(pct * 100)}%`, background: over ? "var(--danger)" : "var(--accent)" }} />
        </div>
      )}

      {jar.kind === "normal"
        ? jar.envelopes.map((e) => (
            <div className="sobre" key={e.id}>
              <span className="sn">{e.name}</span>
              <span className="sv" style={e.spent > e.budget && e.budget > 0 ? { color: "var(--danger)" } : undefined}>
                {formatMoney(e.spent, currency)} / {formatMoney(e.budget, currency)}
              </span>
            </div>
          ))
        : jar.items.map((it) => (
            <div className="sobre" key={it.id}>
              <span className="sn">{it.name}</span>
              <span className="sv">{it.amount}</span>
            </div>
          ))}

      {jar.kind === "linked" && LINKED_HREF[jar.linkedKind] && (
        <Link href={LINKED_HREF[jar.linkedKind]!} className="jar-link" onClick={(ev) => ev.stopPropagation()}>
          {jar.cta.label}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      )}
    </div>
  );
}

function JarIcon({ jar }: { jar: Jar }) {
  const kind = jar.kind === "linked" ? jar.linkedKind : "normal";
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (kind === "debt") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
      </svg>
    );
  }
  if (kind === "goal") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    );
  }
  if (kind === "holding") {
    return (
      <svg {...common}>
        <path d="M3 17l6-6 4 4 8-9M14 6h6v6" />
      </svg>
    );
  }
  if (kind === "policy") {
    return (
      <svg {...common}>
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />
      <path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2" />
      <path d="M7 3v2M11 3v2" />
    </svg>
  );
}
