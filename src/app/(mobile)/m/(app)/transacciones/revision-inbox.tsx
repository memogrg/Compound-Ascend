"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { formatMoney } from "@/lib/format";
import {
  confirmIngestProposalAction,
  discardIngestProposalAction,
  assignCategoryAction,
  linkTransactionAction,
  markReviewedAction,
  type ActionResult,
} from "@/modules/financial-base/api/v2-actions";
import {
  categoryMatchesKind,
  type SelectableCategory,
} from "@/modules/financial-base/engine/classify";
import type {
  UnlinkedCandidate,
  EntityAlert,
} from "@/modules/financial-base/engine/reconciliation";
import type { PendingProposalView } from "@/modules/financial-base/services/ingest-proposals-view";
import {
  MContentCard,
  MSectionHeader,
  MChip,
  MEmptyState,
} from "../../components/content-kit";
import type { LinkableEntities } from "@/modules/financial-base/services/linkable-entities-service";
import type { Transaction } from "@/modules/financial-base/types";

import { BottomSheet, ConfirmDialog, useToast } from "../../components/form-kit";

/**
 * Bandeja "Por ordenar" de /m/transacciones — paridad con la web:
 *  · Por revisar: propuestas de ingesta (confirmar / descartar).
 *  · Por clasificar: movimientos sin sobre (asignar categoría).
 *  · Conciliar: movimientos sin vínculo (vincular a deuda/meta/inversión/póliza/alquiler)
 *    + alertas plan-vs-real por entidad.
 * "Marcar revisada" aparece en las filas cuyo movimiento está en pending_review.
 *
 * Consume EXACTAMENTE las Server Actions de la web (v2-actions); cero backend nuevo. Tras cada
 * acción hace router.refresh() (la página es force-dynamic) y muestra toast en español.
 */

const KIND_LABEL: Record<string, string> = {
  debt: "Deuda",
  goal: "Meta",
  holding: "Inversión",
  policy: "Póliza",
  rental: "Alquiler",
};

const ALERT_LABEL: Record<string, string> = {
  sin_movimiento: "Sin movimiento",
  parcial: "Parcial",
  excedido: "Excedido",
  cumplido: "Cumplido",
};

const SM_BTN: React.CSSProperties = { padding: "7px 11px", fontSize: 12.5 };
const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 0",
  borderTop: "1px solid var(--border)",
};
const TTL: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 13.5,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const AMT: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap" };

/** Etiqueta legible de un movimiento (comercio/descripción, con fallback). */
function txnLabel(t: Transaction): string {
  return t.merchantOrSource || t.description || "Movimiento";
}

