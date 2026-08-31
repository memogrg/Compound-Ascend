"use client";

import { useEffect } from "react";

/**
 * Efectos de la landing (isla client, no renderiza nada). Dos cosas:
 *
 *  1. el fondo del header aparece al despegarse del tope;
 *  2. las secciones se revelan al entrar en pantalla.
 *
 * El hero ya no depende del scroll: el teléfono gira por tiempo, en su propia caja dentro del
 * flujo. Por eso acá no queda nada que medir del recorrido.
 */
export function LandingFx() {
  useEffect(() => {
    const hdr = document.getElementById("lp-hdr");

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

    return () => {
      window.removeEventListener("scroll", alScrollear);
      io.disconnect();
    };
  }, []);

  return null;
}
