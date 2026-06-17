"use client";

/**
 * Monitor de Fondos (Fase 4): lista curada de índices/fondos populares + la
 * watchlist del usuario, con precio en vivo (market-data layer, batched + caché),
 * variación % del día y un mini-sparkline (serie diaria ~1 mes). Todo es
 * best-effort: si un proveedor no expone variación/historial, se omite sin romper.
 */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney, formatPercent } from "@/lib/format";
import {
  getMonitorQuotesAction,
  listWatchlistAction,
  addWatchlistAction,
  removeWatchlistAction,
  type MonitorQuote,
} from "@/modules/wealth/api/monitor-actions";
import type { WatchItem, WatchKind } from "@/modules/wealth/services/watchlist-service";

const CURATED: { symbol: string; name: string; kind: WatchKind }[] = [
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", kind: "etf" },
  { symbol: "VT", name: "Vanguard Total World", kind: "etf" },
  { symbol: "QQQ", name: "Invesco Nasdaq-100", kind: "etf" },
  { symbol: "VWO", name: "Vanguard Emerging Markets", kind: "etf" },
  { symbol: "BTC", name: "Bitcoin", kind: "crypto" },
  { symbol: "ETH", name: "Ethereum", kind: "crypto" },
];

const KINDS: { value: WatchKind; label: string }[] = [
  { value: "stock", label: "Acción" },
  { value: "etf", label: "ETF" },
  { value: "crypto", label: "Cripto" },
];

export function FundMonitor() {
  const toast = useToast();
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [quotes, setQuotes] = useState<Map<string, MonitorQuote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [symbol, setSymbol] = useState("");
  const [kind, setKind] = useState<WatchKind>("etf");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const wl = await listWatchlistAction();
    setWatchlist(wl);
    const all = [...CURATED.map((c) => ({ symbol: c.symbol, kind: c.kind })), ...wl];
    const qs = await getMonitorQuotesAction(all);
    setQuotes(new Map(qs.map((q) => [`${q.kind}:${q.symbol}`, q])));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add() {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setBusy(true);
    const res = await addWatchlistAction(s, kind);
    setBusy(false);
    if (!res.ok) {
      toast(res.message ?? "No se pudo agregar (¿aplicaste la migración?).");
      return;
    }
    setSymbol("");
    void refresh();
  }

  async function remove(id: string) {
    await removeWatchlistAction(id);
    void refresh();
  }

  const quoteOf = (sym: string, k: WatchKind) => quotes.get(`${k}:${sym.toUpperCase()}`);

  return (
    <div className="grid">
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Índices y fondos populares</div>
            <div className="card-sub">Precios en vivo · cadena de proveedores con caché</div>
          </div>
        </div>
        {CURATED.map((c) => (
          <MonitorRow key={`${c.kind}:${c.symbol}`} symbol={c.symbol} name={c.name} kind={c.kind} quote={quoteOf(c.symbol, c.kind)} loading={loading} />
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Mi watchlist</div>
            <div className="card-sub">{watchlist.length} símbolo(s) · solo para ti</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 24px", flexWrap: "wrap", alignItems: "flex-end", borderBottom: "1px solid var(--line)" }}>
          <div className="fld" style={{ margin: 0, flex: "1 1 140px", minWidth: 0 }}>
            <label className="fld-label">Símbolo</label>
            <input
              className="inp"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 12))}
              placeholder="Ej. NVDA, SOL"
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
            />
          </div>
          <div className="fld" style={{ margin: 0, flex: "0 0 120px" }}>
            <label className="fld-label">Tipo</label>
            <select className="sel" value={kind} onChange={(e) => setKind(e.target.value as WatchKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-primary" disabled={busy || !symbol.trim()} onClick={() => void add()}>
            <Icon name="plus" width={2} /> Agregar
          </button>
        </div>

        {watchlist.length === 0 ? (
          <div className="muted" style={{ padding: "18px 24px", fontSize: 13 }}>
            Agrega símbolos para seguir su precio. (Requiere la migración de watchlist aplicada.)
          </div>
        ) : (
          watchlist.map((w) => (
            <MonitorRow
              key={`${w.kind}:${w.symbol}`}
              symbol={w.symbol}
              kind={w.kind}
              quote={quoteOf(w.symbol, w.kind)}
              loading={loading}
              onRemove={() => void remove(w.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MonitorRow({
  symbol,
  name,
  kind,
  quote,
  loading,
  onRemove,
}: {
  symbol: string;
  name?: string;
  kind: WatchKind;
  quote?: MonitorQuote;
  loading: boolean;
  onRemove?: () => void;
}) {
  const kindLabel = kind === "crypto" ? "Cripto" : kind === "etf" ? "ETF" : "Acción";
  const change = quote?.changePct ?? null;
  const changeColor = change == null ? "var(--muted)" : change >= 0 ? "var(--pos)" : "var(--rose)";
  return (
    <div className="hold-row" style={{ gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div className="hold-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {symbol}
          <span className="chip" style={{ fontSize: 9.5, background: "var(--chip)", color: "var(--muted)" }}>
            {kindLabel}
          </span>
        </div>
        {name ? <div className="hold-sub">{name}</div> : null}
      </div>
      <Sparkline series={quote?.spark ?? []} loading={loading} />
      <div className="hold-val">
        {loading ? (
          <div className="muted" style={{ fontSize: 12 }}>
            …
          </div>
        ) : quote && quote.price != null ? (
          <>
            <div className="v">{formatMoney(quote.price, quote.currency ?? "USD")}</div>
            <div className="d" style={{ color: changeColor }}>
              {change != null ? `${change >= 0 ? "+" : ""}${formatPercent(change / 100)}` : quote.cached ? "caché" : "en vivo"}
            </div>
          </>
        ) : (
          <div className="muted" style={{ fontSize: 12 }}>
            sin precio
          </div>
        )}
      </div>
      {onRemove ? (
        <button type="button" className="icon-btn" aria-label={`Quitar ${symbol}`} style={{ width: 30, height: 30 }} onClick={onRemove}>
          <Icon name="x" />
        </button>
      ) : (
        <span style={{ width: 30 }} />
      )}
    </div>
  );
}

const SPARK_W = 64;
const SPARK_H = 22;

/** Mini-sparkline SVG (sin librería). Color por tendencia (sube=pos, baja=rosa). */
function Sparkline({ series, loading }: { series: number[]; loading: boolean }) {
  if (loading || series.length < 2) return <span style={{ width: SPARK_W, display: "inline-block" }} aria-hidden />;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const stepX = SPARK_W / (series.length - 1);
  const points = series
    .map((v, i) => `${(i * stepX).toFixed(1)},${(SPARK_H - ((v - min) / span) * SPARK_H).toFixed(1)}`)
    .join(" ");
  const up = series[series.length - 1]! >= series[0]!;
  const color = up ? "var(--pos)" : "var(--rose)";
  return (
    <svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} aria-hidden style={{ display: "block", flex: "none" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
