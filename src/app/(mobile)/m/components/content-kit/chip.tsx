import type { ReactNode } from "react";

import { TONE_BADGE, type MTone } from "./tone";

/** Chip de tono suave (neutral · éxito · atención · alerta). Mono, píldora, sin marco. */
export function MChip({ children, tone = "neutral" }: { children: ReactNode; tone?: MTone }) {
  return <span className={TONE_BADGE[tone]}>{children}</span>;
}
