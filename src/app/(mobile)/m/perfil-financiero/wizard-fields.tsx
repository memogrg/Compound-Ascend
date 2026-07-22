/**
 * Primitivas de campo del wizard móvil (ADN financiero), con la piel de mobile.css.
 * (Sin directiva "use client": este módulo hereda el límite de cliente del wizard shell
 * que lo importa — evita el chequeo de props serializables de módulos-entrada client.)
 * Cada una es controlada (value + onChange) y agnóstica de ProfileDraft: la config de
 * pasos (mobile-profile-wizard.tsx) las conecta a las claves del draft. Espeja el
 * comportamiento de las primitivas web (personal-profile/components/primitives.tsx)
 * sin reimplementar lógica de negocio — solo UI.
 */

export type Opt = { value: string; label: string; desc?: string };

/** Etiqueta de pregunta (encima de cada campo). */
function QLabel({ children }: { children: React.ReactNode }) {
  return <div className="m-qlabel">{children}</div>;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  inputMode,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "email";
}) {
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      <input
        className="m-inp"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
      />
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      <input
        className="m-inp"
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        min={min}
        max={max}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(undefined);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        placeholder={placeholder}
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Selecciona…",
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: Opt[];
  placeholder?: string;
}) {
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      <select className="m-inp m-select" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      <textarea
        className="m-inp m-textarea"
        rows={4}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
      />
    </div>
  );
}

/** Selección única — tarjetas grandes con descripción opcional. */
export function OptionCards({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: Opt[];
}) {
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      <div className="m-optlist">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`m-opt${value === o.value ? " sel" : ""}`}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            <span>
              <span className="m-opt-t">{o.label}</span>
              {o.desc ? <span className="m-opt-d">{o.desc}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Selección única — grilla compacta (sin descripción). */
export function OptionGrid({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: Opt[];
}) {
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      <div className="m-optgrid">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`m-opt-sm${value === o.value ? " sel" : ""}`}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Selección múltiple — chips con tope opcional. */
export function Chips({
  label,
  values,
  onChange,
  options,
  max,
}: {
  label: string;
  values: string[] | undefined;
  onChange: (v: string[]) => void;
  options: Opt[];
  max?: number;
}) {
  const sel = values ?? [];
  const toggle = (v: string) => {
    if (sel.includes(v)) return onChange(sel.filter((x) => x !== v));
    if (max && sel.length >= max) return; // respeta el tope, ignora extras
    onChange([...sel, v]);
  };
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      <div className="m-chips">
        {options.map((o) => {
          const on = sel.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              className={`m-chip${on ? " sel" : ""}`}
              aria-pressed={on}
              onClick={() => toggle(o.value)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {max ? (
        <div className="m-chips-hint">
          Máximo {max} · {sel.length}/{max} seleccionadas
        </div>
      ) : null}
    </div>
  );
}

/**
 * Selección múltiple ORDENADA (ranking de prioridad): el orden en que tocas las opciones es
 * la jerarquía (1ª = primaria, 2ª = secundaria, 3ª = terciaria). Cada elegido muestra su
 * número y color por rango. Mínimo 1 (basta 1 para avanzar), máximo `max` (por defecto 3).
 *
 * El color por rango vive en CSS (clases `chip-ranked`/`chip-rank-N` + `--rank-c`, compartidas
 * con la web; ver globals.css y mobile.css): fondo del color con texto/número BLANCOS y
 * contraste AA. Sin color inline sobre el texto (dejaba el label invisible sobre el relleno).
 */
export function RankedChips({
  label,
  values,
  onChange,
  options,
  max = 3,
}: {
  label: string;
  values: string[] | undefined;
  onChange: (v: string[]) => void;
  options: Opt[];
  max?: number;
}) {
  const sel = values ?? [];
  const toggle = (v: string) => {
    const i = sel.indexOf(v);
    if (i >= 0) return onChange(sel.filter((x) => x !== v));
    if (sel.length >= max) return;
    onChange([...sel, v]);
  };
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      <div className="m-chips">
        {options.map((o) => {
          const rank = sel.indexOf(o.value);
          const on = rank >= 0;
          const cls = ["m-chip", "chip-ranked", on ? "sel" : "", on ? `chip-rank-${Math.min(rank + 1, 3)}` : ""]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={o.value}
              type="button"
              className={cls}
              aria-pressed={on}
              aria-label={on ? `${o.label} (prioridad ${rank + 1})` : o.label}
              onClick={() => toggle(o.value)}
            >
              {on ? (
                <span className="rank-badge" aria-hidden>
                  {rank + 1}
                </span>
              ) : null}
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="m-chips-hint">
        Toca en orden de prioridad — 1ª, 2ª y 3ª. Elige al menos 1 (hasta {max}). {sel.length}/{max}
      </div>
    </div>
  );
}

/** Escala 1–N (por defecto 1–5) con extremos etiquetados. `max` es la fuente única del rango. */
export function Scale({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
  max = 5,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  lowLabel: string;
  highLabel: string;
  max?: number;
}) {
  const mid = Math.ceil(max / 2);
  const v = value ?? mid;
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      <div className="m-scale">
        <div className="m-scale-val mono">{v}</div>
        <input
          type="range"
          min={1}
          max={max}
          step={1}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
        <div className="m-scale-ends">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      </div>
    </div>
  );
}

/** Contador +/- acotado. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 30,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const v = value ?? 0;
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      <div className="m-stepper">
        <button type="button" onClick={() => onChange(clamp(v - 1))} aria-label="Restar" disabled={v <= min}>
          −
        </button>
        <span className="m-stepper-v mono">{v}</span>
        <button type="button" onClick={() => onChange(clamp(v + 1))} aria-label="Sumar" disabled={v >= max}>
          +
        </button>
      </div>
    </div>
  );
}

/** Sí / No → boolean. */
export function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      <div className="m-yesno">
        <button
          type="button"
          className={`m-opt-sm${value === true ? " sel" : ""}`}
          aria-pressed={value === true}
          onClick={() => onChange(true)}
        >
          Sí
        </button>
        <button
          type="button"
          className={`m-opt-sm${value === false ? " sel" : ""}`}
          aria-pressed={value === false}
          onClick={() => onChange(false)}
        >
          No
        </button>
      </div>
    </div>
  );
}

/** Lista de correos (invitación de núcleo familiar), tope opcional. */
export function EmailList({
  label,
  values,
  onChange,
  max = 4,
}: {
  label: string;
  values: string[] | undefined;
  onChange: (v: string[]) => void;
  max?: number;
}) {
  const list = values ?? [];
  const update = (i: number, v: string) => onChange(list.map((x, idx) => (idx === i ? v : x)));
  const add = () => {
    if (list.length >= max) return;
    onChange([...list, ""]);
  };
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  return (
    <div className="m-qfield">
      <QLabel>{label}</QLabel>
      {list.map((email, i) => (
        <div key={i} className="m-emailrow">
          <input
            className="m-inp"
            type="email"
            inputMode="email"
            value={email}
            placeholder="correo@ejemplo.com"
            onChange={(e) => update(i, e.target.value)}
          />
          <button type="button" className="m-emailrm" onClick={() => remove(i)} aria-label="Quitar correo">
            ✕
          </button>
        </div>
      ))}
      {list.length < max ? (
        <button type="button" className="m-btn m-btn-secondary m-emailadd" onClick={add}>
          + Agregar correo
        </button>
      ) : null}
    </div>
  );
}
