"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Suggestion } from "@/modules/setup/engine/suggestions";

/**
 * Primitivos compartidos por los cuatro asistentes (web y móvil).
 *
 * No contienen NINGUNA regla de negocio ni escritura propia: son campos y
 * contenedores. Quien escribe es el paso, llamando al Server Action de la app.
 */

/** Resultado que devuelven todas las actions del proyecto. */
export type ActionLike = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  needsConfirmation?: boolean;
};

/**
 * Sugerencia con SUS números y un botón para aplicarla. Si el motor no tiene
 * nada honesto que decir (falta el dato base), no se pinta nada.
 */
export function SuggestionNote({
  suggestion,
  currency,
  onApply,
}: {
  suggestion: Suggestion;
  currency: string;
  onApply?: (amount: number) => void;
}) {
  if (!suggestion.text) return null;
  return (
    <div className="setup-suggestion">
      <Icon name="spark" width={2} />
      <span>{suggestion.text}</span>
      {suggestion.amount !== null && onApply ? (
        <button
          type="button"
          className="setup-suggestion-cta"
          onClick={() => onApply(suggestion.amount!)}
        >
          Usar {formatMoney(suggestion.amount, currency)}
        </button>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="fld">
      <label className="fld-label">{label}</label>
      {children}
      {hint && !error ? (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
          {hint}
        </div>
      ) : null}
      {error ? (
        <div className="fld-err" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <input
      className="inp"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
    />
  );
}

/** Campo de monto. Devuelve `null` cuando está vacío (distinto de 0). */
export function MoneyInput({
  value,
  onChange,
  currency,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  currency: string;
  placeholder?: string;
}) {
  return (
    <div className="setup-money">
      <span className="setup-money-cur">{currency}</span>
      <input
        className="inp"
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value === null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : null);
        }}
        placeholder={placeholder}
      />
    </div>
  );
}

export function SelectInput({
  value,
  onChange,
  options,
  placeholder = "Selecciona…",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select className="sel" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Lista de lo que YA existe. Al reentrar al asistente, cada paso abre con esto
 * — no arranca vacío — y desde acá se edita o se borra por el action de la app.
 */
export function ExistingList({
  items,
  empty,
}: {
  items: {
    id: string;
    title: string;
    sub?: string;
    value?: string;
    locked?: boolean;
    actions?: ReactNode;
  }[];
  empty: string;
}) {
  if (items.length === 0) {
    return <div className="setup-empty">{empty}</div>;
  }
  return (
    <ul className="setup-list">
      {items.map((it) => (
        <li key={it.id} className="setup-list-row">
          <div className="setup-list-main">
            <div className="setup-list-title">
              {it.title}
              {it.locked ? (
                <span className="setup-lock" title="Se edita en su módulo">
                  <Icon name="lock" width={2} />
                </span>
              ) : null}
            </div>
            {it.sub ? <div className="setup-list-sub">{it.sub}</div> : null}
          </div>
          {it.value ? <div className="setup-list-value">{it.value}</div> : null}
          {it.actions ? <div className="setup-list-actions">{it.actions}</div> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Contenedor de un alta/edición dentro de un paso. Ejecuta el action recibido,
 * muestra sus errores tal cual vienen y refresca el servidor al terminar — que
 * es lo que hace que el progreso derivado se recalcule sin estado local.
 */
export function InlineForm({
  submitLabel,
  onSubmit,
  onDone,
  disabled,
  children,
  secondary,
}: {
  submitLabel: string;
  onSubmit: () => Promise<ActionLike>;
  onDone?: () => void;
  disabled?: boolean;
  children?: ReactNode;
  secondary?: ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await onSubmit();
      if (res.ok) {
        // El servidor vuelve a leer el estado real: el paso se repinta con lo
        // recién creado y el progreso derivado se actualiza solo.
        router.refresh();
        onDone?.();
      } else {
        setError(res.message ?? Object.values(res.fieldErrors ?? {})[0] ?? "No pudimos guardar.");
      }
    });
  };

  return (
    <div className="setup-form">
      {children}
      {error ? (
        <div className="auth-msg warn" role="alert">
          {error}
        </div>
      ) : null}
      <div className="setup-form-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={pending || disabled}
        >
          {pending ? "Guardando…" : submitLabel}
        </button>
        {secondary}
      </div>
    </div>
  );
}

/** Botón de acción suelto sobre una fila existente (editar monto, borrar…). */
export function RowAction({
  label,
  onRun,
  danger,
}: {
  label: string;
  onRun: () => Promise<ActionLike>;
  danger?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={cn("setup-row-action", danger && "danger")}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await onRun();
          if (res.ok) router.refresh();
        })
      }
    >
      {pending ? "…" : label}
    </button>
  );
}

/** Bloque plegable para "agregar otro" sin ocupar la pantalla por defecto. */
export function AddBlock({
  label,
  openLabel,
  defaultOpen = false,
  children,
}: {
  label: string;
  openLabel?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!open) {
    return (
      <button type="button" className="setup-add" onClick={() => setOpen(true)}>
        <Icon name="plus" width={2.2} /> {label}
      </button>
    );
  }
  return (
    <div className="setup-add-open">
      <div className="setup-add-head">
        <span>{openLabel ?? label}</span>
        <button type="button" className="setup-add-close" onClick={() => setOpen(false)}>
          <Icon name="x" width={2.2} />
        </button>
      </div>
      {children}
    </div>
  );
}
