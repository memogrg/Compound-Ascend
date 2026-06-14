"use client";

/** Selector de mes. Cambia ?period=YYYY-MM conservando el tab (hash). */
import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const BACK_MONTHS = 17; // ~18 meses hacia atrás (incluye el mes actual)
const FWD_MONTHS = 1; // un mes futuro (planificación)

function label(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

/**
 * Opciones ancladas al mes actual REAL (`now`), no al `current` seleccionado.
 * Así el mes actual siempre aparece sin importar cuál esté elegido (antes se
 * generaban hacia atrás desde `current`, y elegir un mes viejo "escondía" los
 * más nuevos). Si `current` cae fuera del rango (deep-link antiguo), se inserta.
 */
function buildOptions(current: string, now = new Date()): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  // Arranca en el mes futuro más lejano y baja hasta BACK_MONTHS atrás.
  let y = now.getFullYear();
  let m = now.getMonth() + 1 + FWD_MONTHS;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  for (let i = 0; i < BACK_MONTHS + 1 + FWD_MONTHS; i++) {
    out.push({ value: `${y}-${String(m).padStart(2, "0")}`, label: label(y, m) });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  // Garantiza que el periodo seleccionado siempre esté disponible.
  if (/^\d{4}-\d{2}$/.test(current) && !out.some((o) => o.value === current)) {
    const [cy, cm] = current.split("-").map(Number);
    out.push({ value: current, label: label(cy!, cm!) });
    out.sort((a, b) => b.value.localeCompare(a.value)); // descendente
  }
  return out;
}

/** Opción mínima (solo el mes seleccionado) para el primer render/SSR. */
function currentOption(current: string): { value: string; label: string } {
  if (/^\d{4}-\d{2}$/.test(current)) {
    const [y, m] = current.split("-").map(Number);
    return { value: current, label: label(y!, m!) };
  }
  return { value: current, label: current };
}

export function PeriodSelector({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // El ancla del listado es `new Date()` (cliente); para no provocar desajuste
  // de hidratación, el primer render muestra solo el mes seleccionado y tras
  // montar se expande a la ventana completa de meses.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const options = mounted ? buildOptions(current) : [currentOption(current)];

  const onChange = (value: string) => {
    if (value === current) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    // replace (no push) + scroll:false: no apila historial ni salta el scroll;
    // useTransition mantiene la UI interactiva mientras el server recalcula.
    startTransition(() => {
      router.replace(`${pathname}?period=${value}${hash}`, { scroll: false });
    });
  };

  return (
    <label
      className="cur-switch"
      title="Periodo"
      style={{ height: 38, opacity: pending ? 0.6 : 1 }}
      aria-busy={pending}
    >
      <span className="cur-switch-ic" aria-hidden>
        <Icon name="calendar" width={1.8} />
      </span>
      <select value={current} onChange={(e) => onChange(e.target.value)} aria-label="Periodo">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
