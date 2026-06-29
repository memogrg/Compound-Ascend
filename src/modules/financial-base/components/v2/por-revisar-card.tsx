"use client";

/**
 * Bandeja "Por revisar" — propuestas de ingesta detectadas desde los correos del
 * banco (ingest_proposals, status 'pending'). Calcada de ReconciliationCard:
 * colapsable, filas densas, 1 tap para confirmar (crea la transacción real) o
 * descartar. Si no hay propuestas, no se renderiza. Solo UI: la lógica vive en las
 * server actions confirm/discardIngestProposalAction.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import {
  confirmIngestProposalAction,
  discardIngestProposalAction,
} from "@/modules/financial-base/api/v2-actions";
import type { PendingProposalView } from "@/modules/financial-base/services/ingest-proposals-view";

const HELP =
  "Movimientos detectados desde tus correos del banco. Confirmá para agregarlos a tus transacciones.";

export function PorRevisarCard({ proposals }: { proposals: PendingProposalView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visible = proposals.filter((p) => !hidden.has(p.id));
  if (visible.length === 0) return null;

  const run = (
    id: string,
    action: (id: string) => Promise<{ ok: boolean; message?: string }>,
    okMsg: string,
  ) => {
    setBusy(id);
    startTransition(async () => {
      const res = await action(id);
      setBusy(null);
      if (res.ok) {
        toast(okMsg);
        setHidden((prev) => new Set(prev).add(id));
        router.refresh();
      } else {
        toast(res.message ?? "No se pudo procesar", "error");
      }
    });
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* Resumen de una línea (toggle) + ayuda en tooltip. */}
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
          style={{
            background: "var(--warn-soft, rgba(190,140,40,.12))",
            color: "var(--warn)",
            fontSize: 10.5,
            flex: "none",
          }}
        >
          {visible.length}
        </span>
        <span style={{ fontWeight: 500 }}>
          Por revisar: {visible.length} {visible.length === 1 ? "movimiento" : "movimientos"} del
          banco
        </span>
        <span
          className="tip"
          data-tip={HELP}
          style={{ display: "inline-flex", color: "var(--muted)", flex: "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="info" style={{ width: 14, height: 14 }} />
        </span>
        <span
          className="muted"
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .15s",
          }}
        >
          <Icon name="chev" style={{ width: 14, height: 14 }} />
        </span>
      </button>

      {open ? (
        <div style={{ padding: "0 18px 12px", borderTop: "1px solid var(--line)" }}>
          {visible.map((p) => {
            const rowBusy = pending && busy === p.id;
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--line)",
                  fontSize: 12.5,
                  opacity: rowBusy ? 0.5 : 1,
                }}
              >
                <span className="tnum" style={{ fontWeight: 600, flex: "none" }}>
                  {formatMoney(p.amount, p.currency)}
                </span>
                <span
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.merchant ?? (p.kind === "ingreso" ? "Ingreso" : "Gasto")}
                </span>
                {p.cardLabel ? (
                  <span className="chip" style={{ fontSize: 10, flex: "none" }}>
                    {p.cardLabel}
                  </span>
                ) : null}
                {p.confidence < 0.7 ? (
                  <span
                    className="chip tip"
                    data-tip="Confianza baja: verificá el monto antes de confirmar."
                    style={{
                      fontSize: 10,
                      flex: "none",
                      background: "var(--warn-soft, rgba(190,140,40,.12))",
                      color: "var(--warn)",
                    }}
                  >
                    verificar
                  </span>
                ) : null}
                <span className="muted" style={{ flex: "none" }}>
                  {p.occurredOn}
                </span>
                <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto", flex: "none" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: 11, padding: "4px 10px" }}
                    disabled={rowBusy}
                    onClick={() =>
                      run(p.id, confirmIngestProposalAction, "Movimiento agregado a tus transacciones")
                    }
                  >
                    {rowBusy ? "…" : "Confirmar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "4px 10px" }}
                    disabled={rowBusy}
                    onClick={() => run(p.id, discardIngestProposalAction, "Movimiento descartado")}
                  >
                    Descartar
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
