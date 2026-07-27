"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import {
  listInvestmentAlertsAction,
  createInvestmentAlertAction,
  updateInvestmentAlertAction,
  deleteInvestmentAlertAction,
} from "@/modules/wealth/api/actions";
import type { InvestmentAlert, CreateAlertInput } from "@/modules/wealth/services/price-alerts-service";
import type { AlertKind } from "@/modules/wealth/engine/price-alerts";

/** asset_type del holding → tipo de mercado del endpoint /api/market-price. */
const MARKET_TYPE: Record<string, string> = { etf: "etf", accion: "stock", cripto: "crypto" };

/** Datos del holding que la alerta necesita. `symbol/assetType` gatean el tipo 'price'. */
export type AlertHolding = {
  id: string;
  symbol: string | null;
  assetType: string;
  currency: string;
  purchaseDate: string | null;
  name: string;
};

const QUOTED = new Set(["etf", "accion", "cripto"]);
const KIND_LABEL: Record<AlertKind, string> = {
  price: "Precio",
  time_held: "Años invertido",
  vesting: "Vesting",
};

/** Descripción de una alerta existente, por tipo (extensible: un case más). */
function describe(a: InvestmentAlert): string {
  if (a.kind === "time_held") return `A los ${a.yearsThreshold} años invertido`;
  if (a.kind === "vesting") return `El ${a.triggerDate}`;
  return `${a.direction === "above" ? "Sube a" : "Baja a"} ${formatMoney(a.targetPrice ?? 0, a.currency ?? "")}`;
}

/**
 * Gestor de alertas de una inversión (compartido entre el kebab y el detalle). Muestra un
 * selector de TIPO adaptado al activo (Precio solo en cotizables; Años invertido solo si hay
 * fecha de compra; Vesting siempre), el form del tipo elegido, y la lista para pausar/borrar.
 * Extensible: agregar un tipo = un `case` en el form + uno en describe().
 */
