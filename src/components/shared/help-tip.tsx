"use client";

/**
 * Tooltip/ayuda ÚNICO de la app (web + móvil), posicionado con @floating-ui/react.
 *
 * Por qué @floating-ui y no CSS `.tip::after`: el CSS puro NO detecta colisión con el
 * viewport ni voltea de forma fiable (Anchor Positioning no está en el WKWebView de
 * Capacitor). @floating-ui mide el rect real y aplica `flip` (voltea arriba/abajo/izq/der
 * según el espacio) + `shift` (desliza para no cortarse, con padding al borde) + `size`
 * (acota ancho/alto al viewport, con scroll interno si fuera larguísimo). La burbuja NUNCA
 * se corta. Se elige @floating-ui/react sobre Radix porque necesitamos hover (desktop) Y tap
 * (móvil) en el mismo trigger: Radix Tooltip es solo hover y Popover solo click; @floating-ui
 * compone `useHover` + `useClick` + `useDismiss` en un componente headless.
 *
 * Modos:
 *  · sin `children` → botón "?" (con `icon`/`tone` opcionales). Reemplaza al viejo HelpTip.
 *  · con `children` → esos hijos SON el trigger (para envolver un label/valor existente).
 *
 * A11y: role="tooltip" + aria-describedby (useRole), cierra con Escape y tap fuera (useDismiss),
 * abre con foco de teclado (useFocus). Portal a document.body → sin clipping por overflow.
 */
import { useState, type ReactNode } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  size,
  useHover,
  useFocus,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  safePolygon,
  FloatingPortal,
} from "@floating-ui/react";
import { Icon, type IconName } from "@/components/ui/icon";

export function HelpTip({
  text,
  label = "Más información",
  icon,
  tone,
  children,
}: {
  text: ReactNode;
  label?: string;
  icon?: IconName;
  tone?: "pos";
  /** Si se da, ES el trigger (envuelve un elemento existente); si no, se pinta el botón "?". */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "top",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 8 }), // voltea de lado si no cabe
      shift({ padding: 8 }), // desliza dentro del viewport
      size({
        padding: 8,
        apply({ availableWidth, availableHeight, elements }) {
          // Acota al espacio real; scroll interno como red si el texto fuera larguísimo.
          Object.assign(elements.floating.style, {
            maxWidth: `min(320px, ${Math.max(160, availableWidth)}px)`,
            maxHeight: `${Math.max(80, availableHeight)}px`,
          });
        },
      }),
    ],
  });

  const hover = useHover(context, { move: false, mouseOnly: true, handleClose: safePolygon() });
  const focus = useFocus(context);
  const click = useClick(context); // tap en móvil / click en desktop
  const dismiss = useDismiss(context); // Escape + tap fuera
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss, role]);

  return (
    <>
      {children ? (
        <span
          ref={refs.setReference}
          {...getReferenceProps()}
          style={{ display: "inline-flex", verticalAlign: "middle", cursor: "help" }}
        >
          {children}
        </span>
      ) : (
        <button
          ref={refs.setReference}
          type="button"
          className="help-btn"
          aria-label={label}
          style={tone === "pos" ? { color: "var(--pos)", borderColor: "var(--pos)" } : undefined}
          {...getReferenceProps()}
        >
          {icon ? <Icon name={icon} width={2.4} /> : "?"}
        </button>
      )}
      {open ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{
              ...floatingStyles,
              zIndex: 4000,
              overflowY: "auto",
              background: "var(--ink)",
              color: "var(--bg)",
              fontSize: 12.5,
              fontWeight: 400,
              lineHeight: 1.5,
              padding: "10px 13px",
              borderRadius: 10,
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.28)",
              whiteSpace: "normal",
            }}
            {...getFloatingProps()}
          >
            {text}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
