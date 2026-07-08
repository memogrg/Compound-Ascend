/**
 * FAB (+) del form kit: botón flotante para "quick-add", fijo abajo a la derecha por
 * encima de la tab bar y respetando la safe area. Scoped a .m-shell.
 */
export function Fab({ onClick, label = "Agregar" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="m-fab" onClick={onClick} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
