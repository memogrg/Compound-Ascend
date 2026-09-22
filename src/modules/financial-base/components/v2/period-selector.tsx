"use client";

/** Selector de mes. Cambia ?period=YYYY-MM conservando el tab (hash). */
import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { buildOptions, currentOption } from "@/lib/url-state/period-options";

/* La lógica (ventana de meses, etiquetas, inserción del deep-link viejo) vive ahora en
   `@/lib/url-state/period-options`, compartida con el control global de la barra superior
   v2. Acá solo queda el componente; el comportamiento es el mismo. */

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
