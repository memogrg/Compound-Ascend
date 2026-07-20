"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { capacitorSplashHide } from "@/lib/capacitor/native";

import { beginIntro, endIntro } from "../lib/app-intro";

/**
 * Intro animada del logo "Cuño" al abrir la app (web): el monograma C+ se dibuja a pantalla
 * completa sobre crema (empata el splash nativo → sin salto) y luego el overlay se funde
 * revelando la app.
 *
 * - Se muestra UNA vez por sesión de app (flag en sessionStorage); no reaparece al navegar.
 * - Al montar entrega el relevo del splash nativo con SplashScreen.hide() (no-op en web/SSR),
 *   para que el estático nativo dé paso rápido a la animación.
 * - Overlay por PORTAL a <body>, fixed, z POR ENCIMA del candado (app-lock): así la intro se
 *   ve completa antes de que se pida la biometría (ver lib/app-intro: beginIntro/endIntro
 *   coordinan la secuencia intro → candado).
 * - Al terminar: pointer-events:none + se desmonta (no bloquea). Respeta prefers-reduced-motion
 *   (fade corto sin dibujo).
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
    beginIntro(); // avisa al candado que espere a que termine la intro
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
        // Al terminar el fundido de salida: libera el candado y se desmonta (no antes).
        if (e.animationName === "mi-out") {
          endIntro();
          setShow(false);
        }
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
  position:fixed; inset:0; z-index:10050; /* POR ENCIMA del candado (app-lock, z-9999) */
  display:grid; place-items:center;
  background:#f4f2ec; /* crema: empata el splash nativo claro */
  animation: mi-out 0.42s ease-in 1.06s forwards;
}
/* La intro SIGUE AL TEMA. Antes era crema siempre, así que abrir la app en oscuro
   mostraba un splash claro y luego el fundido descubría una app oscura: exactamente el
   salto que el modo oscuro venía a evitar. Se mira data-theme de html porque la intro
   se portaliza a body, fuera del .m-shell donde viven los tokens.
   Android ya trae drawable-night/splash.png, así que ahí la cadena queda continua:
   splash oscuro, intro oscura, app oscura. En iOS no hay variante oscura del splash
   nativo (Splash.imageset no declara appearances), así que ahí queda un salto crema a
   oscuro en el traspaso del sistema; generar ese asset es su propio delta.
   OJO: nada de acentos graves en este comentario. El CSS vive en un template literal y
   un acento grave cierra la cadena; el error sale como "Expected a semicolon" en una
   línea de comentario, que no ayuda nada a encontrarlo. */
[data-theme="dark"] .mi-overlay{ background:#15140f; }
.mi-stage{ display:flex; flex-direction:column; align-items:center; gap:20px; }
.mi-icon{
  /* Grande y centrado (~40% del ancho, acotado). */
  width: clamp(128px, 40vw, 200px); height: auto; aspect-ratio: 1;
  filter: drop-shadow(0 18px 40px rgba(18,63,39,0.30));
  animation: mi-pop-in 0.5s cubic-bezier(0.2,0.9,0.25,1.1) both, mi-glow 1.5s ease-out both;
}
.mi-c{
  stroke-dasharray: 1500; stroke-dashoffset: 1500;
  animation: mi-draw 0.6s ease-out 0.14s forwards;
}
.mi-plus{
  transform: scale(0); transform-origin: 156px 0;
  animation: mi-plus-pop 0.26s cubic-bezier(0.2,1.5,0.35,1) 0.62s forwards;
}
.mi-word{
  font-family: var(--font-display, "Sora", system-ui, sans-serif);
  font-weight:700; font-size:21px; letter-spacing:-0.01em; color:#1e1c16;
  opacity:0; transform: translateY(8px);
  animation: mi-word-in 0.36s ease-out 0.78s forwards;
}
.mi-word span{ color:#2a6b3e; }

@keyframes mi-draw{ to { stroke-dashoffset:0; } }
@keyframes mi-plus-pop{ 0%{transform:scale(0)} 68%{transform:scale(1.14)} 100%{transform:scale(1)} }
@keyframes mi-pop-in{ 0%{opacity:0; transform:scale(0.88)} 55%{opacity:1} 100%{opacity:1; transform:scale(1)} }
@keyframes mi-glow{ 0%,55%{ filter: drop-shadow(0 18px 40px rgba(18,63,39,0.30)); } 72%{ filter: drop-shadow(0 0 26px rgba(81,175,111,0.55)) drop-shadow(0 18px 40px rgba(18,63,39,0.30)); } 100%{ filter: drop-shadow(0 18px 40px rgba(18,63,39,0.30)); } }
@keyframes mi-word-in{ to { opacity:1; transform:translateY(0); } }
@keyframes mi-out{ to { opacity:0; transform:scale(1.03); } }

@media (prefers-reduced-motion: reduce){
  /* Sin dibujo ni pop: el logo aparece estático y el overlay hace un fade corto. */
  .mi-icon{ animation:none; }
  .mi-c{ stroke-dashoffset:0; animation:none; }
  .mi-plus{ transform:scale(1); animation:none; }
  .mi-word{ opacity:1; transform:none; animation:none; }
  .mi-overlay{ animation: mi-out 0.3s ease-in 0.4s forwards; }
}
`;
