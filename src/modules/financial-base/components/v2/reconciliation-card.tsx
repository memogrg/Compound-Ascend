"use client";

/**
 * Conciliación del mes (Fase 6 · interconexión) — versión compacta.
 *
 * Colapsada por defecto: una sola línea de resumen con conteos
 * ("Conciliación: N sin vincular · M alertas") y color de estado. Expandida:
 * candidatas como filas densas con chips pequeños de entidad (1 tap vincula y
 * propaga) y alertas plan-vs-real como lista compacta. Si no hay nada que
 * conciliar, no se renderiza. Solo UI: la lógica vive en engine/reconciliation.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { linkTransactionAction } from "@/modules/financial-base/api/v2-actions";
import type { UnlinkedCandidate, EntityAlert, EntityAlertStatus } from "@/modules/financial-base/engine/reconciliation";
import type { LinkableEntities } from "@/modules/financial-base/services/linkable-entities-service";

const KIND_LABEL: Record<string, string> = {
  debt: "deuda",
  goal: "meta",
  holding: "inversión",
  policy: "póliza",
  rental: "activo de renta",
};

const STATUS_UI: Record<EntityAlertStatus, { label: string; bg: string; color: string }> = {
  excedido: { label: "Excedido", bg: "var(--neg-soft, rgba(190,60,60,.12))", color: "var(--neg)" },
  sin_movimiento: { label: "Sin movimiento", bg: "var(--chip)", color: "var(--muted)" },
  parcial: { label: "Parcial", bg: "var(--warn-soft, rgba(190,140,40,.12))", color: "var(--warn)" },
  cumplido: { label: "Cumplido", bg: "var(--pos-soft, rgba(60,140,90,.12))", color: "var(--pos)" },
};

export function ReconciliationCard({
  candidates,
  alerts,
  linkables,
}: {
  candidates: UnlinkedCandidate[];
  alerts: EntityAlert[];
  linkables: LinkableEntities;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [linking, setLinking] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visibleCandidates = candidates.filter((c) => !hidden.has(c.transaction.id));
  // Las alertas "cumplido" no piden acción: no cuentan como pendientes.
  const actionableAlerts = alerts.filter((a) => a.status !== "cumplido");
  if (visibleCandidates.length === 0 && alerts.length === 0) return null;

  const hasPending = visibleCandidates.length > 0 || actionableAlerts.length > 0;
  const tone = hasPending
    ? { bg: "var(--warn-soft, rgba(190,140,40,.12))", color: "var(--warn)" }
    : { bg: "var(--pos-soft, rgba(60,140,90,.12))", color: "var(--pos)" };

  const link = (txnId: string, kind: UnlinkedCandidate["suggestedKind"], entityId: string) => {
    setLinking(txnId);
    startTransition(async () => {
      const res = await linkTransactionAction({ transactionId: txnId, linkedKind: kind, linkedId: entityId });
      setLinking(null);
      if (res.ok) {
        toast("Transacción vinculada y conciliada");
        setHidden((prev) => new Set(prev).add(txnId));
        router.refresh();
      } else {
        toast(res.message ?? "No se pudo vincular", "error");
      }
    });
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* Resumen de una línea (toggle). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "12px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontSize: 13,
          color: "var(--ink-2)",
        }}
      >
        <span
          className="chip"
          style={{ background: tone.bg, color: tone.color, fontSize: 10.5, flex: "none" }}
        >
          {visibleCandidates.length + actionableAlerts.length}
        </span>
        <span style={{ fontWeight: 500 }}>
          Conciliación: {visibleCandidates.length} sin vincular · {actionableAlerts.length}{" "}
          {actionableAlerts.length === 1 ? "alerta" : "alertas"}
        </span>
        <span
          className="muted"
          style={{ marginLeft: "auto", display: "inline-flex", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}
        >
          <Icon name="chev" width={2} style={{ width: 14, height: 14 }} />
        </span>
      </button>

      {open ? (
        <div style={{ padding: "0 18px 12px", borderTop: "1px solid var(--line)" }}>
          {visibleCandidates.length > 0 ? (
            <>
              <div className="eyebrow" style={{ margin: "10px 0 2px" }}>Sin vincular</div>
              {visibleCandidates.slice(0, 6).map(({ transaction: t, suggestedKind }) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    padding: "6px 0",
                    borderBottom: "1px solid var(--line)",
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.merchantOrSource ?? t.description ?? "Transacción"}
                  </span>
                  <span className="muted tnum" style={{ flex: "none" }}>{formatMoney(t.amount, t.currency)}</span>
                  <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", marginLeft: "auto" }}>
                    {(linkables[suggestedKind] ?? []).slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className="chip-sel tip"
                        data-tip={`Vincular a esta ${KIND_LABEL[suggestedKind] ?? "entidad"} y conciliar`}
                        style={{ fontSize: 11, padding: "2px 8px", lineHeight: 1.4 }}
                        disabled={pending && linking === t.id}
                        onClick={() => link(t.id, suggestedKind, e.id)}
                      >
                        {pending && linking === t.id ? "…" : e.name}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </>
          ) : null}

          {alerts.length > 0 ? (
            <>
              <div className="eyebrow" style={{ margin: "10px 0 2px" }}>Plan vs real por entidad</div>
              {alerts.map((a) => (
                <div
                  key={`${a.sourceKind}:${a.sourceId}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px solid var(--line)",
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.name}
                  </span>
                  <span className="muted tnum" style={{ flex: "none" }}>
                    {formatMoney(a.planned, a.currency)} → {formatMoney(a.real, a.currency)}
                  </span>
                  <span
                    className="chip"
                    style={{
                      marginLeft: "auto",
                      flex: "none",
                      background: STATUS_UI[a.status].bg,
                      color: STATUS_UI[a.status].color,
                      fontSize: 10,
                    }}
                  >
                    {STATUS_UI[a.status].label}
                  </span>
                </div>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
