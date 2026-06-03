"use client";

/**
 * Modal accesible compartido por todos los diálogos de la app.
 * - Cierra con Escape y con clic en el fondo (scrim).
 * - Atrapa el foco dentro del diálogo (Tab / Shift+Tab cíclico).
 * - Enfoca el primer campo al abrir y devuelve el foco al disparador al cerrar.
 * - Bloquea el scroll del fondo mientras está abierto.
 * - ARIA: role="dialog", aria-modal, aria-labelledby / aria-describedby.
 */
import { useEffect, useId, useRef } from "react";
import { Icon } from "@/components/ui/icon";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Enfoca el primer campo real (no el botón de cerrar) al abrir.
    const focusables = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    const firstField = focusables.find((el) => !el.classList.contains("modal-x"));
    (firstField ?? dialog)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={sub ? subId : undefined}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            <div className="modal-title" id={titleId}>
              {title}
            </div>
            {sub ? (
              <div className="modal-sub" id={subId}>
                {sub}
              </div>
            ) : null}
          </div>
          <button className="modal-x" aria-label="Cerrar" onClick={onClose}>
            <Icon name="x" width={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
