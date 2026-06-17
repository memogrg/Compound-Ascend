"use client";

/**
 * Campo compartido de captura de monto + moneda. Presentacional y controlado:
 * el padre decide el valor inicial de la moneda (regla del proyecto: la moneda
 * principal del usuario por defecto, o item.currency al editar) — NUNCA la
 * moneda de visualización del topbar. La moneda elegida es la que se persiste.
 *
 * El símbolo del prefijo refleja la moneda seleccionada. La lista de monedas
 * sale de la fuente única (CURRENCY_OPTIONS en @/lib/format).
 */
import { CURRENCY_OPTIONS, currencySymbol } from "@/lib/format";

export function MoneyField({
  amount,
  onAmount,
  currency,
  onCurrency,
  defaultCurrency,
  label = "Monto",
  tip,
  placeholder = "0",
  autoFocus,
  disabled,
  inputId,
}: {
  amount: string;
  onAmount: (value: string) => void;
  currency: string;
  onCurrency: (code: string) => void;
  /** Moneda principal: se marca como "(principal)" en el selector. */
  defaultCurrency?: string;
  label?: string;
  /** Si se pasa, muestra un ícono "?" con tooltip (sin texto inline). */
  tip?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  inputId?: string;
}) {
  // Si la moneda actual no está en el set soportado (dato heredado), se antepone
  // para no perder el valor al renderizar el selector.
  const options = CURRENCY_OPTIONS.some((o) => o.code === currency)
    ? CURRENCY_OPTIONS
    : [{ code: currency, symbol: currencySymbol(currency) }, ...CURRENCY_OPTIONS];

  return (
    <div className="fld">
      <label className="fld-label" htmlFor={inputId} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {label}
        {tip ? (
          <span
            className="tip"
            data-tip={tip}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 15,
              height: 15,
              borderRadius: "50%",
              border: "1px solid var(--line)",
              color: "var(--muted)",
              fontSize: 10,
              fontWeight: 700,
              flex: "none",
            }}
          >
            ?
          </span>
        ) : null}
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <div className="inp-money" style={{ flex: 1, minWidth: 0 }}>
          <span className="pre" aria-hidden>
            {currencySymbol(currency)}
          </span>
          <input
            id={inputId}
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            disabled={disabled}
          />
        </div>
        <select
          className="sel"
          value={currency}
          onChange={(e) => onCurrency(e.target.value)}
          disabled={disabled}
          aria-label="Moneda del monto"
          style={{ flex: "0 0 auto", width: 104 }}
        >
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.code}
              {o.code === defaultCurrency ? " (principal)" : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
