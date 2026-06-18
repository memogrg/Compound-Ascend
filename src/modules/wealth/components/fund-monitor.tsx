"use client";

/**
 * Monitor de Fondos — re-skin fiel al prototipo (design-reference/investments):
 * barra de búsqueda + status-pill (en vivo / caché) y filas mon-row con icono,
 * precio, variación % del día y mini-sparkline. Lista combinada (curada +
 * watchlist del usuario). Los precios vienen del SERVIDOR vía getMonitorQuotesAction
 * (cadena de proveedores + caché que ocultan la llave). Sin fetch a APIs ni tokens
 * en el cliente. Best-effort: si un proveedor no expone variación/historial se omite.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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

const KIND_GRADIENT: Record<WatchKind, string> = {
  etf: "linear-gradient(135deg, var(--c-invest), var(--info))",
  crypto: "linear-gradient(135deg, var(--gold), var(--warn))",
  stock: "linear-gradient(135deg, var(--c-networth), var(--ink-2))",
};

type Row = { symbol: string; name?: string; kind: WatchKind; watchId?: string };

export function FundMonitor() {
  const toast = useToast();
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [quotes, setQuotes] = useState<Map<string, MonitorQuote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
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

  const add = async () => {
    const s = query.trim().toUpperCase();
    if (!s) return;
    setBusy(true);
    const res = await addWatchlistAction(s, kind);
    setBusy(false);
    if (!res.ok) return toast(res.message ?? "No se pudo agregar (¿aplicaste la migración?).");
    setQuery("");
    void refresh();
  };

  const remove = async (id: string) => {
    await removeWatchlistAction(id);
    void refresh();
  };

  const quoteOf = (sym: string, k: WatchKind) => quotes.get(`${k}:${sym.toUpperCase()}`);

  const rows: Row[] = useMemo(() => {
    const base: Row[] = [
      ...CURATED.map((c) => ({ symbol: c.symbol, name: c.name, kind: c.kind })),
      ...watchlist.map((w) => ({ symbol: w.symbol, kind: w.kind, watchId: w.id })),
    ];
    const q = query.trim().toUpperCase();
    if (!q) return base;
    return base.filter((r) => r.symbol.includes(q) || (r.name ?? "").toUpperCase().includes(q));
  }, [watchlist, query]);

  // En vivo si al menos una cotización trae precio y no viene de caché.
  const live = useMemo(() => [...quotes.values()].some((q) => q.price != null && !q.cached), [quotes]);

  return (
    <div>
      <div className="mon-bar">
        <div className="mon-search">
          <Icon name="search" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase().slice(0, 16))}
            placeholder="Buscar símbolo o fondo (AAPL, VOO, BTC…)"
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
          />
        </div>
        <select className="sel" style={{ width: 110 }} value={kind} onChange={(e) => setKind(e.target.value as WatchKind)} aria-label="Tipo de activo">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" disabled={busy || !query.trim()} onClick={() => void add()}>
          <Icon name="plus" width={2} /> Seguir
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void refresh()}>
          <Icon name="repeat" width={2} /> Actualizar
        </button>
        <span className={`status-pill ${loading ? "cached" : live ? "live" : "cached"}`}>
          <span className="d" />
          {loading ? "Conectando…" : live ? "Precios en vivo" : "Datos en caché"}
        </span>
      </div>

      <div className="card">
        <div className="inv-th" style={{ gridTemplateColumns: "42px 1.6fr 1fr 1fr 1fr" }}>
          <div />
          <div>Activo</div>
          <div style={{ textAlign: "right" }}>Precio</div>
          <div style={{ textAlign: "right" }}>Cambio</div>
          <div className="c-spark">7 días</div>
        </div>
        {rows.length === 0 ? (
          <div className="muted" style={{ padding: "30px", textAlign: "center", fontSize: 13 }}>Sin resultados.</div>
        ) : (
          rows.map((r) => (
            <MonitorRow
              key={`${r.kind}:${r.symbol}`}
              row={r}
              quote={quoteOf(r.symbol, r.kind)}
              loading={loading}
              onRemove={r.watchId ? () => void remove(r.watchId!) : undefined}
            />
          ))
        )}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>
        Precios vía cadena de proveedores (con caché) desde el servidor. La variación del día y el sparkline son best-effort
        según el proveedor.
      </p>
    </div>
  );
}

function MonitorRow({
  row,
  quote,
  loading,
  onRemove,
}: {
  row: Row;
  quote?: MonitorQuote;
  loading: boolean;
  onRemove?: () => void;
}) {
  const change = quote?.changePct ?? null;
  const up = (change ?? 0) >= 0;
  const priceFmt = quote && quote.price != null ? formatMoney(quote.price, quote.currency ?? "USD") : null;
  return (
    <div className="mon-row">
      <div className="mon-ic" style={{ background: KIND_GRADIENT[row.kind] }}>{row.symbol.slice(0, 4)}</div>
      <div style={{ minWidth: 0 }}>
        <div className="mon-name">{row.symbol}</div>
        <div className="mon-sub">{row.name ?? (row.kind === "crypto" ? "Cripto" : row.kind === "etf" ? "ETF" : "Acción")}</div>
      </div>
      <div className="mon-price">{loading ? "…" : (priceFmt ?? "sin precio")}</div>
      <div className={`mon-chg ${change == null ? "" : up ? "pos" : "neg"}`} style={{ color: change == null ? "var(--muted)" : up ? "var(--pos)" : "var(--neg)" }}>
        {change != null ? `${up ? "+" : ""}${formatPercent(change / 100)}` : quote?.cached ? "caché" : ""}
      </div>
      <div className="c-spark" style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
        <Sparkline series={quote?.spark ?? []} up={up} loading={loading} />
        {onRemove ? (
          <button type="button" className="icon-btn" aria-label={`Quitar ${row.symbol}`} style={{ width: 26, height: 26, flex: "none" }} onClick={onRemove}>
            <Icon name="x" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Mini-sparkline (sin librería; no hay componente para series tan pequeñas). */
function Sparkline({ series, up, loading }: { series: number[]; up: boolean; loading: boolean }) {
  if (loading || series.length < 2) return <span className="mon-spark" aria-hidden />;
  const W = 120;
  const H = 34;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const stepX = W / (series.length - 1);
  const d = series
    .map((v, i) => `${i ? "L" : "M"}${(i * stepX).toFixed(1)},${(H - 2 - ((v - min) / span) * (H - 6)).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="mon-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={up ? "var(--pos)" : "var(--neg)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