/** dd mmm (es-MX) a partir de yyyy-mm-dd. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function RevisionInbox({
  proposals,
  uncategorized,
  categories,
  candidates,
  linkables,
  alerts,
}: {
  proposals: PendingProposalView[];
  uncategorized: Transaction[];
  categories: SelectableCategory[];
  candidates: UnlinkedCandidate[];
  linkables: LinkableEntities;
  alerts: EntityAlert[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  // Ocultado optimista: la fila desaparece al resolverse, sin esperar al refresh.
  const [done, setDone] = useState<Set<string>>(new Set());
  const [discard, setDiscard] = useState<PendingProposalView | null>(null);
  const [classify, setClassify] = useState<Transaction | null>(null);
  const [link, setLink] = useState<UnlinkedCandidate | null>(null);

  const visibleProposals = proposals.filter((p) => !done.has(p.id));
  const visibleUncat = uncategorized.filter((t) => !done.has(t.id));
  const visibleCandidates = candidates.filter((c) => !done.has(c.transaction.id)).slice(0, 6);
  // Solo las accionables (lo cumplido no requiere atención).
  const visibleAlerts = alerts.filter((a) => a.status !== "cumplido");

  const totalPendiente = visibleProposals.length + visibleUncat.length + visibleCandidates.length;

  /** Ejecuta una acción, oculta la fila si sale bien y refresca. Toast en español. */
  function run(fn: () => Promise<ActionResult>, okMsg: string, hideId?: string) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          if (hideId) setDone((prev) => new Set(prev).add(hideId));
          toast.show(okMsg, "success");
          router.refresh();
        } else {
          toast.show(res.message ?? "No pudimos completar la acción.", "error");
        }
      } catch {
        toast.show("No pudimos completar la acción.", "error");
      }
    });
  }

  // Nada pendiente y sin alertas → estado vacío celebratorio (no una nota seca).
  if (totalPendiente === 0 && visibleAlerts.length === 0) {
    return (
      <div style={{ marginBottom: 16 }}>
        <MSectionHeader title="Por ordenar" />
        <MEmptyState
          icon="goal"
          title="Todo conciliado"
          description="No te queda nada por revisar, clasificar ni vincular. Cuando llegue algo, aparecerá aquí."
        />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <MSectionHeader
        title="Por ordenar"
        action={totalPendiente > 0 ? <MChip tone="warning">{totalPendiente}</MChip> : undefined}
      />

      {/* ── Por revisar: propuestas de ingesta ─────────────────────────── */}
      {visibleProposals.length > 0 && (
        <Block
          title="Por revisar"
          n={visibleProposals.length}
          hint="Propuestas detectadas en tus correos del banco."
        >
          {visibleProposals.map((p) => (
            <div key={p.id} style={ROW}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={TTL}>{p.merchant || "Movimiento"}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {shortDate(p.occurredOn)}
                  {p.cardLabel ? ` · ${p.cardLabel}` : ""}
                </div>
              </div>
              <div className={`mono ${p.kind === "ingreso" ? "pos" : "neg"}`} style={AMT}>
                {formatMoney(p.amount, p.currency)}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="m-btn"
                  style={SM_BTN}
                  disabled={pending}
                  onClick={() =>
                    run(() => confirmIngestProposalAction(p.id), "Movimiento confirmado", p.id)
                  }
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  className="m-btn m-btn-secondary"
                  style={SM_BTN}
                  disabled={pending}
                  onClick={() => setDiscard(p)}
                >
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </Block>
      )}

      {/* ── Por clasificar: movimientos sin sobre ──────────────────────── */}
      {visibleUncat.length > 0 && (
        <Block
          title="Por clasificar"
          n={visibleUncat.length}
          hint="Movimientos sin sobre. Asígnales una categoría."
        >
          {visibleUncat.map((t) => (
            <div key={t.id} style={ROW}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={TTL}>{txnLabel(t)}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {shortDate(t.occurredOn)}
                </div>
              </div>
              <div className={`mono ${t.kind === "ingreso" ? "pos" : "neg"}`} style={AMT}>
                {formatMoney(t.amount, t.currency)}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="m-btn"
                  style={SM_BTN}
                  disabled={pending}
                  onClick={() => setClassify(t)}
                >
                  Clasificar
                </button>
                {t.status === "pending_review" && (
                  <button
                    type="button"
                    className="m-btn m-btn-secondary"
                    style={SM_BTN}
                    disabled={pending}
                    onClick={() => run(() => markReviewedAction(t.id), "Marcada revisada")}
                  >
                    Revisada
                  </button>
                )}
              </div>
            </div>
          ))}
        </Block>
      )}

      {/* ── Conciliar: sin vincular + alertas plan-vs-real ─────────────── */}
      {(visibleCandidates.length > 0 || visibleAlerts.length > 0) && (
        <Block
          title="Conciliar"
          n={visibleCandidates.length}
          hint="Movimientos que parecen de una deuda, meta o inversión."
        >
          {visibleCandidates.map((c) => (
            <div key={c.transaction.id} style={ROW}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={TTL}>{txnLabel(c.transaction)}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {shortDate(c.transaction.occurredOn)} · sugerido:{" "}
                  {KIND_LABEL[c.suggestedKind] ?? c.suggestedKind}
                </div>
              </div>
              <div
                className={`mono ${c.transaction.kind === "ingreso" ? "pos" : "neg"}`}
                style={AMT}
              >
                {formatMoney(c.transaction.amount, c.transaction.currency)}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="m-btn"
                  style={SM_BTN}
                  disabled={pending}
                  onClick={() => setLink(c)}
                >
                  Vincular
                </button>
                {c.transaction.status === "pending_review" && (
                  <button
                    type="button"
                    className="m-btn m-btn-secondary"
                    style={SM_BTN}
                    disabled={pending}
                    onClick={() =>
                      run(() => markReviewedAction(c.transaction.id), "Marcada revisada")
                    }
                  >
                    Revisada
                  </button>
                )}
              </div>
            </div>
          ))}

          {visibleAlerts.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 2 }}>
                Plan vs. real de tus entidades
              </div>
              {visibleAlerts.map((a) => (
                <div key={`${a.sourceKind}:${a.sourceId}`} style={ROW}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={TTL}>{a.name}</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      Plan {formatMoney(a.planned, a.currency)} · real{" "}
                      {formatMoney(a.real, a.currency)}
                    </div>
                  </div>
                  <span
                    className={`m-chip ${a.status === "excedido" ? "neg" : ""}`}
                    style={{ fontSize: 11, whiteSpace: "nowrap" }}
                  >
                    {ALERT_LABEL[a.status] ?? a.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Block>
      )}

      {/* Descartar propuesta (confirmación) */}
      <ConfirmDialog
        open={discard !== null}
        title="¿Descartar la propuesta?"
        message={
          discard
            ? `Se descartará "${discard.merchant || "el movimiento"}" por ${formatMoney(discard.amount, discard.currency)}. No se creará ninguna transacción.`
            : undefined
        }
        confirmLabel="Descartar"
        cancelLabel="Cancelar"
        pending={pending}
        onCancel={() => setDiscard(null)}
        onConfirm={() => {
          const p = discard;
          setDiscard(null);
          if (p) run(() => discardIngestProposalAction(p.id), "Propuesta descartada", p.id);
        }}
      />

      {/* Asignar sobre (categoría) */}
      <BottomSheet open={classify !== null} title="Asignar sobre" onClose={() => setClassify(null)}>
        {classify && (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="muted" style={{ fontSize: 13 }}>
              {txnLabel(classify)} · {formatMoney(classify.amount, classify.currency)}
            </div>
            {categories
              .filter((c) =>
                categoryMatchesKind(
                  c.categoryType,
                  classify.kind === "ingreso" ? "ingreso" : "gasto",
                ),
              )
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="m-btn m-btn-block m-btn-secondary"
                  style={{ justifyContent: "flex-start" }}
                  disabled={pending}
                  onClick={() => {
                    const t = classify;
                    setClassify(null);
                    run(
                      () => assignCategoryAction({ transactionId: t.id, categoryId: c.id }),
                      "Sobre asignado",
                      t.id,
                    );
                  }}
                >
                  {c.name}
                </button>
              ))}
          </div>
        )}
      </BottomSheet>

      {/* Vincular a entidad */}
      <BottomSheet open={link !== null} title="Vincular movimiento" onClose={() => setLink(null)}>
        {link && (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="muted" style={{ fontSize: 13 }}>
              {txnLabel(link.transaction)} ·{" "}
              {formatMoney(link.transaction.amount, link.transaction.currency)} · sugerido:{" "}
              {KIND_LABEL[link.suggestedKind] ?? link.suggestedKind}
            </div>
            {linkables[link.suggestedKind].length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                Todavía no tienes {(KIND_LABEL[link.suggestedKind] ?? "entidades").toLowerCase()}s
                para vincular.
              </div>
            ) : (
              linkables[link.suggestedKind].map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="m-btn m-btn-block m-btn-secondary"
                  style={{ justifyContent: "flex-start" }}
                  disabled={pending}
                  onClick={() => {
                    const c = link;
                    setLink(null);
                    run(
                      () =>
                        linkTransactionAction({
                          transactionId: c.transaction.id,
                          linkedKind: c.suggestedKind,
                          linkedId: e.id,
                        }),
                      "Movimiento vinculado",
                      c.transaction.id,
                    );
                  }}
                >
                  {e.name}
                </button>
              ))
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function Block({
  title,
  n,
  hint,
  children,
}: {
  title: string;
  n: number;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <MContentCard style={{ marginBottom: 12 }}>
      <div className="between">
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        {n > 0 ? <MChip tone="warning">{n}</MChip> : null}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
        {hint}
      </div>
      {children}
    </MContentCard>
  );
}
