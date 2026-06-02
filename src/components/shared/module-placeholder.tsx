import { EmptyState } from "@/components/shared/states";

/**
 * Placeholder de módulo para F0: comunica el propósito de cada módulo de la
 * Biblia mientras se construye su funcionalidad en fases posteriores.
 */
export function ModulePlaceholder({
  title,
  purpose,
  phase,
}: {
  title: string;
  purpose: string;
  phase: string;
}) {
  return (
    <section className="grid">
      <EmptyState
        title={title}
        description={purpose}
        action={
          <span className="chip" style={{ background: "var(--chip)", color: "var(--muted)" }}>
            Disponible en {phase}
          </span>
        }
      />
    </section>
  );
}
