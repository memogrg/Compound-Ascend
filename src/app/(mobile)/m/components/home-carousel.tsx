"use client";

/**
 * Carrusel de Inicio: pista con scroll-snap nativo + indicador.
 *
 * Scroll NATIVO a propósito, sin librería: `scroll-snap-type: x mandatory` con
 * `scroll-snap-align: center` es lo único que da la inercia y el frenado reales de
 * iOS. Cualquier implementación en JS acaba peleando con el navegador y se nota.
 * Este componente solo aporta dos cosas que el CSS no puede: saber qué tarjeta está
 * activa y distinguir un toque de un arrastre.
 *
 * TOQUE vs ARRASTRE — el detalle que hace que se sienta bien o roto. Las tarjetas son
 * enlaces, así que sin esto cualquier deslizamiento terminaría abriendo una sección.
 * Se registra dónde empezó el gesto y, si el dedo se movió más de UMBRAL_PX, se
 * cancela el click en fase de captura (antes de que el <a> lo reciba).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** Un gesto que mueve más de esto es un arrastre, no un toque. */
const UMBRAL_PX = 10;

export function MHomeCarousel({
  cards,
}: {
  /** Cada tarjeta con su nombre, para el indicador. El orden es el del carrusel. */
  cards: { name: string; node: ReactNode }[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  // Tarjeta activa = la que tiene su centro más cerca del centro de la pista. Se
  // calcula por geometría y no por índice de scroll para que sea correcta con
  // cualquier ancho de tarjeta y en el rebote de los extremos.
  const syncActive = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    Array.from(track.children).forEach((child, i) => {
      const el = child as HTMLElement;
      const center = el.offsetLeft + el.offsetWidth / 2;
      const d = Math.abs(center - mid);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActive((prev) => (prev === best ? prev : best));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      // rAF: el scroll dispara muchísimo y recalcular en cada evento tira frames.
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        syncActive();
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    syncActive();
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [syncActive]);

  const onPointerDown = (e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = startRef.current;
    if (!s) return;
    if (Math.abs(e.clientX - s.x) > UMBRAL_PX || Math.abs(e.clientY - s.y) > UMBRAL_PX) {
      draggedRef.current = true;
    }
  };
  // En CAPTURA: hay que interceptarlo antes de que llegue al <a> de la tarjeta.
  const onClickCapture = (e: React.MouseEvent) => {
    if (draggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      draggedRef.current = false;
    }
  };

  /** Teclado (web): flechas para moverse entre tarjetas, como haría un carrusel real. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const track = trackRef.current;
    if (!track) return;
    const next = e.key === "ArrowRight" ? active + 1 : active - 1;
    const target = track.children[Math.max(0, Math.min(cards.length - 1, next))] as
      | HTMLElement
      | undefined;
    if (!target) return;
    e.preventDefault();
    track.scrollTo({ left: target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2, behavior: "smooth" });
  };

  const activeName = cards[active]?.name ?? "";

  return (
    <div className="m-carousel-wrap">
      <div
        ref={trackRef}
        className="m-carousel"
        role="group"
        aria-roledescription="carrusel"
        aria-label="Resumen financiero"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onClickCapture={onClickCapture}
      >
        {cards.map((c, i) => (
          <div
            key={c.name}
            style={{ display: "contents" }}
            aria-roledescription="tarjeta"
            aria-label={`${i + 1} de ${cards.length}: ${c.name}`}
          >
            {c.node}
          </div>
        ))}
      </div>

      {/* Indicador: puntos + SOLO el nombre de la activa. Listar los 7 nombres sería
          una barra de navegación, no un indicador de posición. El aria-live anuncia
          el cambio a quien usa lector de pantalla. */}
      <div className="m-carousel-ind">
        <span className="m-carousel-dots" aria-hidden>
          {cards.map((c, i) => (
            <span key={c.name} className={`m-carousel-dot${i === active ? " on" : ""}`} />
          ))}
        </span>
        <span className="m-carousel-name" aria-live="polite">
          {activeName}
          <span className="sr-only">{` · ${active + 1} de ${cards.length}`}</span>
        </span>
      </div>
    </div>
  );
}
