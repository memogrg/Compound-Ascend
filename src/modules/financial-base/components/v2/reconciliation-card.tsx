"use client";

/**
 * Conciliación del mes (Fase 6 · interconexión):
 *  · "Sin vincular": transacciones cuya categoría sugiere entidad — se
 *    vinculan con 1 tap (y propagan al ledger especializado).
 *  · "Plan vs real por entidad": alertas de las líneas derivadas del plan.
 * Componente autocontenido; las secciones lo montan de forma aditiva.
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
  const [pending, startTransition] = useTransition();
  const [linking, setLinking] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visibleCandidates = candidates.filter((c) => !hidden.has(c.transaction.id));
  if (visibleCandidates.length === 0 && alerts.length === 0) return null;

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
    <div className="card card-pad">
      <div className="card-title">Conciliación del mes</div>
      <div className="card-sub" style={{ marginTop: 2 }}>
        Conecta lo que quedó suelto y compara el plan de cada entidad con lo real.
      </div>

      {visibleCandidates.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="eyebrow">Sin vincular ({visibleCandidates.length})</div>
          {visibleCandidates.slice(0, 6).map(({ transaction: t, suggestedKind }) => (
            <div key={t.id} className="list-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {t.merchantOrSource ?? t.description ?? "Transacción"}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {" "}· {formatMoney(t.amount, t.currency)} · {t.occurredOn}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {(linkables[suggestedKind] ?? []).slice(0, 4).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="chip-sel"
                      style={{ fontSize: 11.5, padding: "3px 10px" }}
                      disabled={pending && linking === t.id}
                      onClick={() => link(t.id, suggestedKind, e.id)}
                    >
                      <Icon name="repeat" width={2} /> {KIND_LABEL[suggestedKind] ?? "entidad"}: {e.name}
                    </button>
                  ))}
                </div>
              </div>
              <span className="muted" style={{ fontSize: 11 }}>
                {pending && linking === t.id ? "Vinculando…" : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {alerts.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="eyebrow">Plan vs real por entidad</div>
          {alerts.map((a) => (
            <div key={`${a.sourceKind}:${a.sourceId}`} className="list-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  Plan {formatMoney(a.planned, a.currency)} · Real {formatMoney(a.real, a.currency)}
                </div>
              </div>
              <span className="chip" style={{ background: STATUS_UI[a.status].bg, color: STATUS_UI[a.status].color, fontSize: 10.5 }}>
                {STATUS_UI[a.status].label}
              </span>
              <span />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