export function AlertManager({ holding, compact = false }: { holding: AlertHolding; compact?: boolean }) {
  const toast = useToast();
  const [alerts, setAlerts] = useState<InvestmentAlert[]>([]);
  const [busy, setBusy] = useState(false);

  // Tipos disponibles según el activo. Precio: cotizable + símbolo. Años: requiere purchaseDate.
  const kinds = useMemo<AlertKind[]>(() => {
    const out: AlertKind[] = [];
    if (holding.symbol && QUOTED.has(holding.assetType)) out.push("price");
    if (holding.purchaseDate) out.push("time_held");
    out.push("vesting");
    return out;
  }, [holding.symbol, holding.assetType, holding.purchaseDate]);

  const [kind, setKind] = useState<AlertKind>(kinds[0]!);
  const [target, setTarget] = useState("");
  const [years, setYears] = useState("");
  const [date, setDate] = useState("");
  // Precio actual (live) para el tipo Precio: "loading" | "ok" | "err" | "na" (no aplica).
  const [live, setLive] = useState<{ price: number; currency: string } | null>(null);
  const [liveState, setLiveState] = useState<"loading" | "ok" | "err" | "na">("na");

  const load = useCallback(() => {
    void listInvestmentAlertsAction(holding.id).then(setAlerts);
  }, [holding.id]);
  useEffect(() => load(), [load]);

  // Trae el precio actual del símbolo al elegir el tipo Precio (reusa /api/market-price).
  const marketType = holding.symbol ? MARKET_TYPE[holding.assetType] : undefined;
  useEffect(() => {
    if (kind !== "price" || !holding.symbol || !marketType) {
      setLive(null);
      setLiveState("na");
      return;
    }
    let alive = true;
    setLive(null);
    setLiveState("loading");
    fetch(`/api/market-price?symbol=${encodeURIComponent(holding.symbol)}&type=${marketType}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no price"))))
      .then((d: { price: number; currency: string }) => {
        if (alive) {
          setLive({ price: Number(d.price), currency: d.currency });
          setLiveState("ok");
        }
      })
      .catch(() => {
        if (alive) setLiveState("err");
      });
    return () => {
      alive = false;
    };
  }, [kind, holding.symbol, marketType]);

  const inputValid =
    kind === "price" ? parseFloat(target) > 0 : kind === "time_held" ? parseFloat(years) > 0 : /^\d{4}-\d{2}-\d{2}$/.test(date);

  const create = async () => {
    if (!inputValid || busy) return;
    let input: CreateAlertInput;
    if (kind === "price") {
      input = {
        kind: "price",
        holdingId: holding.id,
        symbol: holding.symbol ?? "",
        assetType: holding.assetType,
        targetPrice: parseFloat(target),
        currency: holding.currency,
        // La dirección la infiere el servidor con el precio actual.
      };
    } else if (kind === "time_held") {
      input = { kind: "time_held", holdingId: holding.id, yearsThreshold: parseFloat(years) };
    } else {
      input = { kind: "vesting", holdingId: holding.id, triggerDate: date };
    }
    setBusy(true);
    const res = await createInvestmentAlertAction(input);
    setBusy(false);
    if (res.ok) {
      setTarget("");
      setYears("");
      setDate("");
      load();
      toast("Alerta creada");
    } else {
      toast(res.message ?? "No se pudo crear la alerta", "error");
    }
  };

  const remove = async (id: string) => {
    const res = await deleteInvestmentAlertAction(id);
    if (res.ok) load();
    else toast(res.message ?? "No se pudo borrar", "error");
  };

  const toggle = async (a: InvestmentAlert) => {
    const res = await updateInvestmentAlertAction(a.id, { active: !a.active });
    if (res.ok) load();
    else toast(res.message ?? "No se pudo actualizar", "error");
  };

  return (
    <div style={compact ? undefined : { padding: "14px 22px 0", borderTop: "1px solid var(--line)", marginTop: 14 }}>
      {!compact ? (
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>Alertas</div>
      ) : null}

      {/* Selector de tipo (si hay más de uno) + form del tipo elegido */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        {kinds.length > 1 ? (
          <div>
            <label className="muted" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
              Tipo
            </label>
            <select
              className="sel"
              value={kind}
              onChange={(e) => setKind(e.target.value as AlertKind)}
              aria-label="Tipo de alerta"
              style={{ height: 38 }}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {kind === "price" ? (
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="muted" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
              Precio objetivo ({holding.currency})
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
        ) : kind === "time_held" ? (
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="muted" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
              Años invertido
            </label>
            <input
              className="inp"
              type="number"
              step="any"
              min="0"
              value={years}
              onChange={(e) => setYears(e.target.value)}
              placeholder="Ej. 5"
              aria-label="Años invertido"
              style={{ width: "100%" }}
            />
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="muted" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
              Fecha de vesting
            </label>
            <input
              className="inp"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Fecha de vesting"
              style={{ width: "100%" }}
            />
          </div>
        )}

        <button className="btn btn-primary" onClick={create} disabled={busy || !inputValid} style={{ height: 38 }}>
          {busy ? "…" : "Crear alerta"}
        </button>
      </div>

      {/* Precio actual (live) + hint dinámico. La dirección la infiere el servidor al guardar. */}
      {kind === "price" ? (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>
          {liveState === "loading" ? (
            "Leyendo el precio actual…"
          ) : liveState === "err" ? (
            "No pudimos leer el precio ahora; podés crear la alerta igual."
          ) : live ? (
            <>
              Precio actual: <strong>{formatMoney(live.price, live.currency)}</strong>.
            </>
          ) : null}
          {parseFloat(target) > 0 ? (
            <>
              {" "}
              Te avisaremos cuando {holding.symbol} llegue a{" "}
              <strong>{formatMoney(parseFloat(target), holding.currency)}</strong>.
            </>
          ) : null}
        </div>
      ) : null}

      <p className="muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.45 }}>
        Te avisamos por correo y en la campana cuando se cumpla la condición. No es tiempo real (se
        revisa periódicamente) ni una recomendación de inversión.
      </p>

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
                  <span className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    {KIND_LABEL[a.kind]}
                  </span>{" "}
                  <strong>{describe(a)}</strong>
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
