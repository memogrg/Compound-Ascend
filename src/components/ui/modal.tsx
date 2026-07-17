"use client";

/**
 * Modal accesible compartido. Se monta en un portal a document.body para que
 * el position:fixed del scrim no quede atrapado por ancestros con transform/
 * backdrop-filter (que rompían el centrado y el fondo).
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  // Cierre por scrim solo si el gesto EMPIEZA y TERMINA en el scrim. Evita que
  // un arrastre que nace dentro del modal (p. ej. seleccionar texto) y suelta
  // sobre el fondo cierre el cuadro sin querer. Pointer events cubren mouse+touch.
  const pointerDownOnScrim = useRef(false);
  const titleId = useId();
  const subId = useId();
  const [mounted, setMounted] = useState(false);

  // onClose siempre fresco en un ref: el listener de teclado (dep []) no captura
  // una identidad vieja, y así NO depende de que onClose sea estable.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => setMounted(true), []);

  // Foco inicial + bloqueo de scroll: UNA sola vez, cuando el portal ya montó
  // (antes dependía de [onClose] y se re-ejecutaba en cada render de un caller
  // con onClose inestable → robaba el foco al primer campo en cada tecla).
  useEffect(() => {
    if (!mounted) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    const firstField = focusables.find((el) => !el.classList.contains("modal-x"));
    (firstField ?? dialog)?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [mounted]);

  // Escape + trampa de Tab: listener estable (dep []); usa onCloseRef y lee el
  // dialog del ref en el momento del evento.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      const dialog = dialogRef.current;
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
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="modal-scrim open"
      onPointerDown={(e) => {
        pointerDownOnScrim.current = e.target === e.currentTarget;
      }}
      onPointerUp={(e) => {
        if (pointerDownOnScrim.current && e.target === e.currentTarget) onClose();
        pointerDownOnScrim.current = false;
      }}
    >
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
    </div>,
    document.body,
  );
}
