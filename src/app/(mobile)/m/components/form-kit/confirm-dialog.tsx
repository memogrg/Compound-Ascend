/**
 * ConfirmDialog (form kit): confirmación de una acción destructiva. La variante
 * "warning" + `dependencies` avisa que el borrado afecta a otras entidades vinculadas
 * (deudas/metas/pólizas…), antes de ejecutar. Scoped a .m-shell.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  variant = "danger",
  dependencies,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  dependencies?: string[];
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="m-dialog-overlay" role="alertdialog" aria-modal="true" aria-label={title}>
      <button className="m-sheet-backdrop" aria-label={cancelLabel} onClick={onCancel} />
      <div className="m-dialog">
        <div className="m-dialog-title">{title}</div>
        {message ? <p className="m-dialog-msg">{message}</p> : null}

        {dependencies && dependencies.length > 0 ? (
          <div className="m-dialog-warn">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Esto afecta {dependencies.length} elemento{dependencies.length === 1 ? "" : "s"} vinculado
              {dependencies.length === 1 ? "" : "s"}:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {dependencies.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="m-dialog-actions">
          <button type="button" className="m-btn m-btn-secondary" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`m-btn ${variant === "danger" ? "m-btn-danger" : "m-btn-warning"}`}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Un momento…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
