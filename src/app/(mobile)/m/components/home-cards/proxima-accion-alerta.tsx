import Link from "next/link";

/**
 * Alerta «Próxima mejor acción» del Inicio móvil.
 *
 * Lo que muestra es el `nextBestAction` del Priority Engine (vía el panel), que es un
 * CONSEJO en prosa: no trae una acción con su ruta, a diferencia de la ficha de arriba
 * (`ProximaAccionFicha`, alimentada por `plan.hero`).
 */
export function ProximaAccionAlerta({ texto }: { texto: string }) {
  return (
    // El texto es consejo del Priority Engine; el destino es donde se puede actuar — Mis
    // acciones es el único lugar donde viven las recomendaciones, ver #770.
    <Link href="/m/mis-acciones" className="wgt wgt-nba" style={{ marginBottom: 14 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 13 }}>
        <span
          className="wic"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          aria-hidden
        >
          <StarIcon />
        </span>
        <div style={{ flex: 1 }}>
          <div className="wlabel" style={{ color: "var(--accent)" }}>
            Próxima mejor acción
          </div>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 5, lineHeight: 1.4 }}>
            {texto}
          </div>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.4}
          style={{ width: 18, height: 18, flex: "none", marginTop: 4 }}
          aria-hidden
        >
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 19, height: 19 }}>
      <path d="M12 2 9.6 8.4 3 9.2l4.9 4.4L6.4 21 12 17.3 17.6 21l-1.5-7.4L21 9.2l-6.6-.8Z" />
    </svg>
  );
}
