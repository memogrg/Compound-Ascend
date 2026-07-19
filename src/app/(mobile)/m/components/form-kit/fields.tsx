import { useState } from "react";

import { currencySymbol } from "@/lib/format";

import { useFormError } from "./form-shell";
import { BottomSheet } from "./bottom-sheet";

/**
 * Campos premium del form kit (extienden los patrones de wizard-fields.tsx con soporte
 * de errores por campo). Cada uno lee su error de Zod vía useFormError(name) y usa la
 * piel de mobile.css (.m-inp, .m-qlabel, .m-field-err). es-MX, tema claro.
 */

export type Opt = { value: string; label: string };

/** Envoltura: etiqueta + contenido + error inline (por `name`, como fieldErrors de Zod). */
function Field({ name, label, children }: { name: string; label: string; children: React.ReactNode }) {
  const error = useFormError(name);
  return (
    <div className="m-qfield">
      <div className="m-qlabel">{label}</div>
      {children}
      {error ? <div className="m-field-err">{error}</div> : null}
    </div>
  );
}

export function TextField({
  name,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  autoFocus,
  type = "text",
  autoComplete,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  /** Tipo del input (p. ej. "password" para contraseñas). Por defecto "text". */
  type?: "text" | "password" | "email";
  autoComplete?: string;
}) {
  return (
    <Field name={name} label={label}>
      <input
        className="m-inp"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
      />
    </Field>
  );
}

/** Monto: teclado numérico + símbolo de moneda. Devuelve un número (o undefined si vacío). */
export function MoneyField({
  name,
  label,
  value,
  onChange,
  currency,
  placeholder = "0",
}: {
  name: string;
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  currency: string;
  placeholder?: string;
}) {
  return (
    <Field name={name} label={label}>
      <div className="m-money">
        <span className="m-money-sym">{currencySymbol(currency)}</span>
        <input
          className="m-inp m-money-inp"
          type="text"
          inputMode="decimal"
          value={value == null ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.]/g, "");
            if (raw === "") return onChange(undefined);
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : undefined);
          }}
          placeholder={placeholder}
        />
      </div>
    </Field>
  );
}

/** Fecha nativa (YYYY-MM-DD). Teclado/date-picker del sistema. */
export function DateField({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field name={name} label={label}>
      <input className="m-inp" type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

/** Control segmentado (selección única en una fila). */
export function Segmented({
  name,
  label,
  value,
  onChange,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: Opt[];
}) {
  return (
    <Field name={name} label={label}>
      <div className="m-seg" role="radiogroup">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`m-seg-item${value === o.value ? " on" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

/** Select en hoja: abre un BottomSheet con las opciones. */
export function SheetSelect({
  name,
  label,
  value,
  onChange,
  options,
  placeholder = "Selecciona…",
  sheetTitle,
}: {
  name: string;
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: Opt[];
  placeholder?: string;
  sheetTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);

  // El buscador aparece solo cuando la lista es larga: en un selector de 6 monedas sería
  // ruido, pero el de categorías pasa de 100 opciones y encontrar "Farmacia" a fuerza de
  // scroll es la peor parte de esa hoja.
  const withSearch = options.length >= SEARCH_MIN_OPTIONS;
  const shown = withSearch && query.trim() ? options.filter((o) => matches(o.label, query)) : options;

  const close = () => {
    setOpen(false);
    setQuery(""); // la próxima apertura empieza limpia
  };

  return (
    <Field name={name} label={label}>
      <button type="button" className="m-inp m-sheetselect" onClick={() => setOpen(true)}>
        <span className={selected ? "" : "m-sheetselect-ph"}>{selected ? selected.label : placeholder}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <BottomSheet open={open} onClose={close} title={sheetTitle ?? label}>
        {withSearch ? (
          <input
            className="m-inp"
            type="search"
            inputMode="search"
            value={query}
            placeholder="Buscar…"
            aria-label="Buscar en la lista"
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 10 }}
          />
        ) : null}
        <div className="m-optlist">
          {shown.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`m-opt${value === o.value ? " sel" : ""}`}
              onClick={() => {
                onChange(o.value);
                close();
              }}
            >
              <span className="m-opt-t">{o.label}</span>
            </button>
          ))}
          {shown.length === 0 ? (
            <div className="muted" style={{ fontSize: 13.5, padding: "14px 2px" }}>
              Nada coincide con “{query.trim()}”.
            </div>
          ) : null}
        </div>
      </BottomSheet>
    </Field>
  );
}

/** A partir de cuántas opciones vale la pena ofrecer búsqueda. */
const SEARCH_MIN_OPTIONS = 12;

/**
 * Coincidencia sin acentos ni mayúsculas: en español es lo único que sirve. Quien busca
 * "alimentacion" o "credito" espera encontrar "Alimentación" y "Crédito" — obligar a
 * teclear la tilde en un móvil es obligar a no usar el buscador. Las etiquetas de
 * categoría llegan como "Frasco · Sobre", así que escribir el frasco filtra sus sobres.
 */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Todas las palabras del término deben aparecer (permite "alim super"). */
function matches(label: string, query: string): boolean {
  const hay = fold(label);
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term));
}

/** Toggle sí/no (switch para booleanos). */
export function Toggle({
  name,
  label,
  value,
  onChange,
  hint,
}: {
  name: string;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  const error = useFormError(name);
  return (
    <div className="m-qfield">
      <div className="between">
        <div>
          <div className="m-qlabel" style={{ marginBottom: hint ? 2 : 0 }}>
            {label}
          </div>
          {hint ? (
            <div className="muted" style={{ fontSize: 12 }}>
              {hint}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          className={`m-switch${value ? " on" : ""}`}
          onClick={() => onChange(!value)}
        >
          <span className="m-switch-knob" aria-hidden />
        </button>
      </div>
      {error ? <div className="m-field-err">{error}</div> : null}
    </div>
  );
}

// Stepper +/- se reutiliza tal cual del wizard (mismo patrón, sin duplicar).
export { Stepper } from "../../perfil-financiero/wizard-fields";
