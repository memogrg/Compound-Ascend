"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { capacitorSplashHide } from "@/lib/capacitor/native";

/**
 * Intro animada del logo "Cuño" al abrir la app (web): el monograma C+ se dibuja sobre fondo
 * crema (empata el splash nativo → sin salto) y luego el overlay se funde revelando la app.
 *
 * - Se muestra UNA vez por sesión de app (flag en sessionStorage); no reaparece al navegar.
 * - Al montar entrega el relevo desde el splash nativo con SplashScreen.hide() (si el plugin
 *   está; no-op en web/SSR).
 * - Overlay por PORTAL a <body> (fuera del cristal del header), fixed, z alto; se desmonta al
 *   terminar (no bloquea la interacción).
 * - Respeta prefers-reduced-motion: sin dibujo/pop, solo un fade corto.
 */
const FLAG = "cartera:intro-shown";

export function MobileIntro() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Solo la primera vez en esta sesión de app.
    let already = false;
    try {
      already = sessionStorage.getItem(FLAG) === "1";
      sessionStorage.setItem(FLAG, "1");
    } catch {
      // sessionStorage puede fallar en modos restringidos; entonces se muestra igual.
    }
    if (already) return;
    setShow(true);
    // Entrega del splash nativo a la intro web (crema → crema, sin gap).
    capacitorSplashHide();
  }, []);

  if (!show || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="mi-overlay"
      aria-hidden
      onAnimationEnd={(e) => {
        // El overlay se desmonta cuando termina su fundido de salida (no antes).
        if (e.animationName === "mi-out") setShow(false);
      }}
    >
      <style>{CSS}</style>
      <div className="mi-stage">
        <svg viewBox="0 0 1024 1024" className="mi-icon" role="img" aria-label="CARTERA+">
          <defs>
            <linearGradient id="mi-em" x1="0" y1="0" x2="0.18" y2="1">
              <stop offset="0" stopColor="#43a76c" />
              <stop offset="0.5" stopColor="#2c7d4b" />
              <stop offset="1" stopColor="#123f27" />
            </linearGradient>
            <radialGradient id="mi-tl" cx="32%" cy="18%" r="64%">
              <stop offset="0" stopColor="#c9f6da" stopOpacity="0.6" />
              <stop offset="46%" stopColor="#c9f6da" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#c9f6da" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="mi-ag" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#e3ebe5" />
            </linearGradient>
          </defs>
          <rect width="1024" height="1024" rx="232" fill="url(#mi-em)" />
          <rect width="1024" height="1024" rx="232" fill="url(#mi-tl)" />
          <g transform="translate(512,512)" className="mi-mono">
            {/* La "C" se dibuja con dasharray/offset */}
            <path
              className="mi-c"
              d="M 116 -238 A 265 265 0 1 0 116 238"
              fill="none"
              stroke="url(#mi-ag)"
              strokeWidth={88}
              strokeLinecap="round"
            />
            {/* El "+" entra con un pop */}
            <path
              className="mi-plus"
              d="M 156 -95 L 156 95 M 61 0 L 251 0"
              fill="none"
              stroke="url(#mi-ag)"
              strokeWidth={88}
              strokeLinecap="round"
            />
          </g>
        </svg>
        <div className="mi-word">
          CARTERA<span>+</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const CSS = `
.mi-overlay{
  position:fixed; inset:0; z-index:9998;
  display:grid; place-items:center;
  background:#f4f2ec; /* crema: empata el splash nativo */
  animation: mi-out 0.36s ease-in 0.92s forwards;
}
.mi-stage{ display:flex; flex-direction:column; align-items:center; gap:16px; }
.mi-icon{
  width:112px; height:112px;
  filter: drop-shadow(0 14px 30px rgba(18,63,39,0.28));
  animation: mi-pop-in 0.42s cubic-bezier(0.2,0.9,0.25,1.1) both;
}
.mi-c{
  stroke-dasharray: 1500; stroke-dashoffset: 1500;
  animation: mi-draw 0.55s ease-out 0.12s forwards;
}
.mi-plus{
  transform: scale(0); transform-origin: 156px 0;
  animation: mi-plus-pop 0.28s cubic-bezier(0.2,1.4,0.35,1) 0.5s forwards;
}
.mi-word{
  font-family: var(--font-display, "Sora", system-ui, sans-serif);
  font-weight:700; font-size:19px; letter-spacing:-0.01em; color:#1e1c16;
  opacity:0; transform: translateY(6px);
  animation: mi-word-in 0.34s ease-out 0.62s forwards;
}
.mi-word span{ color:#2a6b3e; }

@keyframes mi-draw{ to { stroke-dashoffset:0; } }
@keyframes mi-plus-pop{ 0%{transform:scale(0)} 70%{transform:scale(1.12)} 100%{transform:scale(1)} }
@keyframes mi-pop-in{ 0%{opacity:0; transform:scale(0.9)} 60%{opacity:1} 100%{opacity:1; transform:scale(1)} }
@keyframes mi-word-in{ to { opacity:1; transform:translateY(0); } }
@keyframes mi-out{ to { opacity:0; transform:scale(1.02); } }

@media (prefers-reduced-motion: reduce){
  /* Sin dibujo ni pop: el logo aparece estático y el overlay hace un fade corto. */
  .mi-icon{ animation:none; }
  .mi-c{ stroke-dashoffset:0; animation:none; }
  .mi-plus{ transform:scale(1); animation:none; }
  .mi-word{ opacity:1; transform:none; animation:none; }
  .mi-overlay{ animation: mi-out 0.3s ease-in 0.35s forwards; }
}
`;
