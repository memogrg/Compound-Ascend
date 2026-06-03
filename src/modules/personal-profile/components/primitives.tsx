"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { Option } from "@/modules/personal-profile/constants";
import { cn } from "@/lib/utils";

/** Burbuja de ayuda accesible (?) que explica para qué sirve un paso/campo. */
export function HelpTip({ text, label = "Más información" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help-tip" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="help-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open ? (
        <span className="help-pop" role="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  );
}

/** Dropdown simple basado en <select>. */
export function Dropdown({
  options,
  value,
  onChange,
  placeholder = "Selecciona…",
}: {
  options: Option[];
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select className="sel" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
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

/** Tarjetas de elección única (estilo Setup Wizard). */
export function OptionCards({
  options,
  value,
  onChange,
  cols = 2,
}: {
  options: Option[];
  value?: string;
  onChange: (v: string) => void;
  cols?: 2 | 3;
}) {
  return (
    <div className={cn("opt-grid", cols === 3 ? "c3" : "c2")}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={cn("opt", value === o.value && "selected")}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
        >
          <span className="opt-check">
            <Icon name="check" width={3} />
          </span>
          {o.icon ? (
            <span className="opt-icon">
              <Icon name={o.icon} />
            </span>
          ) : null}
          <span className="opt-name">{o.label}</span>
          {o.desc ? <span className="opt-desc">{o.desc}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Chips de selección múltiple. */
export function Chips({
  options,
  values,
  onToggle,
  max,
}: {
  options: Option[];
  values: string[];
  onToggle: (v: string) => void;
  max?: number;
}) {
  return (
    <div className="chip-grid">
      {options.map((o) => {
        const on = values.includes(o.value);
        const disabled = !on && max !== undefined && values.length >= max;
        return (
          <button
            type="button"
            key={o.value}
            className={cn("chip-sel", on && "on")}
            onClick={() => !disabled && onToggle(o.value)}
            aria-pressed={on}
            style={disabled ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Escala 1–10. */
export function Scale({
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  value?: number;
  onChange: (v: number) => void;
  lowLabel?: string;
  highLabel?: string;
}) {
  return (
    <div>
      <div className="scale">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            type="button"
            key={n}
            className={cn("scale-btn", value === n && "on")}
            onClick={() => onChange(n)}
            aria-pressed={value === n}
          >
            {n}
          </button>
        ))}
      </div>
      {(lowLabel || highLabel) && (
        <div
          className="muted"
          style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginTop: 8 }}
        >
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}

/** Selector Sí / No. */
export function YesNo({
  question,
  desc,
  value,
  onChange,
}: {
  question: string;
  desc?: string;
  value?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="yn">
      <div>
        <div className="yn-q">{question}</div>
        {desc ? <div className="yn-d">{desc}</div> : null}
      </div>
      <div className="yn-controls">
        <button
          type="button"
          className={cn("yn-btn", "yes", value === true && "on")}
          onClick={() => onChange(true)}
        >
          Sí
        </button>
        <button
          type="button"
          className={cn("yn-btn", "no", value === false && "on")}
          onClick={() => onChange(false)}
        >
          No
        </button>
      </div>
    </div>
  );
}

/** Stepper numérico +/−. */
export function NumStepper({
  value,
  onChange,
  min = 0,
  max = 30,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="num-stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Menos">
        −
      </button>
      <div className="val">{value}</div>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="Más">
        +
      </button>
    </div>
  );
}
