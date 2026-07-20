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
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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

  /**
   * Tarjeta activa: la que tiene su centro más cerca del centro de la pista, recalculado
   * en cada scroll (agrupado por rAF, que es la cadencia a la que el navegador pinta —
   * medir más veces no cambiaría ni un píxel de lo que se ve).
   *
   * POR QUÉ ASÍ Y NO CON IntersectionObserver: el observador necesitaría una franja
   * central definida con `rootMargin` en porcentaje sobre un root desplazable, y eso
   * no lo puedo probar en ningún navegador al que tenga acceso — quedaría fiado a que
   * WKWebView se comporte como espero. Esta versión es aritmética pura sobre
   * getBoundingClientRect: siempre hay exactamente una respuesta, nunca es ambigua
   * durante el tránsito entre dos tarjetas, y vale igual para el estado inicial.
   *
   * EL BUG QUE ARREGLA: antes se medía con offsetLeft/offsetWidth de los hijos de la
   * pista, pero esos hijos eran envoltorios con `display: contents` — que NO generan
   * caja, así que devolvían 0. Todas las tarjetas empataban en "centro 0" y el índice
   * se quedaba clavado en la primera para siempre. Ahora las tarjetas son hijas
   * directas y se miden ellas.
   */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let pendiente = 0;
    const sync = () => {
      pendiente = 0;
      const pista = track.getBoundingClientRect();
      const centro = pista.left + pista.width / 2;
      let mejor = 0;
      let menor = Infinity;
      Array.from(track.children).forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - centro);
        if (d < menor) {
          menor = d;
          mejor = i;
        }
      });
      setActive((prev) => (prev === mejor ? prev : mejor));
    };
    const onScroll = () => {
      if (pendiente) return;
      pendiente = requestAnimationFrame(sync);
    };

    sync();
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (pendiente) cancelAnimationFrame(pendiente);
    };
  }, [cards.length]);

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
  const irA = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const target = track.children[Math.max(0, Math.min(track.children.length - 1, i))] as
      | HTMLElement
      | undefined;
    if (!target) return;
    // `smooth` solo si el usuario no ha pedido menos movimiento: el CSS ya lo cubre para
    // el scroll nativo, pero scrollTo con behavior explícito lo ignoraría.
    const menosMovimiento =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({
      left: target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2,
      behavior: menosMovimiento ? "auto" : "smooth",
    });
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    irA(e.key === "ArrowRight" ? active + 1 : active - 1);
  };

  const activeName = cards[active]?.name ?? "";

  return (
    <div className="m-carousel-wrap">
      {/* Marca de agua: vive en el FONDO del carrusel, no dentro de la pista, así que
          no se desplaza con las tarjetas — ellas pasan por delante. Es lo que le da al
          cristal algo que refractar; sin ella el efecto no se percibiría sobre un
          lienzo plano. */}
      <span className="m-carousel-mark" aria-hidden />

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
        {/* Las tarjetas son hijas DIRECTAS de la pista: cualquier envoltorio intermedio
            rompe la medición del observador (ver la nota del efecto de arriba). */}
        {cards.map((c) => (
          <Fragment key={c.name}>{c.node}</Fragment>
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
