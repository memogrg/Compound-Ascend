/**
 * Placeholder de pantalla móvil aún no construida. Mantiene el frame (`.m-shell`
 * + tab bar del layout app) para que la navegación sea consistente mientras se
 * construyen las pantallas por deltas. NO es la pantalla real.
 */
export function MobileStub({ title }: { title: string }) {
  return (
    <div className="m-scroll">
      <div className="m-pad">
        <h1 className="sec-title" style={{ marginBottom: 6 }}>
          {title}
        </h1>
        <div className="m-stub">
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, marginBottom: 6 }}>
              Pronto
            </div>
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              Estamos construyendo esta pantalla. Vuelve en breve.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
