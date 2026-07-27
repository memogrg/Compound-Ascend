"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import {
  listPriceAlertsAction,
  createPriceAlertAction,
  updatePriceAlertAction,
  deletePriceAlertAction,
} from "@/modules/wealth/api/actions";
import type { PriceAlert } from "@/modules/wealth/services/price-alerts-service";
import type { AlertDirection } from "@/modules/wealth/engine/price-alerts";

/**
 * Alerta de precio de un holding cotizado (etf/accion/cripto). El usuario fija un precio
 * objetivo + dirección; un cron avisa por email/campana al cruzar. Solo se monta cuando el
 * activo tiene precio de mercado (el llamador lo gatea). Crear/listar/editar/borrar.
 */
export function PriceAlertSection({
  holdingId,
  symbol,
  assetType,
  currency,
}: {
  holdingId: string;
  symbol: string;
  assetType: string;
  currency: string;
}) {
  const toast = useToast();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void listPriceAlertsAction(holdingId).then(setAlerts);
  }, [holdingId]);
  useEffect(() => load(), [load]);

  const create = async () => {
    const price = parseFloat(target);
    if (!(price > 0) || busy) return;
    setBusy(true);
    const res = await createPriceAlertAction({ holdingId, symbol, assetType, targetPrice: price, currency, direction });
    setBusy(false);
    if (res.ok) {
      setTarget("");
      load();
      toast("Alerta creada");
    } else {
      toast(res.message ?? "No se pudo crear la alerta", "error");
    }
  };

  const remove = async (id: string) => {
    const res = await deletePriceAlertAction(id);
    if (res.ok) load();
    else toast(res.message ?? "No se pudo borrar", "error");
  };

  const toggle = async (a: PriceAlert) => {
    const res = await updatePriceAlertAction(a.id, { active: !a.active });
    if (res.ok) load();
    else toast(res.message ?? "No se pudo actualizar", "error");
  };

  return (
    <div style={{ padding: "14px 22px 0", borderTop: "1px solid var(--line)", marginTop: 14 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
        Alerta de precio
      </div>

      {/* Crear */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label className="muted" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
            Avisar cuando
          </label>
          <select
            className="sel"
            value={direction}
            onChange={(e) => setDirection(e.target.value as AlertDirection)}
            aria-label="Dirección de la alerta"
            style={{ height: 38 }}
          >
            <option value="above">suba a</option>
            <option value="below">baje a</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label className="muted" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
            Precio objetivo ({currency})
          </label>
          <input
            className="inp"
            type="number"
            step="any"
            min="0"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0"
            aria-label="Precio objetivo"
            style={{ width: "100%" }}
          />
        </div>
        <button className="btn btn-primary" onClick={create} disabled={busy || !(parseFloat(target) > 0)} style={{ height: 38 }}>
          {busy ? "…" : "Crear alerta"}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.45 }}>
        Te avisamos por correo y en la campana cuando el precio cruce tu objetivo. No es tiempo real
        (se revisa periódicamente) ni una recomendación de inversión.
      </p>

      {/* Listar */}
      {alerts.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {alerts.map((a) => {
            const triggered = a.triggeredAt !== null;
            return (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 0",
                  borderTop: "1px solid var(--line)",
                  fontSize: 12.5,
                }}
              >
                <span>
                  {a.direction === "above" ? "Sube a" : "Baja a"}{" "}
                  <strong>{formatMoney(a.targetPrice ?? 0, a.currency ?? "")}</strong>
                  {triggered ? (
                    <span className="muted"> · disparada</span>
                  ) : !a.active ? (
                    <span className="muted"> · pausada</span>
                  ) : (
                    <span style={{ color: "var(--pos)" }}> · vigilando</span>
                  )}
                </span>
                <span style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    className="lnk"
                    onClick={() => toggle(a)}
                    style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)", fontSize: 12 }}
                  >
                    {a.active ? "Pausar" : "Reactivar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    style={{ background: "none", border: 0, cursor: "pointer", color: "var(--neg)", fontSize: 12 }}
                  >
                    Borrar
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
