/**
 * Ícono de posición (.hold-ic): cuadro con gradiente por tipo de activo +
 * ticker. Presentación pura. El gradiente se elige por assetType (y por símbolo
 * para diferenciar tech). No toca la lógica de los holdings.
 */
import type { AssetType } from "@/modules/wealth/types";

const TECH = new Set(["AAPL", "MSFT", "GOOGL", "GOOG", "NVDA", "AMZN", "META", "TSLA", "AVGO"]);

export type IconStyle = { background: string; color: string };

export function iconGradient(assetType: AssetType, symbol?: string): IconStyle {
  const sym = (symbol ?? "").toUpperCase();
  switch (assetType) {
    case "etf":
      return { background: "linear-gradient(135deg,var(--info),var(--teal))", color: "white" };
    case "accion":
      return TECH.has(sym)
        ? { background: "linear-gradient(135deg,var(--ink-2),var(--c-networth))", color: "white" }
        : { background: "linear-gradient(135deg,var(--pos),var(--teal))", color: "white" };
    case "bono":
    case "certificado":
    case "fondo":
    case "pension":
      return { background: "linear-gradient(135deg,var(--warn),var(--gold))", color: "white" };
    case "inmueble":
      return { background: "linear-gradient(135deg,var(--teal),var(--info))", color: "white" };
    case "cripto":
      return { background: "linear-gradient(135deg,var(--gold),var(--warn))", color: "white" };
    case "commodity":
      return {
        background: "linear-gradient(135deg,var(--gold),var(--c-networth))",
        color: "white",
      };
    default:
      return {
        background: "linear-gradient(135deg,var(--c-networth),var(--ink-2))",
        color: "white",
      };
  }
}

/** Ticker corto para el ícono (máx. 4 caracteres). */
function ticker(symbol: string, label?: string | null): string {
  const s = (symbol || label || "").trim().toUpperCase();
  return s.slice(0, 4) || "—";
}

export function HoldingIcon({
  assetType,
  symbol,
  label,
}: {
  assetType: AssetType;
  symbol: string;
  label?: string | null;
}) {
  const style = iconGradient(assetType, symbol);
  return (
    <div className="hold-ic" style={style}>
      {ticker(symbol, label)}
    </div>
  );
}
