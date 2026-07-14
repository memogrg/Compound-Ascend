import { useRef, useState } from "react";

/**
 * SwipeRow (form kit): fila que se desliza a la izquierda para revelar acciones de
 * Editar / Eliminar. Solo engancha el gesto cuando es horizontal (no bloquea el scroll
 * vertical de la lista). Scoped a .m-shell.
 */
const ACTION_W = 78; // px por acción

export function SwipeRow({
  children,
  onEdit,
  onDelete,
  onTap,
  editLabel = "Editar",
  deleteLabel = "Eliminar",
}: {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Toque simple sobre la fila (no se dispara al deslizar). Opcional: abre un menú, etc. */
  onTap?: () => void;
  editLabel?: string;
  deleteLabel?: string;
}) {
  const count = (onEdit ? 1 : 0) + (onDelete ? 1 : 0);
  const max = count * ACTION_W;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const axis = useRef<"h" | "v" | null>(null);
  // true si el gesto que acaba de terminar fue un deslizamiento horizontal: el click
  // sintético que lo sigue NO debe contar como toque.
  const swiped = useRef(false);

  if (count === 0) return <>{children}</>;

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, base: dx };
    axis.current = null;
    swiped.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dX = e.clientX - start.current.x;
    const dY = e.clientY - start.current.y;
    if (axis.current === null) {
      if (Math.abs(dX) < 6 && Math.abs(dY) < 6) return;
      axis.current = Math.abs(dX) > Math.abs(dY) ? "h" : "v";
      if (axis.current === "h") {
        setDragging(true);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch {
          // setPointerCapture puede lanzar si el puntero ya no está activo; no es crítico.
        }
      }
    }
    if (axis.current !== "h") return; // gesto vertical → lo maneja el scroll
    const next = Math.max(-max, Math.min(0, start.current.base + dX));
    setDx(next);
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (axis.current === "h") {
      setDx((d) => (d < -max * 0.4 ? -max : 0));
      swiped.current = true;
    }
    axis.current = null;
  };
  const close = () => setDx(0);

  /** Toque simple: ignora el click que sigue a un deslizamiento; si la fila está abierta, la cierra. */
  const onClick = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (dx !== 0) {
      close();
      return;
    }
    onTap?.();
  };

  return (
    <div className="m-swipe">
      <div className="m-swipe-actions" style={{ width: max }} aria-hidden={dx === 0}>
        {onEdit ? (
          <button
            type="button"
            className="m-swipe-act m-swipe-edit"
            style={{ width: ACTION_W }}
            onClick={() => {
              onEdit();
              close();
            }}
          >
            {editLabel}
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className="m-swipe-act m-swipe-del"
            style={{ width: ACTION_W }}
            onClick={() => {
              onDelete();
              close();
            }}
          >
            {deleteLabel}
          </button>
        ) : null}
      </div>
      <div
        className="m-swipe-content"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
      >
        {children}
      </div>
    </div>
  );
}
