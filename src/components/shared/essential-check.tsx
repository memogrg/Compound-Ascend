"use client";

/**
 * Check "Gasto esencial (número de seguridad)": marca gastos/deudas/metas/pólizas
 * que alimentan el NÚMERO DE SEGURIDAD (capital que, al 8%, ya cubre lo
 * indispensable). Etiqueta específica a propósito: NO confundir con el "esencial"
 * de Mi Base (expense_items.nature), que mide otra cosa (% del ingreso).
 */

const TIP_DEFAULT =
  "Un gasto esencial es el que no podrías dejar de pagar sin afectar tu bienestar " +
  "básico: comida, vivienda, salud, transporte, servicios. Alimenta tu número de " +
  "seguridad (no el % de gastos esenciales de Mi Base).";

/** Copy específico para AHORROS: distingue costo periódico de meta de acumulación. */
export const TIP_SAVINGS_ESSENTIAL =
  "Marcá como esencial solo los ahorros que son costos periódicos ineludibles " +
  "(marchamo, seguro anual, impuestos), no metas de acumulación (casa, viaje). Una " +
  "meta de acumulación termina y no es un costo de vivir; marcarla infla tu número " +
  "de seguridad con algo que va a desaparecer.";

export function EssentialCheck({
  name,
  defaultChecked,
  checked,
  onChange,
  tip = TIP_DEFAULT,
  disabled,
}: {
  /** Para forms FormData: el checkbox va como este `name` (no controlado). */
  name?: string;
  defaultChecked?: boolean;
  /** Para uso controlado (pasá checked + onChange en vez de name). */
  checked?: boolean;
  onChange?: (v: boolean) => void;
  /** Tooltip; usá TIP_SAVINGS_ESSENTIAL en el form de ahorros. */
  tip?: string;
  disabled?: boolean;
}) {
  const controlled = onChange !== undefined;
  return (
    <label
      className="fld-check"
      style={{ display: "flex", alignItems: "center", gap: 8, cursor: disabled ? "default" : "pointer" }}
    >
      <input
        type="checkbox"
        name={controlled ? undefined : name}
        {...(controlled ? { checked, onChange: (e) => onChange!(e.target.checked) } : { defaultChecked })}
        disabled={disabled}
      />
      <span style={{ fontSize: 13 }}>Gasto esencial (número de seguridad)</span>
      <span
        className="tip"
        data-tip={tip}
        aria-label="Qué es un gasto esencial"
        style={{ display: "inline-flex", color: "var(--muted)", cursor: "help" }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
        </svg>
      </span>
    </label>
  );
}
