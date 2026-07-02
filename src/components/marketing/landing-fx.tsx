"use client";

import { useEffect } from "react";

/**
 * Efectos de la landing (isla client, no renderiza nada):
 * borde del header al hacer scroll + animación reveal-on-scroll.
 */
export function LandingFx() {
  useEffect(() => {
    const hdr = document.getElementById("lp-hdr");
    const onScroll = () => hdr?.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll(".lp .reveal:not(.in)").forEach((el) => io.observe(el));

    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  return null;
}
