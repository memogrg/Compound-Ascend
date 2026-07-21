"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Capa de tooltips ÚNICA (singleton) para toda la app — arreglo de raíz del bug de
 * tooltips que se salían de pantalla. Reemplaza el `.tip::after` puro de CSS (que
 * usaba `left:50%; translateX(-50%)` fijo, sin reposicionar cerca de un borde).
 *
 * Por qué JS y no CSS Anchor Positioning / Popover API: el positioning con colisión
 * de anchor-positioning (`position-try`) NO está en el WebView de iOS (WKWebView) al
 * día de hoy, que es justo el objetivo (Capacitor). Un pequeño helper JS con
 * getBoundingClientRect funciona en TODO webview y degrada bien (sin JS, el
 * `.tip::after` de CSS sigue como fallback — ver globals.css, gated con `:not(.tip-js)`).
 *
 * Cómo cumple los requisitos:
 *  · Se mantiene dentro del viewport: clamp horizontal a [8px, ancho−8px] y flip
 *    arriba/abajo según el espacio.
 *  · Ancho máximo relativo (`min(280px, 100vw−24px)`) en vez de 240px fijo.
 *  · No infla el scrollWidth: la burbuja va en un portal a <body> con position:fixed
 *    y solo existe en el DOM cuando se muestra (montado condicional).
 *
 * Lee `data-tip` de cualquier elemento (los `.tip` existentes), así ninguna llamada
 * individual cambia. Montar una vez por layout (web + móvil).
 */
type TipState = { text: string; anchor: DOMRect };
type Placed = { left: number; top: number };

export function TooltipLayer() {
  const [tip, setTip] = useState<TipState | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const currentEl = useRef<Element | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("tip-js"); // apaga el fallback CSS (ver globals.css)

    const show = (el: Element) => {
      const text = el.getAttribute("data-tip");
      if (!text) return;
      currentEl.current = el;
      setPlaced(null);
      setTip({ text, anchor: el.getBoundingClientRect() });
    };
    const hide = () => {
      currentEl.current = null;
      setTip(null);
      setPlaced(null);
    };

    const closestTip = (t: EventTarget | null): Element | null =>
      t instanceof Element ? t.closest("[data-tip]") : null;

    const onOver = (e: PointerEvent) => {
      const el = closestTip(e.target);
      if (el) {
        if (el !== currentEl.current) show(el);
      } else if (currentEl.current) {
        hide();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = closestTip(e.target);
      if (el) show(el);
      else if (currentEl.current) hide();
    };
    const onDown = (e: PointerEvent) => {
      // Tap/click fuera del trigger actual → ocultar (importante en touch).
      if (currentEl.current && !closestTip(e.target)) hide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", onKey);
    return () => {
      root.classList.remove("tip-js");
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Posiciona tras medir la burbuja real (flip vertical + clamp horizontal).
  useLayoutEffect(() => {
    if (!tip || !bubbleRef.current) return;
    const b = bubbleRef.current.getBoundingClientRect();
    const a = tip.anchor;
    const m = 8;
    let left = a.left + a.width / 2 - b.width / 2;
    left = Math.max(m, Math.min(left, window.innerWidth - b.width - m));
    let top = a.top - b.height - m; // preferencia: arriba
    if (top < m) top = a.bottom + m; // sin espacio arriba → abajo
    setPlaced({ left, top });
  }, [tip]);

  if (!tip || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={bubbleRef}
      role="tooltip"
      style={{
        position: "fixed",
        left: placed?.left ?? -9999,
        top: placed?.top ?? -9999,
        visibility: placed ? "visible" : "hidden",
        maxWidth: "min(280px, calc(100vw - 24px))",
        background: "var(--ink, #1f2430)",
        color: "var(--tip-ink, #fff)",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.35,
        padding: "6px 9px",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,.22)",
        pointerEvents: "none",
        zIndex: 4000,
        whiteSpace: "normal",
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
