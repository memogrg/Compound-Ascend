"use client";

/** Selector de mes. Cambia ?period=YYYY-MM conservando el tab (hash). */
import { useRouter, usePathname } from "next/navigation";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function buildOptions(current: string): { value: string; label: string }[] {
  const [cy, cm] = current.split("-").map(Number);
  const out: { value: string; label: string }[] = [];
  let y = cy!;
  let m = cm!;
  for (let i = 0; i < 12; i++) {
    out.push({ value: `${y}-${String(m).padStart(2, "0")}`, label: `${MONTHS[m - 1]} ${y}` });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export function PeriodSelector({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const options = buildOptions(current);

  const onChange = (value: string) => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.push(`${pathname}?period=${value}${hash}`);
  };

  return (
    <label className="cur-switch" title="Periodo" style={{ height: 38 }}>
      <span className="cur-switch-ic" aria-hidden>
        📅
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
