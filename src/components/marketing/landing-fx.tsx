"use client";

import { useEffect } from "react";
import { subscribeHeroProgress } from "@/components/marketing/hero-progress";

/**
 * Efectos de la landing (isla client, no renderiza nada). Tres cosas:
 *
 *  1. el fondo del header aparece al despegarse del tope;
 *  2. las secciones se revelan al entrar en pantalla;
 *  3. el avance del hero desvanece el copy y saca la leyenda de la trasera.
 *
 * El (3) sale del mismo `hero-progress` que gira el teléfono, así el copy y el giro nunca se
 * desincronizan. Y el desvanecido se publica como VARIABLE CSS (`--lp-fade`) en vez de escribir
 * estilos inline: el cómo se ve queda en la hoja de estilos y acá solo viaja el número.
 */
export function LandingFx() {
  useEffect(() => {
    const raiz = document.querySelector<HTMLElement>(".lp");
    const hdr = document.getElementById("lp-hdr");
    const leyenda = document.getElementById("lp-back-caption");

    const alScrollear = () => hdr?.classList.toggle("scrolled", window.scrollY > 8);
    alScrollear();
    window.addEventListener("scroll", alScrollear, { passive: true });

    const io = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );
    document.querySelectorAll(".lp .reveal:not(.in)").forEach((el) => io.observe(el));

    const desuscribir = subscribeHeroProgress((p) => {
      // El copy recién empieza a irse pasado el 12% del recorrido: antes de eso el usuario todavía
      // está leyendo el titular, y desvanecerlo de inmediato se siente como que se le escapa.
      const fade = Math.min(1, Math.max(0, (p - 0.12) / 0.3));
      raiz?.style.setProperty("--lp-fade", fade.toFixed(3));
      // La leyenda solo tiene sentido mientras se ve la trasera; se va antes del final para no
      // quedar pegada encima de la sección siguiente.
      leyenda?.classList.toggle("show", p > 0.74 && p < 0.98);
    });

    return () => {
      window.removeEventListener("scroll", alScrollear);
      io.disconnect();
      desuscribir();
      raiz?.style.removeProperty("--lp-fade");
    };
  }, []);

  return null;
}
