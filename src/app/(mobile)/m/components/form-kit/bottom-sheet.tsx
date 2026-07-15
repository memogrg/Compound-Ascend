import { useEffect, useRef, useState } from "react";

import { MobilePortal } from "../mobile-portal";

/**
 * Hoja modal inferior (form kit). Sin directiva "use client": hereda el límite de cliente
 * del componente que la importa (el quick-add), evitando el chequeo de props serializables
 * de módulos-entrada client. Drag handle para cerrar por gesto, cierre por backdrop,
 * contenido scrolleable y safe-area inferior. Scoped a .m-shell. es-MX, tema claro.
 *
 * Se renderiza por portal a <body> (MobilePortal): la hoja es position:fixed y puede
 * invocarse desde componentes anidados en un `.m-glass` (p. ej. la campana, dentro del
 * header pegajoso), donde un fixed quedaría atrapado por el transform del ancestro.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  // Bloquea el scroll del fondo mientras la hoja está abierta.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Reinicia el desplazamiento de arrastre cada vez que se abre.
  useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  if (!open) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startY.current == null) return;
    const dy = e.clientY - startY.current;
    if (dy > 0) setDragY(dy); // solo hacia abajo
  };
  const onPointerUp = () => {
    if (startY.current == null) return;
    const dy = dragY;
    startY.current = null;
    if (dy > 90) onClose();
    else setDragY(0);
  };

  return (
    <MobilePortal>
    <div className="m-sheet-overlay" role="dialog" aria-modal="true" aria-label={title ?? "Formulario"}>
      <button className="m-sheet-backdrop" aria-label="Cerrar" onClick={onClose} />
      <div
        className="m-sheet-panel"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
      >
        <div
          className="m-sheet-grip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="m-sheet-handle" aria-hidden />
          {title ? (
            <div className="m-sheet-head">
              <span className="m-sheet-title">{title}</span>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>
    </MobilePortal>
  );
}
