"use client";

/**
 * Card "Pendientes de completar" (Fase 3): stubs de inversión creados desde un
 * ingreso pasivo (renta/dividendos) que aún no tienen detalle. CTA "Completar
 * detalle" abre el wizard precargado. Reemplaza al inexistente sistema de
 * notificaciones in-app (mismo patrón que la card de conciliación).
 */
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import { CompleteHoldingButton } from "@/modules/wealth/components/add-holding-wizard";
import type { Holding } from "@/modules/wealth/types";

export function PendingHoldingsCard({
  holdings,
  currency,
}: {
  holdings: Holding[];
  currency: string;
}) {
  if (holdings.length === 0) return null;

  return (
    <div
      className="card"
      style={{ borderColor: "color-mix(in srgb, var(--warn) 35%, var(--line))" }}
    >
      <div className="card-head">
        <div>
          <div className="card-title">Pendientes de completar</div>
          <div className="card-sub">
            Inversiones creadas desde un ingreso pasivo. Añade el detalle para verlas en tu
            portafolio.
          </div>
        </div>
        <span className="chip" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
          {holdings.length}
        </span>
      </div>
      {holdings.map((h) => {
        const value = h.currentValueManual ?? 0;
        return (
          <div
            key={h.id}
            className="list-row"
            style={{ gridTemplateColumns: "1fr auto", alignItems: "center" }}
          >
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <span className="inc-ic">
                <Icon name="invest" />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{h.label ?? h.symbol}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {value > 0 ? formatMoney(value, h.currency ?? currency) : "Sin valor aún"}
                </div>
              </div>
            </div>
            <CompleteHoldingButton holding={h} currency={currency} />
          </div>
        );
      })}
    </div>
  );
}
